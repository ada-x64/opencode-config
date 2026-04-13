import { describe, it, expect } from "bun:test";

/**
 * Entrypoint integration tests.
 *
 * These tests run INSIDE the Docker container. They validate the
 * entrypoint.sh behavior by invoking it as a subprocess with
 * different environment configurations.
 */

const ENTRYPOINT = "/usr/local/bin/entrypoint.sh";

/** Run entrypoint.sh with given env and command, return stdout/stderr/exitCode */
async function runEntrypoint(
  env: Record<string, string>,
  cmd: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn([ENTRYPOINT, ...cmd], {
    env: { ...process.env, ...env },
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

export function entrypointTests() {
  describe("root fallback", () => {
    it("runs as root when SANDBOX_USER is not set", async () => {
      const result = await runEntrypoint({}, ["id", "-u"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("0");
    });

    it("runs the provided command as root", async () => {
      const result = await runEntrypoint({}, ["whoami"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("root");
    });
  });

  describe("non-root user via SANDBOX_USER", () => {
    const userEnv = {
      SANDBOX_USER: "testuser",
      SANDBOX_GROUP: "testgroup",
      SANDBOX_UID: "1234",
      SANDBOX_GID: "5678",
    };

    it("creates user with correct UID", async () => {
      const result = await runEntrypoint(userEnv, ["id", "-u"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("1234");
    });

    it("creates user with correct GID", async () => {
      const result = await runEntrypoint(userEnv, ["id", "-g"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("5678");
    });

    it("runs as the specified user (not root)", async () => {
      const result = await runEntrypoint(userEnv, ["whoami"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("testuser");
    });

    it("sets HOME to /home/SANDBOX_USER", async () => {
      const result = await runEntrypoint(userEnv, ["sh", "-c", "echo $HOME"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("/home/testuser");
    });

    it("uses default group name 'agents' when SANDBOX_GROUP is unset", async () => {
      const env = {
        SANDBOX_USER: "defaultgrp",
        SANDBOX_UID: "2000",
        SANDBOX_GID: "2000",
      };
      const result = await runEntrypoint(env, ["id", "-gn"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("agents");
    });
  });

  describe("UID/GID collision with default ubuntu user", () => {
    // ubuntu:24.04 ships with 'ubuntu' at UID 1000 / GID 1000.
    // The entrypoint must evict it before creating the requested user.
    const collisionEnv = {
      SANDBOX_USER: "ada",
      SANDBOX_GROUP: "agents",
      SANDBOX_UID: "1000",
      SANDBOX_GID: "1000",
    };

    it("creates the requested user at UID 1000 despite ubuntu user collision", async () => {
      const result = await runEntrypoint(collisionEnv, ["whoami"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("ada");
    });

    it("creates the requested group at GID 1000 despite ubuntu group collision", async () => {
      const result = await runEntrypoint(collisionEnv, ["id", "-gn"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("agents");
    });

    it("assigns the correct UID", async () => {
      const result = await runEntrypoint(collisionEnv, ["id", "-u"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("1000");
    });

    it("assigns the correct GID", async () => {
      const result = await runEntrypoint(collisionEnv, ["id", "-g"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("1000");
    });
  });

  describe("config symlinks", () => {
    it("symlinks $HOME/.config/opencode → /data/config as root", async () => {
      const result = await runEntrypoint({}, [
        "readlink",
        "-f",
        "/root/.config/opencode",
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("/data/config");
    });

    it("symlinks $HOME/.local/share/opencode → /data/opencode-data as root", async () => {
      const result = await runEntrypoint({}, [
        "readlink",
        "-f",
        "/root/.local/share/opencode",
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("/data/opencode-data");
    });

    it("symlinks into user HOME when SANDBOX_USER is set", async () => {
      const env = {
        SANDBOX_USER: "symlinktest",
        SANDBOX_GROUP: "symlinktest",
        SANDBOX_UID: "5000",
        SANDBOX_GID: "5000",
      };
      const result = await runEntrypoint(env, [
        "readlink",
        "-f",
        "/home/symlinktest/.config/opencode",
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("/data/config");
    });

    it("symlinks opencode data into user HOME when SANDBOX_USER is set", async () => {
      const env = {
        SANDBOX_USER: "symlinktest2",
        SANDBOX_GROUP: "symlinktest2",
        SANDBOX_UID: "5001",
        SANDBOX_GID: "5001",
      };
      const result = await runEntrypoint(env, [
        "readlink",
        "-f",
        "/home/symlinktest2/.local/share/opencode",
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("/data/opencode-data");
    });
  });

  describe("mount points", () => {
    const mountPoints = [
      "/data/vault",
      "/data/config",
      "/data/opencode-data",
      "/workspace",
    ];

    for (const dir of mountPoints) {
      it(`${dir} exists`, async () => {
        const result = await runEntrypoint({}, ["test", "-d", dir]);
        expect(result.exitCode).toBe(0);
      });

      it(`${dir} is writable as root`, async () => {
        const result = await runEntrypoint({}, [
          "sh",
          "-c",
          `touch ${dir}/.write-test && rm ${dir}/.write-test`,
        ]);
        expect(result.exitCode).toBe(0);
      });
    }

    it("mount points are group-writable when SANDBOX_USER is set", async () => {
      const env = {
        SANDBOX_USER: "mounttest",
        SANDBOX_GROUP: "mounttest",
        SANDBOX_UID: "3000",
        SANDBOX_GID: "3000",
      };

      for (const dir of mountPoints) {
        const result = await runEntrypoint(env, [
          "sh",
          "-c",
          `touch ${dir}/.write-test && rm ${dir}/.write-test`,
        ]);
        expect(result.exitCode).toBe(0);
      }
    });
  });
}
