import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { createIsolatedEnv, runScript, REPO_ROOT } from "./_helpers";

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

    // Write a deterministic build.json so no interactive prompt
    const buildJson = {
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
    writeFileSync(buildJsonPath, JSON.stringify(buildJson, null, 2));
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
    expect(planner).not.toContain("{{CONFIG_DIR}}");
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
    expect(planner).not.toContain("{{CONFIG_DIR}}");
    expect(planner).not.toContain("{{include:");
  });
});

// ---------------------------------------------------------------------------
// Shared build.json for install tests
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
    // --profile host uses host.env which sets CONFIG_DIR="$HOME/.config/opencode"
    // HOME is set to temp dir, so rsync target is isolated
    const result = await runScript(
      "scripts/install.ts",
      ["--profile", "host", "--out-dir", outDir],
      env,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Rsync (host) complete");

    // Verify key files rsynced to $HOME/.config/opencode
    const configDir = join(home, ".config", "opencode");
    expect(existsSync(join(configDir, "opencode.json"))).toBe(true);
    expect(existsSync(join(configDir, "agents", "planner.md"))).toBe(true);
  });

  it("rsyncs sandbox config to SANDBOX_CONFIG_DIR", async () => {
    const result = await runScript(
      "scripts/install.ts",
      ["--profile", "host", "--out-dir", outDir],
      env,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Rsync (sandbox) complete");

    // host.env sets SANDBOX_CONFIG_DIR="$HOME/.config/opencode-sandbox"
    const sandboxConfigDir = join(home, ".config", "opencode-sandbox");
    expect(existsSync(join(sandboxConfigDir, "opencode.json"))).toBe(true);
  });

  it("skips AoE deployment when AGENT_VAULT not set", async () => {
    // Ensure AGENT_VAULT is NOT in env — host.env doesn't set it,
    // and we don't pass it in subprocess env, so it's empty
    const envNoVault = { ...env };
    delete envNoVault.AGENT_VAULT;

    const result = await runScript(
      "scripts/install.ts",
      ["--profile", "host", "--out-dir", outDir],
      envNoVault,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("AGENT_VAULT not set");
    expect(result.stderr).toContain("skipping AoE config deployment");
  });

  it("deploys AoE global config with placeholders resolved", async () => {
    const agentVault = join(home, "test-vault");
    mkdirSync(agentVault, { recursive: true });

    const envWithVault = {
      ...env,
      AGENT_VAULT: agentVault,
    };

    const result = await runScript(
      "scripts/install.ts",
      ["--profile", "host", "--out-dir", outDir],
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
    const agentVault = join(home, "test-vault");
    mkdirSync(agentVault, { recursive: true });

    const envWithVault = {
      ...env,
      AGENT_VAULT: agentVault,
    };

    const result = await runScript(
      "scripts/install.ts",
      ["--profile", "host", "--out-dir", outDir],
      envWithVault,
    );

    expect(result.exitCode).toBe(0);

    // vault-sync.sh copied to $HOME/.local/bin/vault-sync
    const vaultSyncDest = join(home, ".local", "bin", "vault-sync");
    expect(existsSync(vaultSyncDest)).toBe(true);

    // Verify the crontab mock was called (no crash from crontab interaction)
    expect(result.stdout).toContain("vault-sync");
  });
});
