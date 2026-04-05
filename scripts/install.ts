#!/usr/bin/env bun
/**
 * install.ts — deploy built config from out/host/ and out/sandbox/ to target directories
 *
 * Usage:
 *   bun scripts/install.ts [--profile <name>] [--config-dir <path>] [--help]
 *
 * Options:
 *   --profile <name>     Profile to use (default: host). Loads src/profiles/<name>.env.
 *   --config-dir <path>  Override CONFIG_DIR from the profile.
 *   --help               Show this help message and exit.
 *
 * Prerequisites:
 *   Run build first to produce the out/ directory.
 *
 * What it does:
 *   1. Loads the selected profile to set CONFIG_DIR, OPENCODE_CONFIG_SRC, and
 *      SANDBOX_CONFIG_DIR.
 *   2. Verifies out/host/ exists (must run build first).
 *   3. Refuses to run if out/host/ == CONFIG_DIR (would be a no-op or destructive).
 *   4. rsyncs out/host/ contents to CONFIG_DIR.
 *   5. rsyncs out/sandbox/ contents to SANDBOX_CONFIG_DIR (if it exists).
 *   6. Deploys AoE config (resolving {{AGENT_VAULT}}, {{OPENCODE_CONFIG_SRC}},
 *      and {{SANDBOX_CONFIG_DIR}}) from src/aoe-config.toml.
 *   7. Prints a deployment summary.
 *
 * Separation of concerns:
 *   - build:     src/ → out/host/ and out/sandbox/ + all stamping
 *   - install:   out/host/ → CONFIG_DIR rsync + out/sandbox/ → SANDBOX_CONFIG_DIR
 *                + AoE config deployment
 *   - Source files in src/ are NEVER modified.
 */

import { parseArgs } from "node:util";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { homedir } from "node:os";
import { $ } from "bun";

// ---------------------------------------------------------------------------
// .env parser
// ---------------------------------------------------------------------------

function parseEnvFile(envPath: string): Record<string, string> {
  const result: Record<string, string> = {};
  const home = Bun.env.HOME ?? homedir();
  const content = readFileSync(envPath, "utf-8");

  for (const rawLine of content.split("\n")) {
    let line = rawLine.trim();

    if (!line || line.startsWith("#")) continue;

    if (line.startsWith("export ")) {
      line = line.slice("export ".length);
    }

    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();

    // Strip outer quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Expand $HOME / ${HOME}
    value = value.replace(/\$HOME|\$\{HOME\}/g, home);

    // Expand ~ at the start
    if (value.startsWith("~/")) {
      value = join(home, value.slice(2));
    } else if (value === "~") {
      value = home;
    }

    // Expand other $VAR / ${VAR} references from already-parsed values
    value = value.replace(
      /\$\{(\w+)\}|\$(\w+)/g,
      (_match, braced: string | undefined, plain: string | undefined) => {
        const varName = braced ?? plain ?? "";
        return result[varName] ?? Bun.env[varName] ?? "";
      },
    );

    result[key] = value;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

const HELP_TEXT = `install.ts — deploy built config from out/host/ and out/sandbox/ to target directories

Usage:
  bun scripts/install.ts [--profile <name>] [--config-dir <path>] [--help]

Options:
  --profile <name>     Profile to use (default: host). Loads src/profiles/<name>.env.
  --config-dir <path>  Override CONFIG_DIR from the profile.
  --help               Show this help message and exit.
`;

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    profile: { type: "string", default: "host" },
    "config-dir": { type: "string", default: "" },
    help: { type: "boolean", default: false },
  },
  strict: true,
  allowPositionals: false,
});

