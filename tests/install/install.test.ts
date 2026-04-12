import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { tmpdir, homedir } from "os";
import path from "path";

import {
  assertSafeProfileName,
  parseEnvFile,
  resolveProfileFile,
  resolveAoeConfig,
} from "../../scripts/install.ts";

// ---------------------------------------------------------------------------
// Pure unit tests — no filesystem
// ---------------------------------------------------------------------------

describe("assertSafeProfileName", () => {
  describe("accepts valid names", () => {
    const valid = [
      "host",
      "gh",
      "my-profile",
      "my.profile",
      "my_profile",
      "Profile1",
      "gh/username",
      "gh/my.user-1",
      "gh/My_User",
      "a",
      "a/b",
      "abc123/def456",
    ];

    for (const name of valid) {
      it(`accepts "${name}"`, () => {
        expect(() => assertSafeProfileName(name)).not.toThrow();
      });
    }
  });

  describe("rejects invalid names", () => {
    const invalid: [string, string][] = [
      ["", "empty string"],
      ["..", "double dot traversal"],
      [".", "single dot"],
      ["...", "triple dot"],
      ["gh/..", "family with dot-dot user"],
      ["gh/.", "family with dot user"],
      ["../etc", "relative traversal"],
      ["/etc/passwd", "absolute path"],
      ["a\\b", "backslash"],
      ["a/b/c", "multi-depth path"],
      [".hidden", "leading dot"],
      ["-dash", "leading dash"],
      ["_under", "leading underscore"],
      ["gh/.hidden", "family with leading-dot user"],
      ["gh/-dash", "family with leading-dash user"],
      [" spaces", "leading space"],
      ["has space", "contains space"],
      ["has\x00null", "contains null byte"],
      ["gh/", "trailing slash"],
      ["/", "bare slash"],
      ["gh//user", "double slash"],
    ];

    for (const [name, desc] of invalid) {
      it(`rejects ${desc}: "${name.replace("\u{0}", "\\x00")}"`, () => {
        expect(() => assertSafeProfileName(name)).toThrow();
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Integration tests — filesystem
// ---------------------------------------------------------------------------

let tmp: string;
let profilesDir: string;
let defaultAoeConfig: string;

beforeAll(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "install-test-"));
  profilesDir = path.join(tmp, "profiles");

  // Create directory structure:
  //   profiles/host.env
  //   profiles/gh.env
  //   profiles/gh/specific.env
  //   profiles/gh.aoe.toml
  //   profiles/gh/specific.aoe.toml
  //   aoe-config.toml (default)
  await mkdir(path.join(profilesDir, "gh"), { recursive: true });

  await writeFile(
    path.join(profilesDir, "host.env"),
    'CONFIG_DIR="/tmp/config"\nOPENCODE_CONFIG_SRC="/tmp/config"\nSANDBOX_CONFIG_DIR="/tmp/sandbox"\n',
  );

  await writeFile(
    path.join(profilesDir, "gh.env"),
    'CONFIG_DIR="/tmp/gh-config"\nOPENCODE_CONFIG_SRC="/tmp/gh-config"\nSANDBOX_CONFIG_DIR="/tmp/gh-sandbox"\n',
  );

  await writeFile(
    path.join(profilesDir, "gh", "specific.env"),
    'CONFIG_DIR="/tmp/specific-config"\nOPENCODE_CONFIG_SRC="/tmp/specific-config"\nSANDBOX_CONFIG_DIR="/tmp/specific-sandbox"\n',
  );

  await writeFile(
    path.join(profilesDir, "gh.aoe.toml"),
    "[sandbox]\nmount_ssh = true\n",
  );

  await writeFile(
    path.join(profilesDir, "gh", "specific.aoe.toml"),
    "[sandbox]\nmount_ssh = true\ncustom = true\n",
  );

  defaultAoeConfig = path.join(tmp, "aoe-config.toml");
  await writeFile(defaultAoeConfig, "[sandbox]\nmount_ssh = false\n");
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

// --- parseEnvFile ---

describe("parseEnvFile", () => {
  it("parses simple KEY=VALUE pairs", () => {
    const result = parseEnvFile(path.join(profilesDir, "host.env"));
    expect(result["CONFIG_DIR"]).toBe("/tmp/config");
    expect(result["OPENCODE_CONFIG_SRC"]).toBe("/tmp/config");
    expect(result["SANDBOX_CONFIG_DIR"]).toBe("/tmp/sandbox");
  });

  it("strips double quotes from values", async () => {
    const envFile = path.join(tmp, "quoted.env");
    await writeFile(envFile, "FOO=\"bar\"\nBAZ='qux'\n");
    const result = parseEnvFile(envFile);
    expect(result["FOO"]).toBe("bar");
    expect(result["BAZ"]).toBe("qux");
  });

  it("skips comments and blank lines", async () => {
    const envFile = path.join(tmp, "comments.env");
    await writeFile(envFile, "# comment\n\nKEY=value\n  # indented comment\n");
    const result = parseEnvFile(envFile);
    expect(Object.keys(result)).toEqual(["KEY"]);
    expect(result["KEY"]).toBe("value");
  });

  it("handles export prefix", async () => {
    const envFile = path.join(tmp, "export.env");
    await writeFile(envFile, "export MY_VAR=hello\n");
    const result = parseEnvFile(envFile);
    expect(result["MY_VAR"]).toBe("hello");
  });

  it("expands $HOME in values", async () => {
    const envFile = path.join(tmp, "home.env");
    await writeFile(envFile, "DIR=$HOME/.config\n");
    const result = parseEnvFile(envFile);
    const home = Bun.env.HOME ?? homedir();
    expect(result["DIR"]).toBe(path.join(home, ".config"));
  });

  it("expands ${HOME} (brace form) in values", async () => {
    const envFile = path.join(tmp, "home-brace.env");
    await writeFile(envFile, "DIR=${HOME}/.config\n");
    const result = parseEnvFile(envFile);
    const home = Bun.env.HOME ?? homedir();
    expect(result["DIR"]).toBe(path.join(home, ".config"));
  });

  it("expands ~ at the start of values", async () => {
    const envFile = path.join(tmp, "tilde.env");
    await writeFile(envFile, "DIR=~/.config\n");
    const result = parseEnvFile(envFile);
    const home = Bun.env.HOME ?? homedir();
    expect(result["DIR"]).toBe(path.join(home, ".config"));
  });

  it("expands bare ~ to home directory", async () => {
    const envFile = path.join(tmp, "bare-tilde.env");
    await writeFile(envFile, "DIR=~\n");
    const result = parseEnvFile(envFile);
    const home = Bun.env.HOME ?? homedir();
    expect(result["DIR"]).toBe(home);
  });

  it("expands forward-references to earlier keys", async () => {
    const envFile = path.join(tmp, "forward-ref.env");
    await writeFile(envFile, "BASE=/opt\nSUB=$BASE/sub\n");
    const result = parseEnvFile(envFile);
    expect(result["BASE"]).toBe("/opt");
    expect(result["SUB"]).toBe("/opt/sub");
  });
});

// --- resolveProfileFile ---

describe("resolveProfileFile", () => {
  it("finds exact match for simple profile name", () => {
    const result = resolveProfileFile("host", profilesDir);
    expect(result).toBe(path.join(profilesDir, "host.env"));
  });

  it("finds exact match for family/user profile", () => {
    const result = resolveProfileFile("gh/specific", profilesDir);
    expect(result).toBe(path.join(profilesDir, "gh", "specific.env"));
  });

  it("falls back to base .env for unknown family member", () => {
    const result = resolveProfileFile("gh/unknown", profilesDir);
    expect(result).toBe(path.join(profilesDir, "gh.env"));
  });

  it("returns null for nonexistent profile", () => {
    const result = resolveProfileFile("nonexistent", profilesDir);
    expect(result).toBeNull();
  });

  it("returns null for nonexistent family", () => {
    const result = resolveProfileFile("nope/user", profilesDir);
    expect(result).toBeNull();
  });
});

// --- resolveAoeConfig ---

describe("resolveAoeConfig", () => {
  it("finds exact profile .aoe.toml for family/user", () => {
    const result = resolveAoeConfig(
      "gh/specific",
      profilesDir,
      defaultAoeConfig,
    );
    expect(result).toBe(path.join(profilesDir, "gh", "specific.aoe.toml"));
  });

  it("falls back to base family .aoe.toml for unknown member", () => {
    const result = resolveAoeConfig(
      "gh/unknown",
      profilesDir,
      defaultAoeConfig,
    );
    expect(result).toBe(path.join(profilesDir, "gh.aoe.toml"));
  });

  it("falls back to default for profile without .aoe.toml", () => {
    const result = resolveAoeConfig("host", profilesDir, defaultAoeConfig);
    expect(result).toBe(defaultAoeConfig);
  });

  it("returns null when nothing exists at any level", async () => {
    const emptyDir = path.join(tmp, "empty-profiles");
    await mkdir(emptyDir, { recursive: true });
    const noDefault = path.join(tmp, "nonexistent-default.toml");
    const result = resolveAoeConfig("anything", emptyDir, noDefault);
    expect(result).toBeNull();
  });

  it("prefers base over default", () => {
    // gh/unknown has no exact but has base — should return base, not default
    const result = resolveAoeConfig(
      "gh/unknown",
      profilesDir,
      defaultAoeConfig,
    );
    expect(result).toBe(path.join(profilesDir, "gh.aoe.toml"));
    expect(result).not.toBe(defaultAoeConfig);
  });
});
