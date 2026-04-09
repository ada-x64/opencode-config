import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { tmpdir, homedir } from "os";
import path from "path";

import {
  assertSafeProfileName,
  parseEnvFile,
  resolveProfileFile,
  resolveProfilesConfig,
  loadProfiles,
  resolveSecretPlaceholder,
  type ProfileData,
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
      it(`rejects ${desc}: "${name.replace(/\x00/g, "\\x00")}"`, () => {
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

beforeAll(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "install-test-"));
  profilesDir = path.join(tmp, "profiles");

  // Create directory structure:
  //   profiles/host.env
  //   profiles/gh.env
  //   profiles/gh/specific.env
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

// --- resolveProfilesConfig ---

describe("resolveProfilesConfig", () => {
  it("returns CLI flag when provided", () => {
    const result = resolveProfilesConfig("/custom/path.toml", undefined);
    expect(result).toBe("/custom/path.toml");
  });

  it("returns env var when CLI flag is empty", () => {
    const result = resolveProfilesConfig("", "/env/path.toml");
    expect(result).toBe("/env/path.toml");
  });

  it("returns default when both are empty/undefined", () => {
    const result = resolveProfilesConfig("", undefined);
    const home = Bun.env.HOME ?? homedir();
    expect(result).toBe(
      path.join(home, ".config", "opencode-config", "profiles.toml"),
    );
  });

  it("prefers CLI flag over env var", () => {
    const result = resolveProfilesConfig("/cli/path.toml", "/env/path.toml");
    expect(result).toBe("/cli/path.toml");
  });
});

// --- loadProfiles ---

describe("loadProfiles", () => {
  let profilesConfig: string;
  let vaultDir: string;

  beforeAll(async () => {
    vaultDir = path.join(tmp, "profiles-vault");
    await mkdir(path.join(vaultDir, "_misc", "cache"), { recursive: true });
  });

  it("reads GH_TOKEN from profile section", async () => {
    profilesConfig = path.join(tmp, "profiles-1.toml");
    await writeFile(
      profilesConfig,
      '[default]\nGH_TOKEN = "default-token"\n\n[profiles."gh/alice"]\nGH_TOKEN = "alice-token"\n',
    );
    const result = loadProfiles("gh/alice", profilesConfig, vaultDir);
    expect(result.GH_TOKEN).toBe("alice-token");
  });

  it("falls back to default section", async () => {
    profilesConfig = path.join(tmp, "profiles-2.toml");
    await writeFile(
      profilesConfig,
      '[default]\nGH_TOKEN = "default-token"\n',
    );
    const result = loadProfiles("gh/bob", profilesConfig, vaultDir);
    expect(result.GH_TOKEN).toBe("default-token");
  });

  it("returns undefined when key not in file", async () => {
    profilesConfig = path.join(tmp, "profiles-3.toml");
    await writeFile(profilesConfig, "[default]\n");
    const result = loadProfiles("gh/bob", profilesConfig, vaultDir);
    expect(result.GH_TOKEN).toBeUndefined();
  });

  it("falls back to vault cache for NTFY_TOPIC", async () => {
    profilesConfig = path.join(tmp, "profiles-4.toml");
    await writeFile(profilesConfig, "[default]\n");
    await writeFile(
      path.join(vaultDir, "_misc", "cache", "ntfy-topic.txt"),
      "cached-topic\n",
    );
    const result = loadProfiles("host", profilesConfig, vaultDir);
    expect(result.NTFY_TOPIC).toBe("cached-topic");
  });

  it("reads docker user fields from profile", async () => {
    profilesConfig = path.join(tmp, "profiles-5.toml");
    await writeFile(
      profilesConfig,
      '[profiles."gh/alice".docker]\nusername = "alice"\ngroup = "agents"\nuid = 1000\ngid = 1000\n',
    );
    const result = loadProfiles("gh/alice", profilesConfig, vaultDir);
    expect(result.SANDBOX_USER).toBe("alice");
    expect(result.SANDBOX_GROUP).toBe("agents");
    expect(result.SANDBOX_UID).toBe("1000");
    expect(result.SANDBOX_GID).toBe("1000");
  });

  it("reads gitconfig from profile", async () => {
    profilesConfig = path.join(tmp, "profiles-6.toml");
    await writeFile(
      profilesConfig,
      '[profiles."gh/alice"]\ngitconfig = "/home/alice/.gitconfig"\n',
    );
    const result = loadProfiles("gh/alice", profilesConfig, vaultDir);
    expect(result.gitconfig).toBe("/home/alice/.gitconfig");
  });

  it("returns all undefined when profiles.toml does not exist", () => {
    const result = loadProfiles(
      "host",
      path.join(tmp, "nonexistent.toml"),
      vaultDir,
    );
    expect(result.GH_TOKEN).toBeUndefined();
    expect(result.SANDBOX_USER).toBeUndefined();
  });
});

// --- resolveSecretPlaceholder ---

describe("resolveSecretPlaceholder", () => {
  it("replaces placeholder when value is defined", () => {
    const content = '    "GH_TOKEN={{GH_TOKEN}}",\n    "OTHER=value",\n';
    const result = resolveSecretPlaceholder(content, "GH_TOKEN", "my-token");
    expect(result).toContain('"GH_TOKEN=my-token"');
    expect(result).not.toContain("{{GH_TOKEN}}");
  });

  it("removes the line when value is undefined", () => {
    const content =
      '    "KEY1=val1",\n    "GH_TOKEN={{GH_TOKEN}}",\n    "KEY2=val2",\n';
    const result = resolveSecretPlaceholder(content, "GH_TOKEN", undefined);
    expect(result).not.toContain("GH_TOKEN");
    expect(result).toContain("KEY1");
    expect(result).toContain("KEY2");
  });

  it("removes preceding comment line that mentions the key", () => {
    const content =
      '    # GH_TOKEN: resolved at install time\n    "GH_TOKEN={{GH_TOKEN}}",\n    "OTHER=val",\n';
    const result = resolveSecretPlaceholder(content, "GH_TOKEN", undefined);
    expect(result).not.toContain("GH_TOKEN");
    expect(result).toContain("OTHER");
  });

  it("handles multiple occurrences when value is defined", () => {
    const content = "a={{GH_TOKEN}}\nb={{GH_TOKEN}}\n";
    const result = resolveSecretPlaceholder(content, "GH_TOKEN", "tok");
    expect(result).toBe("a=tok\nb=tok\n");
  });
});