if (args.help) {
  console.log(HELP_TEXT);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const scriptDir = dirname(resolve(import.meta.filename));
const repoRoot = resolve(scriptDir, "..");
const srcDir = join(repoRoot, "src");
const outDir = join(repoRoot, "out");
const outHostDir = join(outDir, "host");
const outSandboxDir = join(outDir, "sandbox");

const profile = args.profile ?? "host";
const configDirOverride = args["config-dir"] ?? "";

// --- Load profile ---
const profileFile = join(srcDir, "profiles", `${profile}.env`);
if (!existsSync(profileFile)) {
  console.error(`Error: profile file not found: ${profileFile}`);
  console.error("Available profiles:");
  const profilesDir = join(srcDir, "profiles");
  if (existsSync(profilesDir)) {
    const entries = readdirSync(profilesDir)
      .filter((f) => f.endsWith(".env"))
      .sort();
    for (const p of entries) {
      console.error(`  ${p.replace(/\.env$/, "")}`);
    }
  }
  process.exit(1);
}

const envVars = parseEnvFile(profileFile);

let configDirStr: string = envVars["CONFIG_DIR"] ?? "";
let opencodeConfigSrc: string = envVars["OPENCODE_CONFIG_SRC"] ?? "";
let agentVault: string = envVars["AGENT_VAULT"] ?? Bun.env.AGENT_VAULT ?? "";
let sandboxConfigDirStr: string =
  envVars["SANDBOX_CONFIG_DIR"] ??
  join(homedir(), ".config", "opencode-sandbox");

if (!configDirStr) {
  console.error("Error: CONFIG_DIR not set in profile.");
  process.exit(1);
}

if (!opencodeConfigSrc) {
  console.error("Error: OPENCODE_CONFIG_SRC not set in profile.");
  process.exit(1);
}

// --- Apply --config-dir override ---
if (configDirOverride) {
  configDirStr = configDirOverride;
}

// --- Expand ~ and resolve ---
function expandHome(p: string): string {
  const home = Bun.env.HOME ?? homedir();
  if (p.startsWith("~/")) return join(home, p.slice(2));
  if (p === "~") return home;
  return p;
}

const configDir = resolve(expandHome(configDirStr));
opencodeConfigSrc = expandHome(opencodeConfigSrc);
const sandboxConfigDir = resolve(expandHome(sandboxConfigDirStr));

// --- Check out/host/ exists ---
if (!existsSync(outHostDir) || !statSync(outHostDir).isDirectory()) {
  console.error("Error: out/host/ directory not found.");
  console.error("Run build first to produce the build output:");
  console.error(`  bun ${join(scriptDir, "build.ts")}`);
  process.exit(1);
}

// --- Safety: refuse if out/host/ == CONFIG_DIR ---
const resolvedOutHost = resolve(outHostDir);
const resolvedConfig = resolve(configDir);

if (resolvedOutHost === resolvedConfig) {
  console.error("Error: out/host/ directory equals target CONFIG_DIR.");
  console.error("");
  console.error(`  out/host/:  ${resolvedOutHost}`);
  console.error(`  CONFIG_DIR: ${resolvedConfig}`);
  console.error("");
  console.error(
    "Rsyncing out/host/ onto itself would be destructive. Check your profile.",
  );
  process.exit(1);
}

// --- Rsync out/host/ to CONFIG_DIR ---
console.log(`Deploying host config to: ${configDir}`);
console.log(`Profile:      ${profile} (${profileFile})`);
console.log(`Source:       ${outHostDir}`);
console.log();

mkdirSync(configDir, { recursive: true });

await $`rsync -a --delete ${outHostDir}/ ${configDir}/`;
console.log("Rsync (host) complete.");

// --- Rsync out/sandbox/ to SANDBOX_CONFIG_DIR ---
if (existsSync(outSandboxDir) && statSync(outSandboxDir).isDirectory()) {
  console.log();
  console.log(`Deploying sandbox config to: ${sandboxConfigDir}`);

  // --- Safety: refuse if out/sandbox/ == SANDBOX_CONFIG_DIR ---
  const resolvedOutSandbox = resolve(outSandboxDir);
  const resolvedSandbox = resolve(sandboxConfigDir);

  if (resolvedOutSandbox === resolvedSandbox) {
    console.error(
      "Error: out/sandbox/ directory equals target SANDBOX_CONFIG_DIR.",
    );
    console.error("");
    console.error(`  out/sandbox/:       ${resolvedOutSandbox}`);
    console.error(`  SANDBOX_CONFIG_DIR: ${resolvedSandbox}`);
    console.error("");
    console.error(
      "Rsyncing out/sandbox/ onto itself would be destructive. Check your profile.",
    );
    process.exit(1);
  }

  mkdirSync(sandboxConfigDir, { recursive: true });

  await $`rsync -a --delete ${outSandboxDir}/ ${sandboxConfigDir}/`;
  console.log("Rsync (sandbox) complete.");
} else {
  console.error(
    "Warning: out/sandbox/ not found — skipping sandbox config deployment.",
  );
}

// --- Deploy AoE config ---
const aoeSrc = join(srcDir, "aoe-config.toml");
const aoeDest = join(homedir(), ".config", "agent-of-empires", "config.toml");

if (existsSync(aoeSrc)) {
  if (agentVault) {
    mkdirSync(dirname(aoeDest), { recursive: true });
    let content = readFileSync(aoeSrc, "utf-8");
    content = content.replaceAll("{{AGENT_VAULT}}", agentVault);
    content = content.replaceAll("{{OPENCODE_CONFIG_SRC}}", opencodeConfigSrc);
    content = content.replaceAll("{{SANDBOX_CONFIG_DIR}}", sandboxConfigDir);
    writeFileSync(aoeDest, content, "utf-8");
    console.log(`AoE config deployed to: ${aoeDest}`);
  } else {
    console.error(
      "Warning: AGENT_VAULT not set — skipping AoE config deployment.",
    );
  }
}

// --- Summary ---
console.log();
console.log("Done.");
console.log();
console.log(`  Profile:             ${profile}`);
console.log(`  Host source:         ${outHostDir}`);
console.log(`  Host target:         ${configDir}`);
console.log(`  Sandbox source:      ${outSandboxDir}`);
console.log(`  Sandbox target:      ${sandboxConfigDir}`);
console.log(`  OPENCODE_CONFIG_SRC: ${opencodeConfigSrc}`);
console.log();
console.log(
  "To use this config, ensure OPENCODE_CONFIG_SRC is set in your environment:",
);
console.log(`  export OPENCODE_CONFIG_SRC="${opencodeConfigSrc}"`);
