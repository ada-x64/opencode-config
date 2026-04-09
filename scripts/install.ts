#!/usr/bin/env bun
/**
 * install.ts — deploy built config from out/host/ and out/sandbox/ to target directories
 *
 * Usage:
 *   bun scripts/install.ts [--profile <name>] [--config-dir <path>] [--help]
 *
 * Options:
 *   --profile <name>     Profile to use (default: host). Supports slash-separated
 *                         names like "gh/username" — tries src/profiles/gh/username.env
 *                         first, then falls back to src/profiles/gh.env.
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
 *      {{SANDBOX_CONFIG_DIR}}, and {{OPENCODE_DATA_DIR}}) — uses a profile-specific
 *      .aoe.toml if present, otherwise falls back to src/aoe-config.toml.
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
  copyFileSync,
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
// Exported utilities — importable by tests without side effects
// ---------------------------------------------------------------------------

/**
 * Parse a shell-style .env file into a key-value record.
 *
 * Supports `export` prefix, `$HOME` / `${HOME}` / `~` expansion, quoted
 * values (note: single-quoted values are still subject to variable expansion,
 * unlike POSIX shell), and forward-reference expansion of previously-parsed keys.
 */
export function parseEnvFile(envPath: string): Record<string, string> {
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

/**
 * Validate a profile name against a positive allowlist.
 *
 * Segments must start with an alphanumeric character, followed by word chars,
 * dots, or dashes. An optional single slash separates family/user profiles
 * (e.g. "gh/username"). Requiring a leading alphanumeric rejects all-dot
 * segments (".", "..") which would cause path traversal via join()
 * normalization. Also inherently blocks null bytes, backslashes, and
 * multi-depth paths.
 *
 * @throws {Error} if the name is invalid (caught in main block → process.exit)
 */
export function assertSafeProfileName(name: string): void {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*(\/[a-zA-Z0-9][a-zA-Z0-9._-]*)?$/.test(name)
  ) {
    throw new Error(
      `Unsafe or malformed profile name: ${name}\n` +
        "Profile names must match <name> or <family>/<name>. Each segment must\n" +
        "start with an alphanumeric character and contain only [a-zA-Z0-9._-].",
    );
  }
}

/**
 * Resolve a profile .env file using 2-level fallback:
 *   1. Exact: profilesDir/<profileName>.env
 *   2. Base:  profilesDir/<family>.env (for "family/user" names)
 *
 * @param profileName - The profile name (e.g. "host", "gh/username")
 * @param profilesDir - The directory containing profile .env files
 * @returns The resolved file path, or null if not found
 */
export function resolveProfileFile(
  profileName: string,
  profilesDir: string,
): string | null {
  const exact = join(profilesDir, `${profileName}.env`);
  if (existsSync(exact)) return exact;

  // Fall back to base: "gh/username" → "gh"
  const slashIdx = profileName.indexOf("/");
  if (slashIdx !== -1) {
    const base = profileName.slice(0, slashIdx);
    const basePath = join(profilesDir, `${base}.env`);
    if (existsSync(basePath)) return basePath;
  }

  return null;
}

/**
 * Resolve an AoE config template using 3-level fallback:
 *   1. Exact:   profilesDir/<profileName>.aoe.toml
 *   2. Base:    profilesDir/<family>.aoe.toml (for "family/user" names)
 *   3. Default: defaultConfigPath
 *
 * The extra default level (vs. 2 for .env) ensures a valid AoE config is
 * always found, even for profiles that don't define a custom one. The .env
 * resolution intentionally stops at 2 levels because there is no meaningful
 * "default .env" — every profile must explicitly declare its directory paths.
 *
 * @param profileName - The profile name (e.g. "host", "gh/username")
 * @param profilesDir - The directory containing profile .aoe.toml files
 * @param defaultConfigPath - Fallback path (e.g. src/aoe-config.toml)
 * @returns The resolved file path, or null if not found at any level
 */
export function resolveAoeConfig(
  profileName: string,
  profilesDir: string,
  defaultConfigPath: string,
): string | null {
  // Exact: profilesDir/gh/username.aoe.toml (or profilesDir/host.aoe.toml)
  const exact = join(profilesDir, `${profileName}.aoe.toml`);
  if (existsSync(exact)) return exact;

  // Base: "gh/username" → profilesDir/gh.aoe.toml
  const slashIdx = profileName.indexOf("/");
  if (slashIdx !== -1) {
    const base = profileName.slice(0, slashIdx);
    const basePath = join(profilesDir, `${base}.aoe.toml`);
    if (existsSync(basePath)) return basePath;
  }

  // Default
  if (existsSync(defaultConfigPath)) return defaultConfigPath;

  return null;
}

// ---------------------------------------------------------------------------
// Main — only runs when executed directly (not when imported by tests)
// ---------------------------------------------------------------------------

