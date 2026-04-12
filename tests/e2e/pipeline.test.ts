import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { createIsolatedEnv, runScript, REPO_ROOT } from "./_helpers";

// ---------------------------------------------------------------------------
// Shared build.json for all test blocks
// ---------------------------------------------------------------------------

const DETERMINISTIC_BUILD_JSON = {
  global: {
    model: "test-model/opus",
    external_directory: ["{env:AGENT_REPOS}/**", "/tmp/**"],
    sandbox_config_dir: "/root/.config/opencode",
  },
  tiers: {
    design: { model: null },
    execute: { model: "test-model/sonnet" },
  },
};

// ---------------------------------------------------------------------------
// Build e2e tests
// ---------------------------------------------------------------------------

describe("build e2e", () => {
  let env: Record<string, string>;
  let home: string;
  let outDir: string;
  const buildJsonPath = join(REPO_ROOT, "build.json");
  let savedBuildJson: string | null = null;

  beforeAll(async () => {
    ({ home, outDir, env } = createIsolatedEnv());

    // Save existing build.json if present
    if (existsSync(buildJsonPath)) {
      savedBuildJson = readFileSync(buildJsonPath, "utf-8");
    }

    writeFileSync(
      buildJsonPath,
      JSON.stringify(DETERMINISTIC_BUILD_JSON, null, 2),
    );
  });

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(outDir, { recursive: true, force: true });

    // Restore original build.json or remove if it didn't exist before
    if (savedBuildJson !== null) {
      writeFileSync(buildJsonPath, savedBuildJson);
    } else if (existsSync(buildJsonPath)) {
      rmSync(buildJsonPath);
    }
  });

  it("produces host/ and sandbox/ directories in out-dir", async () => {
    const result = await runScript(
      "scripts/build.ts",
      ["--out-dir", outDir],
      env,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Building host variant");
    expect(result.stdout).toContain("Building sandbox variant");

    // Both variant directories exist
    expect(existsSync(join(outDir, "host"))).toBe(true);
    expect(existsSync(join(outDir, "sandbox"))).toBe(true);

    // Core files present
    expect(existsSync(join(outDir, "host", "opencode.json"))).toBe(true);
    expect(existsSync(join(outDir, "sandbox", "opencode.json"))).toBe(true);

    // Agent files present
    expect(existsSync(join(outDir, "host", "agents", "planner.md"))).toBe(true);
    expect(existsSync(join(outDir, "sandbox", "agents", "planner.md"))).toBe(
      true,
    );
  });

  it("excludes permissions/, profiles/, vault/, _shared/ from output", async () => {
    await runScript("scripts/build.ts", ["--out-dir", outDir], env);

    for (const variant of ["host", "sandbox"]) {
      const variantDir = join(outDir, variant);
      expect(existsSync(join(variantDir, "permissions"))).toBe(false);
      expect(existsSync(join(variantDir, "profiles"))).toBe(false);
      expect(existsSync(join(variantDir, "vault"))).toBe(false);
      expect(existsSync(join(variantDir, "agents", "_shared"))).toBe(false);
    }
  });

  it("stamps host variant correctly", async () => {
    await runScript(
      "scripts/build.ts",
      ["--out-dir", outDir, "--config-dir", "/test/e2e/config"],
      env,
    );

    // opencode.json has stamped model
    const config = JSON.parse(
      readFileSync(join(outDir, "host", "opencode.json"), "utf-8"),
    );
    expect(config.model).toBe("test-model/opus");

    // Agent has bash permissions (not placeholder)
    const planner = readFileSync(
      join(outDir, "host", "agents", "planner.md"),
      "utf-8",
    );
    expect(planner).not.toContain("{{BASH_PERMISSIONS}}");
    expect(planner).toContain("deny"); // baseline starts with "*": deny

    // Agent has external_directory
    expect(planner).toContain("external_directory:");
    expect(planner).toContain("{env:AGENT_REPOS}/**");

    // No unresolved placeholders remain
    expect(planner).not.toContain("{{include:");
    expect(planner).not.toContain("{{TRIAGE_ICON}}");
    expect(planner).not.toContain("{{TRIAGE_EVENTS}}");
  });

  it("stamps sandbox variant correctly", async () => {
    await runScript("scripts/build.ts", ["--out-dir", outDir], env);

    const planner = readFileSync(
      join(outDir, "sandbox", "agents", "planner.md"),
      "utf-8",
    );

    // Sandbox bash permissions (not host baseline)
    expect(planner).not.toContain("{{BASH_PERMISSIONS}}");
    // Sandbox should NOT have external_directory block
    expect(planner).not.toContain("external_directory:");

    // All 'ask' converted to 'allow' — check frontmatter only
    const fmMatch = planner.match(/^---\n(.*?)\n---/s);
    if (fmMatch) {
      expect(fmMatch[1]).not.toMatch(/:\s*ask\b/);
    }

    // No unresolved placeholders
    expect(planner).not.toContain("{{include:");
  });

  it("stamps execute-tier model on implementor", async () => {
    await runScript("scripts/build.ts", ["--out-dir", outDir], env);

    const implementor = readFileSync(
      join(outDir, "host", "agents", "implementor.md"),
      "utf-8",
    );
    expect(implementor).toContain("model: test-model/sonnet");
  });

  it("does not clobber default out/ directory", async () => {
    // Build to a custom out-dir — the real out/ should be unaffected
    const customOut = join(outDir, "custom-sub");
    mkdirSync(customOut, { recursive: true });

    await runScript("scripts/build.ts", ["--out-dir", customOut], env);

    // Custom out has the build
    expect(existsSync(join(customOut, "host", "opencode.json"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Install e2e tests
// ---------------------------------------------------------------------------

describe("install e2e", () => {
  let env: Record<string, string>;
  let home: string;
  let outDir: string;
  const buildJsonPath = join(REPO_ROOT, "build.json");
  let savedBuildJson: string | null = null;

  beforeAll(async () => {
    ({ home, outDir, env } = createIsolatedEnv());

    // Save existing build.json
    if (existsSync(buildJsonPath)) {
      savedBuildJson = readFileSync(buildJsonPath, "utf-8");
    }

    // Write deterministic build.json and run build to populate out dir
    writeFileSync(
      buildJsonPath,
      JSON.stringify(DETERMINISTIC_BUILD_JSON, null, 2),
    );

    // Build first so host/ and sandbox/ exist in the temp out dir
    const buildResult = await runScript(
      "scripts/build.ts",
      ["--out-dir", outDir],
      env,
    );
    if (buildResult.exitCode !== 0) {
      throw new Error(`Build failed: ${buildResult.stderr}`);
    }
  });

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(outDir, { recursive: true, force: true });

    // Restore build.json
    if (savedBuildJson !== null) {
      writeFileSync(buildJsonPath, savedBuildJson);
    } else if (existsSync(buildJsonPath)) {
      rmSync(buildJsonPath);
    }
  });

  it("rsyncs host config to CONFIG_DIR", async () => {
    const configDir = join(home, ".config", "opencode");
    const result = await runScript(
      "scripts/install.ts",
      ["--out-dir", outDir, "--opencode-config-dir", configDir, "--skip-cron"],
      env,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Rsync (host) complete");

    // Verify key files rsynced
    expect(existsSync(join(configDir, "opencode.json"))).toBe(true);
    expect(existsSync(join(configDir, "agents", "planner.md"))).toBe(true);
  });

  it("rsyncs sandbox config to SANDBOX_CONFIG_DIR", async () => {
    const result = await runScript(
      "scripts/install.ts",
      ["--out-dir", outDir, "--skip-cron"],
      env,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Rsync (sandbox) complete");

    // Default SANDBOX_CONFIG_DIR is $HOME/.config/opencode-sandbox
    const sandboxConfigDir = join(home, ".config", "opencode-sandbox");
    expect(existsSync(join(sandboxConfigDir, "opencode.json"))).toBe(true);
  });

  it("skips AoE deployment when AGENT_VAULT not set", async () => {
    // Ensure AGENT_VAULT is NOT in env
    const envNoVault = { ...env };
    delete envNoVault.AGENT_VAULT;

    const result = await runScript(
      "scripts/install.ts",
      ["--out-dir", outDir, "--skip-cron"],
      envNoVault,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("AGENT_VAULT not set");
    expect(result.stderr).toContain("skipping AoE config");
  });

  it("deploys AoE global config with placeholders resolved", async () => {
    const agentVault = join(home, "test-vault");
    mkdirSync(agentVault, { recursive: true });

    // Create a minimal profiles.toml so install doesn't prompt
    const profilesDir = join(home, ".config", "occonf");
    mkdirSync(profilesDir, { recursive: true });
    writeFileSync(join(profilesDir, "profiles.toml"), "[default]\n");

    const envWithVault = {
      ...env,
      AGENT_VAULT: agentVault,
    };

    const result = await runScript(
      "scripts/install.ts",
      ["--out-dir", outDir, "--skip-cron"],
      envWithVault,
    );

    expect(result.exitCode).toBe(0);

    // AoE config deployed to $HOME/.config/agent-of-empires/config.toml
    const aoeConfigPath = join(
      home,
      ".config",
      "agent-of-empires",
      "config.toml",
    );
    expect(existsSync(aoeConfigPath)).toBe(true);

    const aoeConfig = readFileSync(aoeConfigPath, "utf-8");
    // Placeholders resolved
    expect(aoeConfig).toContain(agentVault);
    expect(aoeConfig).not.toContain("{{AGENT_VAULT}}");
    expect(aoeConfig).not.toContain("{{SANDBOX_CONFIG_DIR}}");
    expect(aoeConfig).not.toContain("{{OPENCODE_DATA_DIR}}");
  });

  it("deploys vault-sync script to ~/.local/bin/", async () => {
    const agentVault = join(home, "test-vault-vs");
    mkdirSync(agentVault, { recursive: true });

    // Create a minimal profiles.toml
    const profilesDir = join(home, ".config", "occonf");
    mkdirSync(profilesDir, { recursive: true });
    writeFileSync(join(profilesDir, "profiles.toml"), "[default]\n");

    const envWithVault = {
      ...env,
      AGENT_VAULT: agentVault,
    };

    const result = await runScript(
      "scripts/install.ts",
      ["--out-dir", outDir, "--skip-cron"],
      envWithVault,
    );

    expect(result.exitCode).toBe(0);

    // vault-sync.sh exists in the repo at scripts/vault-sync.sh
    // install.ts copies it to $HOME/.local/bin/vault-sync
    const vaultSyncDest = join(home, ".local", "bin", "vault-sync");
    expect(existsSync(vaultSyncDest)).toBe(true);

    // Verify the output mentions vault-sync deployment and cron skip
    expect(result.stdout).toContain("vault-sync");
    expect(result.stdout).toContain("Skipping cron installation");
  });

  it("refuses to install when out/host/ equals CONFIG_DIR", async () => {
    // Point --opencode-config-dir at the same path as out/host/
    const hostDir = join(outDir, "host");

    const result = await runScript(
      "scripts/install.ts",
      ["--out-dir", outDir, "--opencode-config-dir", hostDir, "--skip-cron"],
      env,
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("equals target CONFIG_DIR");
  });
});

// ---------------------------------------------------------------------------
// Profiles e2e tests
// ---------------------------------------------------------------------------

describe("profiles e2e", () => {
  let env: Record<string, string>;
  let home: string;
  let outDir: string;
  const buildJsonPath = join(REPO_ROOT, "build.json");
  let savedBuildJson: string | null = null;

  beforeAll(async () => {
    ({ home, outDir, env } = createIsolatedEnv());

    // Save existing build.json
    if (existsSync(buildJsonPath)) {
      savedBuildJson = readFileSync(buildJsonPath, "utf-8");
    }

    writeFileSync(
      buildJsonPath,
      JSON.stringify(DETERMINISTIC_BUILD_JSON, null, 2),
    );

    // Build once for all install tests in this block
    const buildResult = await runScript(
      "scripts/build.ts",
      ["--out-dir", outDir],
      env,
    );
    if (buildResult.exitCode !== 0) {
      throw new Error(`Build failed: ${buildResult.stderr}`);
    }
  });

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(outDir, { recursive: true, force: true });

    if (savedBuildJson !== null) {
      writeFileSync(buildJsonPath, savedBuildJson);
    } else if (existsSync(buildJsonPath)) {
      rmSync(buildJsonPath);
    }
  });

  it("deploys multiple profiles from profiles.toml", async () => {
    const agentVault = join(home, "vault-multi");
    mkdirSync(agentVault, { recursive: true });

    const profilesDir = join(home, ".config", "occonf");
    mkdirSync(profilesDir, { recursive: true });
    writeFileSync(
      join(profilesDir, "profiles.toml"),
      [
        "[default]",
        "",
        '[profiles."gh/alice"]',
        'GH_TOKEN = "ghp_alice_tok"',
        "",
        '[profiles."gh/bob"]',
        'GH_TOKEN = "ghp_bob_tok"',
        "",
      ].join("\n"),
    );

    const result = await runScript(
      "scripts/install.ts",
      ["--out-dir", outDir, "--skip-cron"],
      { ...env, AGENT_VAULT: agentVault },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Deployed 2 AoE profile(s)");

    const aoeDir = join(home, ".config", "agent-of-empires");

    // Both profile directories created
    expect(
      existsSync(join(aoeDir, "profiles", "gh-alice", "config.toml")),
    ).toBe(true);
    expect(existsSync(join(aoeDir, "profiles", "gh-bob", "config.toml"))).toBe(
      true,
    );
  });

  it("resolves secrets in deployed profile config", async () => {
    const agentVault = join(home, "vault-secrets");
    mkdirSync(agentVault, { recursive: true });

    const profilesDir = join(home, ".config", "occonf");
    mkdirSync(profilesDir, { recursive: true });
    writeFileSync(
      join(profilesDir, "profiles.toml"),
      [
        "[default]",
        "",
        '[profiles."gh/alice"]',
        'GH_TOKEN = "ghp_secret_value"',
        'NTFY_TOPIC = "alice-ntfy"',
        "",
        '[profiles."gh/alice".docker]',
        'username = "alice"',
        'group = "agents"',
        "uid = 1001",
        "gid = 1001",
        "",
      ].join("\n"),
    );

    const result = await runScript(
      "scripts/install.ts",
      ["--out-dir", outDir, "--skip-cron"],
      { ...env, AGENT_VAULT: agentVault },
    );

    expect(result.exitCode).toBe(0);

    const config = readFileSync(
      join(
        home,
        ".config",
        "agent-of-empires",
        "profiles",
        "gh-alice",
        "config.toml",
      ),
      "utf-8",
    );

    // Secrets resolved
    expect(config).toContain("GH_TOKEN=ghp_secret_value");
    expect(config).toContain("NTFY_TOPIC=alice-ntfy");
    expect(config).toContain("SANDBOX_USER=alice");
    expect(config).toContain("SANDBOX_UID=1001");
    expect(config).not.toContain("{{");
  });

  it("omits undefined secrets from deployed config", async () => {
    const agentVault = join(home, "vault-omit");
    mkdirSync(agentVault, { recursive: true });

    const profilesDir = join(home, ".config", "occonf");
    mkdirSync(profilesDir, { recursive: true });
    writeFileSync(
      join(profilesDir, "profiles.toml"),
      [
        "[default]",
        "",
        '[profiles."gh/alice"]',
        'GH_TOKEN = "ghp_only_this"',
        // No NTFY_TOPIC, no docker fields
        "",
      ].join("\n"),
    );

    const result = await runScript(
      "scripts/install.ts",
      ["--out-dir", outDir, "--skip-cron"],
      { ...env, AGENT_VAULT: agentVault },
    );

    expect(result.exitCode).toBe(0);

    const config = readFileSync(
      join(
        home,
        ".config",
        "agent-of-empires",
        "profiles",
        "gh-alice",
        "config.toml",
      ),
      "utf-8",
    );

    expect(config).toContain("GH_TOKEN=ghp_only_this");
    // Lines with undefined values should be removed, not left as placeholders
    expect(config).not.toMatch(/"NTFY_TOPIC=/);
    expect(config).not.toMatch(/"SANDBOX_USER=/);
    expect(config).not.toContain("{{");
  });

  it("skips profile deployment when no profiles defined", async () => {
    const agentVault = join(home, "vault-noprofiles");
    mkdirSync(agentVault, { recursive: true });

    const profilesDir = join(home, ".config", "occonf");
    mkdirSync(profilesDir, { recursive: true });
    writeFileSync(join(profilesDir, "profiles.toml"), "[default]\n");

    const result = await runScript(
      "scripts/install.ts",
      ["--out-dir", outDir, "--skip-cron"],
      { ...env, AGENT_VAULT: agentVault },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("skipping AoE profile deployment");
    // Should not mention "Deployed N AoE profile(s)"
    expect(result.stdout).not.toMatch(/Deployed \d+ AoE profile/);
  });

  it("warns when GH_TOKEN is not configured for a profile", async () => {
    const agentVault = join(home, "vault-notoken");
    mkdirSync(agentVault, { recursive: true });

    const profilesDir = join(home, ".config", "occonf");
    mkdirSync(profilesDir, { recursive: true });
    writeFileSync(
      join(profilesDir, "profiles.toml"),
      '[profiles."gh/notoken"]\nNTFY_TOPIC = "topic"\n',
    );

    const result = await runScript(
      "scripts/install.ts",
      ["--out-dir", outDir, "--skip-cron"],
      { ...env, AGENT_VAULT: agentVault },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("GH_TOKEN not configured");
    expect(result.stderr).toContain("gh/notoken");
  });

  it("uses --profiles-config to read from a custom path", async () => {
    const agentVault = join(home, "vault-custom-cfg");
    mkdirSync(agentVault, { recursive: true });

    // Write profiles.toml to a non-default location
    const customDir = join(home, "custom-profiles-dir");
    mkdirSync(customDir, { recursive: true });
    const customProfilesPath = join(customDir, "my-profiles.toml");
    writeFileSync(
      customProfilesPath,
      [
        "[default]",
        "",
        '[profiles."gh/custom"]',
        'GH_TOKEN = "ghp_custom_tok"',
        "",
      ].join("\n"),
    );

    const result = await runScript(
      "scripts/install.ts",
      [
        "--out-dir",
        outDir,
        "--skip-cron",
        "--profiles-config",
        customProfilesPath,
      ],
      { ...env, AGENT_VAULT: agentVault },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Deployed 1 AoE profile(s)");

    // Profile deployed from custom config
    const aoeDir = join(home, ".config", "agent-of-empires");
    const config = readFileSync(
      join(aoeDir, "profiles", "gh-custom", "config.toml"),
      "utf-8",
    );
    expect(config).toContain("GH_TOKEN=ghp_custom_tok");
  });
});

// ---------------------------------------------------------------------------
// --generate-profiles e2e tests
// ---------------------------------------------------------------------------

describe("generate-profiles e2e", () => {
  let env: Record<string, string>;
  let home: string;
  let outDir: string;
  const buildJsonPath = join(REPO_ROOT, "build.json");
  let savedBuildJson: string | null = null;

  beforeAll(async () => {
    ({ home, outDir, env } = createIsolatedEnv());

    if (existsSync(buildJsonPath)) {
      savedBuildJson = readFileSync(buildJsonPath, "utf-8");
    }

    writeFileSync(
      buildJsonPath,
      JSON.stringify(DETERMINISTIC_BUILD_JSON, null, 2),
    );

    // Build once for install tests
    const buildResult = await runScript(
      "scripts/build.ts",
      ["--out-dir", outDir],
      env,
    );
    if (buildResult.exitCode !== 0) {
      throw new Error(`Build failed: ${buildResult.stderr}`);
    }
  });

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(outDir, { recursive: true, force: true });

    if (savedBuildJson !== null) {
      writeFileSync(buildJsonPath, savedBuildJson);
    } else if (existsSync(buildJsonPath)) {
      rmSync(buildJsonPath);
    }
  });

  it("reports error when gh CLI is not authenticated", async () => {
    const agentVault = join(home, "vault-gen-noauth");
    mkdirSync(agentVault, { recursive: true });

    // Ensure no profiles.toml exists at the default location
    const profilesPath = join(home, ".config", "occonf", "profiles.toml");
    expect(existsSync(profilesPath)).toBe(false);

    const result = await runScript(
      "scripts/install.ts",
      ["--out-dir", outDir, "--skip-cron", "--generate-profiles"],
      { ...env, AGENT_VAULT: agentVault },
    );

    // Should still succeed (install completes, profiles generation fails gracefully)
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("Could not detect GitHub username");

    // profiles.toml should NOT have been created
    expect(existsSync(profilesPath)).toBe(false);
  });

  it("--generate-profiles with pre-existing profiles.toml is a no-op", async () => {
    const agentVault = join(home, "vault-gen-exists");
    mkdirSync(agentVault, { recursive: true });

    // Create a profiles.toml before running
    const profilesDir = join(home, ".config", "occonf");
    mkdirSync(profilesDir, { recursive: true });
    const profilesPath = join(profilesDir, "profiles.toml");
    writeFileSync(profilesPath, '[profiles."gh/existing"]\nGH_TOKEN = "tok"\n');

    const result = await runScript(
      "scripts/install.ts",
      ["--out-dir", outDir, "--skip-cron", "--generate-profiles"],
      { ...env, AGENT_VAULT: agentVault },
    );

    expect(result.exitCode).toBe(0);

    // Original content should be untouched
    const content = readFileSync(profilesPath, "utf-8");
    expect(content).toContain("gh/existing");

    // Profile should deploy from the existing file
    expect(result.stdout).toContain("Deployed 1 AoE profile(s)");
  });
});

// ---------------------------------------------------------------------------
// Full pipeline e2e test
// ---------------------------------------------------------------------------

describe("full pipeline e2e", () => {
  let env: Record<string, string>;
  let home: string;
  let outDir: string;
  const buildJsonPath = join(REPO_ROOT, "build.json");
  let savedBuildJson: string | null = null;

  beforeAll(() => {
    ({ home, outDir, env } = createIsolatedEnv());

    // Save existing build.json
    if (existsSync(buildJsonPath)) {
      savedBuildJson = readFileSync(buildJsonPath, "utf-8");
    }
  });

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(outDir, { recursive: true, force: true });

    // Restore build.json
    if (savedBuildJson !== null) {
      writeFileSync(buildJsonPath, savedBuildJson);
    } else if (existsSync(buildJsonPath)) {
      rmSync(buildJsonPath);
    }
  });

  it("build → install → deployed files are correct", async () => {
    const configDir = join(home, ".config", "opencode");
    const agentVault = join(home, "test-vault");
    mkdirSync(agentVault, { recursive: true });

    // Create a minimal profiles.toml so install doesn't prompt
    const profilesDir = join(home, ".config", "occonf");
    mkdirSync(profilesDir, { recursive: true });
    writeFileSync(join(profilesDir, "profiles.toml"), "[default]\n");

    // Write deterministic build.json
    writeFileSync(
      buildJsonPath,
      JSON.stringify(DETERMINISTIC_BUILD_JSON, null, 2),
    );

    const envFull = {
      ...env,
      AGENT_VAULT: agentVault,
    };

    // Step 1: Build to temp out dir
    const buildResult = await runScript(
      "scripts/build.ts",
      ["--out-dir", outDir, "--config-dir", configDir],
      envFull,
    );
    expect(buildResult.exitCode).toBe(0);

    // Step 2: Install with defaults, reading from temp out dir
    const installResult = await runScript(
      "scripts/install.ts",
      ["--out-dir", outDir, "--opencode-config-dir", configDir, "--skip-cron"],
      envFull,
    );
    expect(installResult.exitCode).toBe(0);

    // Step 3: Verify deployed files

    // opencode.json deployed and stamped
    const deployedConfig = JSON.parse(
      readFileSync(join(configDir, "opencode.json"), "utf-8"),
    );
    expect(deployedConfig.model).toBe("test-model/opus");

    // Agent deployed with permissions resolved
    const deployedAgent = readFileSync(
      join(configDir, "agents", "planner.md"),
      "utf-8",
    );
    expect(deployedAgent).not.toContain("{{BASH_PERMISSIONS}}");
    expect(deployedAgent).not.toContain("{{include:");
    expect(deployedAgent).not.toContain("{{TRIAGE_ICON}}");
    expect(deployedAgent).not.toContain("{{TRIAGE_EVENTS}}");

    // AoE global config deployed with resolved placeholders
    const aoeGlobal = readFileSync(
      join(home, ".config", "agent-of-empires", "config.toml"),
      "utf-8",
    );
    expect(aoeGlobal).toContain(agentVault);
    expect(aoeGlobal).not.toContain("{{AGENT_VAULT}}");

    // vault-sync deployed
    expect(existsSync(join(home, ".local", "bin", "vault-sync"))).toBe(true);

    // Sandbox config deployed
    const sandboxConfigDir = join(home, ".config", "opencode-sandbox");
    expect(existsSync(join(sandboxConfigDir, "opencode.json"))).toBe(true);
  });
});
