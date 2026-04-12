import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { existsSync, readFileSync, statSync } from "fs";
import { tmpdir, homedir } from "os";
import path from "path";

import {
  resolveProfilesConfig,
  loadProfiles,
  listProfileNames,
  resolveSecretPlaceholder,
  deployAoeProfile,
  sanitizeProfileName,
  buildProfilesContent,
  type ProfileDefaults,
} from "../../scripts/install.ts";

// ---------------------------------------------------------------------------
// Integration tests — filesystem
// ---------------------------------------------------------------------------

let tmp: string;

beforeAll(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "install-test-"));
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
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
    expect(result).toBe(path.join(home, ".config", "occonf", "profiles.toml"));
  });

  it("prefers CLI flag over env var", () => {
    const result = resolveProfilesConfig("/cli/path.toml", "/env/path.toml");
    expect(result).toBe("/cli/path.toml");
  });
});

// --- listProfileNames ---

describe("listProfileNames", () => {
  it("returns profile names from profiles.toml", async () => {
    const cfg = path.join(tmp, "list-profiles-1.toml");
    await writeFile(
      cfg,
      '[profiles."gh/alice"]\nGH_TOKEN = "tok"\n\n[profiles."gh/bob"]\nGH_TOKEN = "tok2"\n',
    );
    expect(listProfileNames(cfg)).toEqual(["gh/alice", "gh/bob"]);
  });

  it("returns empty array when file does not exist", () => {
    expect(listProfileNames(path.join(tmp, "nonexistent.toml"))).toEqual([]);
  });

  it("returns empty array when no profiles section", async () => {
    const cfg = path.join(tmp, "list-profiles-2.toml");
    await writeFile(cfg, "[default]\n");
    expect(listProfileNames(cfg)).toEqual([]);
  });

  it("returns empty array on malformed TOML", async () => {
    const cfg = path.join(tmp, "list-profiles-3.toml");
    await writeFile(cfg, "{{{{invalid toml}}}}");
    expect(listProfileNames(cfg)).toEqual([]);
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
    await writeFile(profilesConfig, '[default]\nGH_TOKEN = "default-token"\n');
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

  it("throws on malformed TOML", async () => {
    const cfg = path.join(tmp, "profiles-malformed.toml");
    await writeFile(cfg, "{{{{invalid toml}}}}");
    expect(() => loadProfiles("host", cfg, vaultDir)).toThrow(
      "Failed to parse",
    );
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

// --- deployAoeProfile ---

describe("deployAoeProfile", () => {
  const REPO_ROOT = path.resolve(import.meta.dir, "../..");
  const profileTemplatePath = path.join(REPO_ROOT, "src", "aoe-profile.toml");

  it("sets mount_ssh = true when profile data has mount_ssh: true", async () => {
    const aoeDir = path.join(tmp, "aoe-gh-mount");
    await mkdir(aoeDir, { recursive: true });

    deployAoeProfile(
      "gh/alice",
      { mount_ssh: true },
      profileTemplatePath,
      aoeDir,
    );

    const config = readFileSync(
      path.join(aoeDir, "profiles", "gh-alice", "config.toml"),
      "utf-8",
    );
    expect(config).toContain("mount_ssh = true");
  });

  it("sets mount_ssh = false when mount_ssh is not set", async () => {
    const aoeDir = path.join(tmp, "aoe-local-mount");
    await mkdir(aoeDir, { recursive: true });

    deployAoeProfile("local", {}, profileTemplatePath, aoeDir);

    const config = readFileSync(
      path.join(aoeDir, "profiles", "local", "config.toml"),
      "utf-8",
    );
    expect(config).toContain("mount_ssh = false");
  });

  it("resolves all secret placeholders when present", async () => {
    const aoeDir = path.join(tmp, "aoe-secrets");
    await mkdir(aoeDir, { recursive: true });

    deployAoeProfile(
      "gh/alice",
      {
        GH_TOKEN: "ghp_test123",
        NTFY_TOPIC: "alice-topic",
        SANDBOX_USER: "alice",
        SANDBOX_GROUP: "agents",
        SANDBOX_UID: "1000",
        SANDBOX_GID: "1000",
      },
      profileTemplatePath,
      aoeDir,
    );

    const config = readFileSync(
      path.join(aoeDir, "profiles", "gh-alice", "config.toml"),
      "utf-8",
    );
    expect(config).toContain("GH_TOKEN=ghp_test123");
    expect(config).toContain("NTFY_TOPIC=alice-topic");
    expect(config).toContain("SANDBOX_USER=alice");
    expect(config).toContain("SANDBOX_GROUP=agents");
    expect(config).toContain("SANDBOX_UID=1000");
    expect(config).toContain("SANDBOX_GID=1000");
    expect(config).not.toContain("{{");
  });

  it("removes lines for undefined secrets", async () => {
    const aoeDir = path.join(tmp, "aoe-undef");
    await mkdir(aoeDir, { recursive: true });

    // Only GH_TOKEN set — everything else should be removed
    deployAoeProfile(
      "gh/alice",
      { GH_TOKEN: "ghp_test123" },
      profileTemplatePath,
      aoeDir,
    );

    const config = readFileSync(
      path.join(aoeDir, "profiles", "gh-alice", "config.toml"),
      "utf-8",
    );
    expect(config).toContain("GH_TOKEN=ghp_test123");
    // Undefined secrets should not appear as values — no placeholder remains
    expect(config).not.toContain("{{NTFY_TOPIC}}");
    expect(config).not.toContain("{{SANDBOX_USER}}");
    expect(config).not.toContain("{{");
    // The actual environment lines for undefined secrets should be removed
    expect(config).not.toMatch(/"NTFY_TOPIC=/);
    expect(config).not.toMatch(/"SANDBOX_USER=/);
  });

  it("copies gitconfig and resolves GITCONFIG_VOLUME", async () => {
    const aoeDir = path.join(tmp, "aoe-gitconfig");
    await mkdir(aoeDir, { recursive: true });

    // Create a fake gitconfig
    const fakeGitconfig = path.join(tmp, "fake-gitconfig");
    await writeFile(fakeGitconfig, "[user]\n  name = Test\n");

    deployAoeProfile(
      "gh/alice",
      { gitconfig: fakeGitconfig },
      profileTemplatePath,
      aoeDir,
    );

    // Gitconfig copied into profile directory
    const copiedGitconfig = path.join(
      aoeDir,
      "profiles",
      "gh-alice",
      "gitconfig",
    );
    expect(existsSync(copiedGitconfig)).toBe(true);
    expect(readFileSync(copiedGitconfig, "utf-8")).toContain("[user]");

    // Copied gitconfig should have 0o644 permissions (readable by container user)
    const gitconfigMode = statSync(copiedGitconfig).mode & 0o777;
    expect(gitconfigMode).toBe(0o644);

    // GITCONFIG_VOLUME resolved to the copy path
    const config = readFileSync(
      path.join(aoeDir, "profiles", "gh-alice", "config.toml"),
      "utf-8",
    );
    expect(config).toContain(`${copiedGitconfig}:/etc/gitconfig:ro`);
    expect(config).not.toContain("{{GITCONFIG_VOLUME}}");
  });

  it("removes GITCONFIG_VOLUME line when no gitconfig", async () => {
    const aoeDir = path.join(tmp, "aoe-no-gitconfig");
    await mkdir(aoeDir, { recursive: true });

    deployAoeProfile("gh/alice", {}, profileTemplatePath, aoeDir);

    const config = readFileSync(
      path.join(aoeDir, "profiles", "gh-alice", "config.toml"),
      "utf-8",
    );
    expect(config).not.toContain("{{GITCONFIG_VOLUME}}");
    // No volume line with /etc/gitconfig
    expect(config).not.toContain("/etc/gitconfig");
  });

  it("converts slash in profile name to dash for directory", async () => {
    const aoeDir = path.join(tmp, "aoe-slash");
    await mkdir(aoeDir, { recursive: true });

    deployAoeProfile("gh/bob", {}, profileTemplatePath, aoeDir);

    expect(
      existsSync(path.join(aoeDir, "profiles", "gh-bob", "config.toml")),
    ).toBe(true);
    // Should NOT create a nested gh/bob/ directory
    expect(
      existsSync(path.join(aoeDir, "profiles", "gh", "bob", "config.toml")),
    ).toBe(false);
  });

  it("writes config with restricted permissions", async () => {
    const aoeDir = path.join(tmp, "aoe-perms");
    await mkdir(aoeDir, { recursive: true });

    deployAoeProfile("gh/alice", {}, profileTemplatePath, aoeDir);

    const configPath = path.join(aoeDir, "profiles", "gh-alice", "config.toml");
    const mode = statSync(configPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});

// --- sanitizeProfileName ---

describe("sanitizeProfileName", () => {
  describe("accepts valid names", () => {
    const valid: [string, string][] = [
      ["host", "host"],
      ["gh", "gh"],
      ["my-profile", "my-profile"],
      ["my.profile", "my.profile"],
      ["Profile1", "Profile1"],
      ["gh/alice", "gh-alice"],
      ["gh/my.user-1", "gh-my.user-1"],
      ["a", "a"],
      ["a/b", "a-b"],
      ["abc123/def456", "abc123-def456"],
    ];

    for (const [input, expected] of valid) {
      it(`"${input}" → "${expected}"`, () => {
        expect(sanitizeProfileName(input)).toBe(expected);
      });
    }
  });

  describe("rejects invalid names", () => {
    const invalid: [string, string][] = [
      ["", "empty"],
      ["..", "dot-dot traversal"],
      [".", "single dot"],
      ["gh/..", "family with dot-dot"],
      ["gh/.", "family with single dot"],
      ["../etc", "relative traversal"],
      ["/etc/passwd", "absolute path"],
      ["a\\b", "backslash"],
      ["a/b/c", "multi-depth"],
      [".hidden", "leading dot"],
      ["-dash", "leading dash"],
      ["_under", "leading underscore"],
      ["gh/.hidden", "family with leading dot"],
      ["gh/-dash", "family with leading dash"],
      [" spaces", "leading space"],
      ["has space", "contains space"],
      ["gh/", "trailing slash"],
      ["/", "bare slash"],
      ["gh//user", "double slash"],
    ];

    for (const [input, desc] of invalid) {
      it(`rejects ${desc}: "${input}"`, () => {
        expect(() => sanitizeProfileName(input)).toThrow();
      });
    }
  });
});

// --- loadProfiles: mount_ssh ---

describe("loadProfiles mount_ssh", () => {
  let vaultDir: string;

  beforeAll(async () => {
    vaultDir = path.join(tmp, "profiles-vault-mount");
    await mkdir(path.join(vaultDir, "_misc", "cache"), { recursive: true });
  });

  it("reads mount_ssh = true from profile section", async () => {
    const cfg = path.join(tmp, "mount-ssh-1.toml");
    await writeFile(cfg, '[profiles."gh/alice"]\nmount_ssh = true\n');
    const result = loadProfiles("gh/alice", cfg, vaultDir);
    expect(result.mount_ssh).toBe(true);
  });

  it("reads mount_ssh = false from profile section", async () => {
    const cfg = path.join(tmp, "mount-ssh-2.toml");
    await writeFile(cfg, '[profiles."local"]\nmount_ssh = false\n');
    const result = loadProfiles("local", cfg, vaultDir);
    expect(result.mount_ssh).toBe(false);
  });

  it("falls back to default section for mount_ssh", async () => {
    const cfg = path.join(tmp, "mount-ssh-3.toml");
    await writeFile(cfg, "[default]\nmount_ssh = true\n");
    const result = loadProfiles("some-profile", cfg, vaultDir);
    expect(result.mount_ssh).toBe(true);
  });

  it("returns undefined when mount_ssh not set anywhere", async () => {
    const cfg = path.join(tmp, "mount-ssh-4.toml");
    await writeFile(cfg, "[default]\n");
    const result = loadProfiles("some-profile", cfg, vaultDir);
    expect(result.mount_ssh).toBeUndefined();
  });
});

// --- buildProfilesContent ---

describe("buildProfilesContent", () => {
  const defaults: ProfileDefaults = {
    ghUsername: "testuser",
    ghToken: "",
    gitconfigPath: null,
    username: "testuser",
    uid: "1000",
    gid: "1000",
  };

  it("generates valid TOML with profile section", () => {
    const content = buildProfilesContent(defaults, "/test/profiles.toml");
    expect(content).toContain('[profiles."gh/testuser"]');
    expect(content).toContain("mount_ssh = true");
    expect(content).toContain('[profiles."gh/testuser".docker]');
    expect(content).toContain('username = "testuser"');
    expect(content).toContain("uid = 1000");
    expect(content).toContain("gid = 1000");
  });

  it("includes GH_TOKEN when provided", () => {
    const withToken = { ...defaults, ghToken: "ghp_test123" };
    const content = buildProfilesContent(withToken, "/test/profiles.toml");
    expect(content).toContain('GH_TOKEN = "ghp_test123"');
  });

  it("omits GH_TOKEN when empty", () => {
    const content = buildProfilesContent(defaults, "/test/profiles.toml");
    expect(content).not.toContain("GH_TOKEN");
  });

  it("includes gitconfig when path is set", () => {
    const withGitconfig = {
      ...defaults,
      gitconfigPath: "/home/test/.gitconfig",
    };
    const content = buildProfilesContent(withGitconfig, "/test/profiles.toml");
    expect(content).toContain('gitconfig = "/home/test/.gitconfig"');
  });

  it("omits gitconfig when path is null", () => {
    const content = buildProfilesContent(defaults, "/test/profiles.toml");
    expect(content).not.toContain("gitconfig");
  });

  it("includes dest path in header comment", () => {
    const content = buildProfilesContent(
      defaults,
      "/custom/path/profiles.toml",
    );
    expect(content).toContain("# Location: /custom/path/profiles.toml");
  });
});
