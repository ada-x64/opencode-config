import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "fs";
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
