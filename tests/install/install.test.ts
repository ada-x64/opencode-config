import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { tmpdir, homedir } from "os";
import path from "path";

import {
  resolveProfilesConfig,
  loadProfiles,
  listProfileNames,
  resolveSecretPlaceholder,
} from "../../scripts/install.ts";

// ---------------------------------------------------------------------------
// Filesystem setup
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
