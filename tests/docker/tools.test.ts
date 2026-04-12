import { describe, it, expect } from "bun:test";

/**
 * Tool path integration tests.
 *
 * These tests run INSIDE the Docker container. They validate that all
 * expected tools are installed, on PATH, and executable.
 */

const ENTRYPOINT = "/usr/local/bin/entrypoint.sh";

/** Run a command and return stdout/stderr/exitCode */
async function run(
  cmd: string[],
  env?: Record<string, string>,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(cmd, {
    env: env ? { ...process.env, ...env } : undefined,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

/** Read an environment variable via subprocess to get the container's env */
async function getEnv(name: string): Promise<string> {
  const result = await run(["printenv", name]);
  return result.stdout.trim();
}

describe("tool availability", () => {
  const tools = [
    "bun",
    "cargo",
    "rustup",
    "uv",
    "opencode",
    "gosu",
    "yq",
    "gh",
    "node",
    "pnpm",
  ];

  for (const tool of tools) {
    it(`${tool} is on PATH`, async () => {
      const result = await run(["which", tool]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).not.toBe("");
    });
  }
});

describe("tool version checks", () => {
  it("bun --version succeeds", async () => {
    const result = await run(["bun", "--version"]);
    expect(result.exitCode).toBe(0);
  });

  it("cargo --version succeeds", async () => {
    const result = await run(["cargo", "--version"]);
    expect(result.exitCode).toBe(0);
  });

  it("node --version succeeds", async () => {
    const result = await run(["node", "--version"]);
    expect(result.exitCode).toBe(0);
  });

  it("gh --version succeeds", async () => {
    const result = await run(["gh", "--version"]);
    expect(result.exitCode).toBe(0);
  });

  it("uv --version succeeds", async () => {
    const result = await run(["uv", "--version"]);
    expect(result.exitCode).toBe(0);
  });
});

describe("environment variables", () => {
  it("BUN_INSTALL is /opt/bun", async () => {
    expect(await getEnv("BUN_INSTALL")).toBe("/opt/bun");
  });

  it("CARGO_HOME is /opt/cargo", async () => {
    expect(await getEnv("CARGO_HOME")).toBe("/opt/cargo");
  });

  it("RUSTUP_HOME is /opt/rustup", async () => {
    expect(await getEnv("RUSTUP_HOME")).toBe("/opt/rustup");
  });

  it("PATH includes /opt/bun/bin", async () => {
    expect(await getEnv("PATH")).toContain("/opt/bun/bin");
  });

  it("PATH includes /opt/cargo/bin", async () => {
    expect(await getEnv("PATH")).toContain("/opt/cargo/bin");
  });
});

describe("tool paths are shared (not user-specific)", () => {
  it("bun is under /opt/bun", async () => {
    const result = await run(["which", "bun"]);
    expect(result.stdout.trim()).toStartWith("/opt/bun");
  });

  it("cargo is under /opt/cargo", async () => {
    const result = await run(["which", "cargo"]);
    expect(result.stdout.trim()).toStartWith("/opt/cargo");
  });

  it("gosu is under /usr/local/bin", async () => {
    const result = await run(["which", "gosu"]);
    expect(result.stdout.trim()).toBe("/usr/local/bin/gosu");
  });

  it("uv is under /usr/local/bin", async () => {
    const result = await run(["which", "uv"]);
    expect(result.stdout.trim()).toBe("/usr/local/bin/uv");
  });

  it("opencode is under /usr/local/bin", async () => {
    const result = await run(["which", "opencode"]);
    expect(result.stdout.trim()).toBe("/usr/local/bin/opencode");
  });
});

describe("tools work for non-root user", () => {
  const toolChecks = [
    ["bun", "--version"],
    ["cargo", "--version"],
    ["node", "--version"],
    ["gh", "--version"],
    ["uv", "--version"],
    ["yq", "--version"],
  ];

  for (const [tool, ...args] of toolChecks) {
    it(`${tool} works via gosu as non-root`, async () => {
      // Use entrypoint.sh to create a user and run as them
      const result = await run(
        [ENTRYPOINT, tool!, ...args],
        {
          SANDBOX_USER: "tooltest",
          SANDBOX_UID: "4000",
          SANDBOX_GID: "4000",
        },
      );
      expect(result.exitCode).toBe(0);
    });
  }
});
