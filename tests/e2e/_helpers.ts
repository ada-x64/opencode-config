import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";

/** e2e test root paths */
export const E2E_DIR = import.meta.dir;
export const REPO_ROOT = join(E2E_DIR, "../..");

/** Create an isolated temp HOME and out dir */
export function createIsolatedEnv(): {
  home: string;
  outDir: string;
  env: Record<string, string>;
} {
  const home = mkdtempSync(join(tmpdir(), "e2e-home-"));
  const outDir = mkdtempSync(join(tmpdir(), "e2e-out-"));
  mkdirSync(join(home, ".config"), { recursive: true });
  mkdirSync(join(home, ".local", "bin"), { recursive: true });
  mkdirSync(join(home, ".local", "share"), { recursive: true });
  mkdirSync(join(home, ".local", "log"), { recursive: true });

  const env: Record<string, string> = {
    HOME: home,
    PATH: process.env.PATH ?? "",
    TERM: "dumb",
  };

  return { home, outDir, env };
}

/** Run a script as a subprocess with isolated env */
export async function runScript(
  script: string,
  args: string[],
  env: Record<string, string>,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", "run", script, ...args], {
    env,
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

// ---------------------------------------------------------------------------
// tmux helpers for interactive TUI testing
// ---------------------------------------------------------------------------

/** Assert tmux is installed. Throws with install instructions if missing. */
export function requireTmux(): void {
  const result = spawnSync("tmux", ["-V"], { stdio: "pipe" });
  if (result.status !== 0) {
    throw new Error(
      "tmux is required for interactive tests. Install it: apt-get install -y tmux",
    );
  }
}

/**
 * Create a mock `gh` CLI script in a temp bin directory.
 *
 * The mock handles:
 *   - `gh api user -q .login` → prints the given username
 *   - `gh auth status` → prints "Logged in to github.com account <username>"
 *   - `gh auth token` → prints the given token
 *
 * @returns Absolute path to the bin directory (prepend to PATH)
 */
export function createMockGh(
  dir: string,
  username: string,
  token: string,
): string {
  const binDir = join(dir, "mock-bin");
  mkdirSync(binDir, { recursive: true });

  const script = `#!/bin/bash
if [[ "$1" == "api" && "$2" == "user" ]]; then
  echo "${username}"
elif [[ "$1" == "auth" && "$2" == "status" ]]; then
  echo "Logged in to github.com account ${username}"
elif [[ "$1" == "auth" && "$2" == "token" ]]; then
  echo "${token}"
else
  echo "mock-gh: unhandled: $*" >&2
  exit 1
fi
`;

  const ghPath = join(binDir, "gh");
  writeFileSync(ghPath, script);
  chmodSync(ghPath, 0o755);
  return binDir;
}

/**
 * Start a script inside a tmux session with a real PTY.
 *
 * The command is run via `bun run <script> <args...>` with the given
 * environment. A sentinel file is written on exit so callers can detect
 * completion.
 */
export function startTmuxSession(
  sessionName: string,
  script: string,
  args: string[],
  env: Record<string, string>,
): void {
  // Build env export string for the shell command
  const envExports = Object.entries(env)
    .map(([k, v]) => `${k}=${shellQuote(v)}`)
    .join(" ");

  const cmd = [envExports, "bun", "run", script, ...args].join(" ");

  const result = spawnSync(
    "tmux",
    [
      "new-session",
      "-d",
      "-s",
      sessionName,
      "-x",
      "120",
      "-y",
      "40",
      `${cmd}; sleep 60`,
    ],
    { cwd: REPO_ROOT, stdio: "pipe" },
  );

  if (result.status !== 0) {
    const stderr = result.stderr?.toString() ?? "";
    throw new Error(`Failed to start tmux session "${sessionName}": ${stderr}`);
  }
}

/** Capture the current content of a tmux pane. */
export function captureTmuxPane(sessionName: string): string {
  const result = spawnSync("tmux", ["capture-pane", "-t", sessionName, "-p"], {
    stdio: "pipe",
  });
  return result.stdout?.toString() ?? "";
}

/**
 * Poll a tmux pane until the given text appears, or throw on timeout.
 *
 * @returns The full pane content at the time the text was found
 */
export async function waitForText(
  sessionName: string,
  text: string,
  timeoutMs = 10_000,
  pollMs = 300,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const content = captureTmuxPane(sessionName);
    if (content.includes(text)) return content;
    await Bun.sleep(pollMs);
  }
  const finalContent = captureTmuxPane(sessionName);
  throw new Error(
    `Timed out waiting for "${text}" in tmux session "${sessionName}" after ${timeoutMs}ms.\n` +
      `Final pane content:\n${finalContent}`,
  );
}

