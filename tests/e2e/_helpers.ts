import { mkdtempSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/** e2e test root paths */
export const E2E_DIR = import.meta.dir;
export const FIXTURES_DIR = join(E2E_DIR, "fixtures");
export const REPO_ROOT = join(E2E_DIR, "../..");
export const MOCK_BIN_DIR = join(FIXTURES_DIR, "bin");

/** Create an isolated temp HOME and out dir with mock bin on PATH */
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
    PATH: `${MOCK_BIN_DIR}:${process.env.PATH}`,
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