if (import.meta.main) {
  // --- Help text ---
  const HELP_TEXT = `install.ts — deploy built config from out/host/ and out/sandbox/ to target directories

Usage:
  bun scripts/install.ts [--profile <name>] [--config-dir <path>] [--help]

Options:
  --profile <name>     Profile to use (default: host). Supports slash-separated
                       names like "gh/username" — tries the exact .env first,
                       then falls back to the base (e.g. gh.env for gh/*).
  --config-dir <path>  Override CONFIG_DIR from the profile.
  --help               Show this help message and exit.
`;

  // --- Argument parsing ---
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

  // --- Paths ---
  const scriptDir = dirname(resolve(import.meta.filename));
  const repoRoot = resolve(scriptDir, "..");
  const srcDir = join(repoRoot, "src");
  const outDir = join(repoRoot, "out");
  const outHostDir = join(outDir, "host");
  const outSandboxDir = join(outDir, "sandbox");
  const profilesDir = join(srcDir, "profiles");

  const profile = args.profile!;
  const configDirOverride = args["config-dir"]!;

  // --- Validate profile name ---
  try {
    assertSafeProfileName(profile);
  } catch (e: unknown) {
    console.error(`Error: ${(e as Error).message}`);
    process.exit(1);
  }

  // --- Load profile ---
  const profileFile = resolveProfileFile(profile, profilesDir);
  if (!profileFile) {
    const slashIdx = profile.indexOf("/");
    console.error(`Error: profile not found for: ${profile}`);
    console.error(
      `  Tried: src/profiles/${profile}.env` +
        (slashIdx !== -1
          ? `, src/profiles/${profile.slice(0, slashIdx)}.env`
          : ""),
    );
    console.error("Available profiles:");
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
  const opencodeDataDir = resolve(
    expandHome("~/.local/share/opencode-sandbox-data"),
  );

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

  // ---------------------------------------------------------------------------
  // AoE data directory helper
  // ---------------------------------------------------------------------------

  /**
   * Create the sandbox opencode data directory and seed it if empty.
   *
   * The dedicated directory (~/.local/share/opencode-sandbox-data) is
   * bind-mounted into the container at /root/.local/share/opencode, shadowing
   * AoE's automatic sync target. This prevents AoE's refresh_agent_configs()
   * from overwriting the container's live database.
   *
   * Seeding is a one-time operation: if opencode.db already exists in dataDir,
   * the function returns immediately. To re-seed, delete the file manually and
   * re-run install.
   */
  function ensureOpencodeDataDir(dataDir: string): void {
    mkdirSync(dataDir, { recursive: true });

    const targetDb = join(dataDir, "opencode.db");
    if (existsSync(targetDb)) {
      console.log(`  Opencode data dir already seeded: ${targetDb}`);
      return;
    }

    const hostDb = join(
      homedir(),
      ".local",
      "share",
      "opencode",
      "opencode.db",
    );
    if (existsSync(hostDb) && statSync(hostDb).isFile()) {
      copyFileSync(hostDb, targetDb);
      console.log(`  Seeded ${targetDb} from ${hostDb}`);
    } else {
      console.log(
        `  No host DB at ${hostDb} — container will create a fresh database.`,
      );
    }
  }

  // --- Deploy AoE config ---
  const aoeSrc = resolveAoeConfig(
    profile,
    profilesDir,
    join(srcDir, "aoe-config.toml"),
  );
  const aoeDest = join(homedir(), ".config", "agent-of-empires", "config.toml");

  if (aoeSrc) {
    if (agentVault) {
      console.log(`Ensuring opencode data directory: ${opencodeDataDir}`);
      ensureOpencodeDataDir(opencodeDataDir);
      mkdirSync(dirname(aoeDest), { recursive: true });
      let content = readFileSync(aoeSrc, "utf-8");
      content = content.replaceAll("{{AGENT_VAULT}}", agentVault);
      content = content.replaceAll(
        "{{OPENCODE_CONFIG_SRC}}",
        opencodeConfigSrc,
      );
      content = content.replaceAll("{{SANDBOX_CONFIG_DIR}}", sandboxConfigDir);
      content = content.replaceAll("{{OPENCODE_DATA_DIR}}", opencodeDataDir);
      writeFileSync(aoeDest, content, "utf-8");
      console.log(`AoE config deployed to: ${aoeDest}`);
      console.log(`  Source: ${aoeSrc}`);
    } else {
      console.error(
        "Warning: AGENT_VAULT not set — skipping AoE config deployment.",
      );
    }
  } else {
    console.error("Warning: no AoE config template found — skipping.");
  }

  // --- Deploy vault-sync cron script ---
  const vaultSyncSrc = join(srcDir, "..", "scripts", "vault-sync.sh");
  const localBinDir = join(homedir(), ".local", "bin");
  const localLogDir = join(homedir(), ".local", "log");
  const vaultSyncDest = join(localBinDir, "vault-sync");

  if (existsSync(vaultSyncSrc)) {
    mkdirSync(localBinDir, { recursive: true });
    mkdirSync(localLogDir, { recursive: true });
    copyFileSync(vaultSyncSrc, vaultSyncDest);
    // Make executable
    const { chmodSync } = await import("node:fs");
    chmodSync(vaultSyncDest, 0o755);
    console.log(`vault-sync deployed to: ${vaultSyncDest}`);

    // Install cron entry if not already present
    try {
      const existingCron =
        (await $`crontab -l 2>/dev/null`.text()).trim() || "";
      if (!existingCron.includes("vault-sync")) {
        const cronLine = `*/15 * * * * AGENT_VAULT="${agentVault}" ${vaultSyncDest} >> ${localLogDir}/vault-sync.log 2>&1`;
        const newCron = existingCron
          ? `${existingCron}\n${cronLine}\n`
          : `${cronLine}\n`;
        await $`echo ${newCron} | crontab -`;
        console.log("Installed vault-sync cron (every 15 minutes).");
      } else {
        console.log("vault-sync cron already installed — skipping.");
      }
    } catch {
      console.error(
        "Warning: could not install cron entry — install manually.",
      );
      console.error(
        `  */15 * * * * AGENT_VAULT="${agentVault}" ${vaultSyncDest} >> ${localLogDir}/vault-sync.log 2>&1`,
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
  console.log(`  Opencode data dir:   ${opencodeDataDir}`);
  console.log();
  console.log(
    "To use this config, ensure OPENCODE_CONFIG_SRC is set in your environment:",
  );
  console.log(`  export OPENCODE_CONFIG_SRC="${opencodeConfigSrc}"`);
}