/** Send keystrokes to a tmux session. */
export function sendKeys(sessionName: string, keys: string): void {
  spawnSync("tmux", ["send-keys", "-t", sessionName, keys], {
    stdio: "pipe",
  });
}

/** Kill a tmux session. Best-effort — never throws. */
export function killTmuxSession(sessionName: string): void {
  try {
    spawnSync("tmux", ["kill-session", "-t", sessionName], {
      stdio: "pipe",
    });
  } catch {
    // Best-effort cleanup
  }
}

/** Shell-quote a string for use in a tmux command. */
function shellQuote(s: string): string {
  // If no special characters, return as-is
  if (/^[a-zA-Z0-9_./:=@-]+$/.test(s)) return s;
  // Otherwise wrap in single quotes, escaping existing single quotes
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Run a full interactive TUI test scenario.
 *
 * Creates an isolated env, builds, starts install in tmux, drives the
 * prompts via sendKeys, and returns the test home dir for assertions.
 *
 * @param sessionName - Unique tmux session name
 * @param opts.mockGh - If set, creates a mock gh CLI with this username/token
 * @param opts.ghTokenEnv - If set, includes GH_TOKEN in the environment
 * @param opts.extraInstallArgs - Additional args for install.ts
 * @returns Object with home dir path and cleanup function
 */
export async function setupInteractiveTest(
  sessionName: string,
  opts: {
    mockGh?: { username: string; token: string };
    ghTokenEnv?: string;
    extraInstallArgs?: string[];
  } = {},
): Promise<{
  home: string;
  outDir: string;
  env: Record<string, string>;
  cleanup: () => void;
}> {
  const { home, outDir, env } = createIsolatedEnv();

  // Set TERM for TUI rendering
  env.TERM = "xterm-256color";

  // Create vault dir
  const vaultDir = join(home, "vault");
  mkdirSync(vaultDir, { recursive: true });
  env.AGENT_VAULT = vaultDir;

  // Mock gh if requested
  if (opts.mockGh) {
    const mockBinDir = createMockGh(
      home,
      opts.mockGh.username,
      opts.mockGh.token,
    );
    env.PATH = `${mockBinDir}:${env.PATH}`;
  }

  // GH_TOKEN in env if requested
  if (opts.ghTokenEnv) {
    env.GH_TOKEN = opts.ghTokenEnv;
  }

  // Build
  const buildResult = await runScript(
    "scripts/build.ts",
    ["--out-dir", outDir],
    env,
  );
  if (buildResult.exitCode !== 0) {
    throw new Error(`Build failed: ${buildResult.stderr}`);
  }

  // Start install in tmux
  const installArgs = [
    "--out-dir",
    outDir,
    "--skip-cron",
    ...(opts.extraInstallArgs ?? []),
  ];
  startTmuxSession(sessionName, "scripts/install.ts", installArgs, env);

  const cleanup = () => {
    killTmuxSession(sessionName);
    try {
      Bun.spawnSync(["rm", "-rf", home, outDir]);
    } catch {
      // Best-effort
    }
  };

  return { home, outDir, env, cleanup };
}

/** Check if a tmux session still exists (is running). */
export function isTmuxSessionAlive(sessionName: string): boolean {
  const result = spawnSync("tmux", ["has-session", "-t", sessionName], {
    stdio: "pipe",
  });
  return result.status === 0;
}
