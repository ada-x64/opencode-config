#!/usr/bin/env bun
/**
 * install.ts — deploy built config from out/host/ and out/sandbox/ to target directories
 *
 * Usage:
 *   bun scripts/install.ts [options]
 *
 * Options:
 *   --opencode-config-dir <path>  Host config directory (default: ~/.config/opencode,
 *                                  override with OPENCODE_CONFIG_DIR env var).
 *   --sandbox-config-dir <path>   Sandbox config directory (default: ~/.config/opencode-sandbox,
 *                                  override with SANDBOX_CONFIG_DIR env var).
 *   --profiles-config <path>      Path to profiles.toml (default: ~/.config/occonf/profiles.toml,
 *                                  override with OCCONF_PROFILES env var).
 *   --non-interactive              Non-interactively generate profiles.toml if missing.
 *   --include-token               With --non-interactive, read GH_TOKEN from env
 *                                  and include it in the generated profiles.toml.
 *   --skip-cron                   Skip vault-sync cron entry installation.
 *   --help                        Show this help message and exit.
 *
 * Prerequisites:
 *   Run build first to produce the out/ directory.
 *
 * What it does:
 *   1. Resolves CONFIG_DIR and SANDBOX_CONFIG_DIR from CLI flags, env vars,
 *      or defaults. Derives OPENCODE_CONFIG_SRC from the repo root.
 *   2. Verifies out/host/ exists (must run build first).
 *   3. Refuses to run if out/host/ == CONFIG_DIR (would be a no-op or destructive).
 *   4. rsyncs out/host/ contents to CONFIG_DIR.
 *   5. rsyncs out/sandbox/ contents to SANDBOX_CONFIG_DIR (if it exists).
 *   6. Deploys AoE global config from src/aoe-config.toml (resolving path
 *      placeholders: {{AGENT_VAULT}}, {{SANDBOX_CONFIG_DIR}},
 *      {{OPENCODE_DATA_DIR}}).
 *   6b. If profiles.toml doesn't exist:
 *       - Interactive (TTY): prompts the user to generate one with
 *         defaults (GitHub username, GH_TOKEN strategy, gitconfig,
 *         Docker user).
 *       - --non-interactive: auto-generates using detected defaults
 *         (GitHub username via gh CLI, optional GH_TOKEN from env).
 *       - Non-TTY without --non-interactive: prints an error message.
 *   7. Deploys AoE per-profile configs for ALL profiles listed in
 *      profiles.toml (resolving path placeholders and per-profile
 *      secrets: {{GH_TOKEN}}, {{NTFY_TOPIC}},
 *      {{SANDBOX_USER}}, {{SANDBOX_GROUP}}, {{SANDBOX_UID}}, {{SANDBOX_GID}},
 *      {{MOUNT_SSH}}, {{GITCONFIG_VOLUME}}).
 *   8. Prints a deployment summary.
 *
 * Separation of concerns:
 *   - build:     src/ → out/host/ and out/sandbox/ + all stamping
 *   - install:   out/host/ → CONFIG_DIR rsync + out/sandbox/ → SANDBOX_CONFIG_DIR
 *                + AoE config deployment
 *   - Source files in src/ are NEVER modified.
 */

import { parseArgs } from "node:util";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { homedir } from "node:os";
import { $ } from "bun";
import * as p from "@clack/prompts";

// ---------------------------------------------------------------------------
// Exported utilities — importable by tests without side effects
// ---------------------------------------------------------------------------

/**
 * Resolve the path to profiles.toml using 3-level fallback:
 *   1. CLI flag (--profiles-config)
 *   2. OCCONF_PROFILES env var
 *   3. Default: ~/.config/occonf/profiles.toml
 *
 * @returns Resolved absolute path (may not exist yet — caller should handle)
 */
export function resolveProfilesConfig(
  cliFlag: string,
  envVar: string | undefined,
): string {
  if (cliFlag) return resolve(cliFlag);
  if (envVar) return resolve(envVar);
  return join(homedir(), ".config", "occonf", "profiles.toml");
}

/**
 * Validate and sanitize a profile name for use as a directory component.
 *
 * Allowed characters: [a-zA-Z0-9._-/]. At most one slash separating
 * a family and user segment (e.g. "gh/alice"). Each segment must start
 * with an alphanumeric character.
 *
 * Returns the sanitized directory-safe name (slashes replaced with dashes).
 * Throws on invalid input.
 */
export function sanitizeProfileName(name: string): string {
  if (!name) throw new Error("Profile name must not be empty.");

  // Reject characters outside the allowlist
  if (/[^a-zA-Z0-9._\-/]/.test(name)) {
    throw new Error(
      `Profile name "${name}" contains invalid characters. Allowed: [a-zA-Z0-9._-/]`,
    );
  }

  // Reject structural issues
  if (name.endsWith("/")) {
    throw new Error(`Profile name "${name}" must not end with a slash.`);
  }

  const segments = name.split("/");
  if (segments.length > 2) {
    throw new Error(
      `Profile name "${name}" has too many segments. Maximum depth is family/name.`,
    );
  }

  for (const seg of segments) {
    if (!seg) {
      throw new Error(
        `Profile name "${name}" contains an empty segment (double slash).`,
      );
    }
    if (seg === "." || seg === "..") {
      throw new Error(
        `Profile name "${name}" contains a path traversal segment.`,
      );
    }
    if (/^[^a-zA-Z0-9]/.test(seg)) {
      throw new Error(
        `Profile name "${name}": each segment must start with an alphanumeric character.`,
      );
    }
  }

  return name.replace(/\//g, "-");
}

/**
 * Profile data loaded from profiles.toml for a specific profile.
 * undefined values mean "omit this key from deployed config".
 */
export interface ProfileData {
  GH_TOKEN?: string;
  NTFY_TOPIC?: string;
  gitconfig?: string;
  mount_ssh?: boolean;
  SANDBOX_USER?: string;
  SANDBOX_GROUP?: string;
  SANDBOX_UID?: string;
  SANDBOX_GID?: string;
}

/**
 * Load per-profile configuration from profiles.toml.
 *
 * Resolution order for each key:
 *   1. profiles."<profileName>" section
 *   2. [default] section
 *   3. Key-specific fallback (NTFY_TOPIC → vault cache file)
 *   4. undefined (caller should omit the line)
 *
 * Docker user fields are nested under profiles."<name>".docker and
 * mapped to SANDBOX_USER, SANDBOX_GROUP, SANDBOX_UID, SANDBOX_GID.
 *
 * @param profileName - The profile name (e.g. "gh/alice", "host")
 * @param profilesConfigPath - Absolute path to profiles.toml
 * @param agentVault - Absolute path to the agent vault (for NTFY_TOPIC fallback)
 * @returns Resolved ProfileData — undefined fields mean "omit"
 */
export function loadProfiles(
  profileName: string,
  profilesConfigPath: string,
  agentVault: string,
): ProfileData {
  const result: ProfileData = {};

  let parsed: Record<string, unknown> = {};
  if (existsSync(profilesConfigPath)) {
    const raw = readFileSync(profilesConfigPath, "utf-8");
    try {
      parsed = Bun.TOML.parse(raw) as Record<string, unknown>;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to parse ${profilesConfigPath}: ${msg}`);
    }
  }

  const defaults = (parsed["default"] ?? {}) as Record<string, unknown>;
  const profiles = (parsed["profiles"] ?? {}) as Record<string, unknown>;
  const profileSection = (profiles[profileName] ?? {}) as Record<
    string,
    unknown
  >;

  // Simple string keys
  for (const key of ["GH_TOKEN", "NTFY_TOPIC", "gitconfig"] as const) {
    const val = profileSection[key] ?? defaults[key];
    if (typeof val === "string") {
      (result as Record<string, string>)[key] = val;
    }
  }

  // NTFY_TOPIC fallback: read from vault cache file
  if (result.NTFY_TOPIC === undefined && agentVault) {
    const cachePath = join(agentVault, "_misc", "cache", "ntfy-topic.txt");
    if (existsSync(cachePath)) {
      const topic = readFileSync(cachePath, "utf-8").trim();
      if (topic) {
        result.NTFY_TOPIC = topic;
      }
    }
  }

  // mount_ssh: boolean from profile → default → undefined (defaults to false)
  const mountSsh = profileSection["mount_ssh"] ?? defaults["mount_ssh"];
  if (typeof mountSsh === "boolean") {
    result.mount_ssh = mountSsh;
  }

  // Docker user fields: profiles."<name>".docker → SANDBOX_*
  const docker = (profileSection["docker"] ?? {}) as Record<string, unknown>;
  const defaultDocker = (defaults["docker"] ?? {}) as Record<string, unknown>;

  const dockerMap: [string, keyof ProfileData][] = [
    ["username", "SANDBOX_USER"],
    ["group", "SANDBOX_GROUP"],
    ["uid", "SANDBOX_UID"],
    ["gid", "SANDBOX_GID"],
  ];

  for (const [tomlKey, resultKey] of dockerMap) {
    const val = docker[tomlKey] ?? defaultDocker[tomlKey];
    if (val !== undefined && val !== null) {
      result[resultKey] = String(val);
    }
  }

  return result;
}

/**
 * List all profile names defined in profiles.toml.
 *
 * @param profilesConfigPath - Absolute path to profiles.toml
 * @returns Array of profile names (e.g. ["gh/alice", "gh/bob"])
 */
export function listProfileNames(profilesConfigPath: string): string[] {
  if (!existsSync(profilesConfigPath)) return [];
  const raw = readFileSync(profilesConfigPath, "utf-8");
  let parsed: Record<string, unknown>;
  try {
    parsed = Bun.TOML.parse(raw) as Record<string, unknown>;
  } catch {
    return [];
  }
  const profiles = (parsed["profiles"] ?? {}) as Record<string, unknown>;
  return Object.keys(profiles);
}

/**
 * Detected environment defaults for profile generation.
 * Pure data — no I/O, no prompts.
 */
export interface ProfileDefaults {
  ghUsername: string;
  ghToken: string;
  gitconfigPath: string | null;
  username: string;
  uid: string;
  gid: string;
}

/**
 * Detect environment defaults for profile generation.
 *
 * Discovers GitHub username (via gh CLI), optionally captures GH_TOKEN,
 * detects gitconfig path, and reads Docker user settings (uid/gid).
 *
 * @param includeToken - Whether to read GH_TOKEN from the environment
 * @returns Detected defaults
 * @throws If GitHub username cannot be detected
 */
export async function detectProfileDefaults(
  includeToken = false,
): Promise<ProfileDefaults> {
  // Detect GitHub username
  let ghUsername = "";
  try {
    ghUsername = (await $`gh api user -q .login 2>/dev/null`.text()).trim();
  } catch {
    try {
      const status = await $`gh auth status 2>&1`.text();
      const match = status.match(/Logged in to github\.com account (\S+)/);
      if (match) ghUsername = match[1]!;
    } catch {
      // No gh CLI available
    }
  }

  if (!ghUsername) {
    throw new Error(
      "Could not detect GitHub username. Is gh CLI installed and authenticated?",
    );
  }

  // GH_TOKEN — only capture from env when explicitly requested
  let ghToken = "";
  if (includeToken) {
    ghToken = Bun.env.GH_TOKEN ?? "";
    if (!ghToken) {
      console.error(
        "Warning: --include-token set but GH_TOKEN not found in environment — omitting.",
      );
    }
  }

  // Detect gitconfig
  const gitconfigPath = join(homedir(), ".gitconfig");
  const hasGitconfig = existsSync(gitconfigPath);

  // Detect Docker user settings
  const username = Bun.env.USER ?? "agent";
  let uid = "1000";
  let gid = "1000";
  try {
    uid = (await $`id -u`.text()).trim();
    gid = (await $`id -g`.text()).trim();
  } catch {
    // Use defaults
  }

  return {
    ghUsername,
    ghToken,
    gitconfigPath: hasGitconfig ? gitconfigPath : null,
    username,
    uid,
    gid,
  };
}

/**
 * Build profiles.toml content from detected defaults.
 *
 * @param defaults - Detected environment defaults
 * @param destPath - Destination path (included in header comment)
 * @returns TOML content string
 */
export function buildProfilesContent(
  defaults: ProfileDefaults,
  destPath: string,
): string {
  const lines: string[] = [
    `# Auto-generated by install.ts on ${new Date().toISOString().slice(0, 10)}`,
    "# Edit this file to customize per-profile sandbox settings.",
    "# See src/profiles/profiles.toml.example for full documentation.",
    "#",
    `# Location: ${destPath}`,
    "# Permissions: 600 (contains tokens)",
    "",
    "[default]",
    "",
    `[profiles."gh/${defaults.ghUsername}"]`,
  ];

  if (defaults.ghToken) {
    lines.push(`GH_TOKEN = "${defaults.ghToken}"`);
  }
  if (defaults.gitconfigPath) {
    lines.push(`gitconfig = "${defaults.gitconfigPath}"`);
  }
  lines.push("mount_ssh = true");

  lines.push("");
  lines.push(`[profiles."gh/${defaults.ghUsername}".docker]`);
  lines.push(`username = "${defaults.username}"`);
  lines.push(`uid = ${defaults.uid}`);
  lines.push(`gid = ${defaults.gid}`);
  lines.push("");

  return lines.join("\n");
}

/**
 * Write a profiles.toml file with restricted permissions.
 *
 * @param destPath - Where to write the generated file
 * @param content - TOML content string
 */
export function writeProfilesFile(destPath: string, content: string): void {
  mkdirSync(dirname(destPath), { recursive: true });
  writeFileSync(destPath, content, { mode: 0o600 });
}

/**
 * Non-interactively generate a default profiles.toml.
 *
 * Detects GitHub username, optionally captures GH_TOKEN, detects gitconfig
 * path and Docker user settings from the current environment. Writes the
 * result to destPath with 600 permissions.
 *
 * @param destPath - Where to write the generated file
 * @param includeToken - Whether to read GH_TOKEN from the environment
 * @returns true if a file was generated, false on failure
 */
export async function generateProfilesNonInteractive(
  destPath: string,
  includeToken = false,
): Promise<boolean> {
  try {
    const defaults = await detectProfileDefaults(includeToken);
    const content = buildProfilesContent(defaults, destPath);
    writeProfilesFile(destPath, content);

    console.log(`Generated ${destPath}`);
    console.log(`  Profile:     gh/${defaults.ghUsername}`);
    console.log(`  GH_TOKEN:    ${defaults.ghToken ? "included" : "omitted"}`);
    console.log(`  gitconfig:   ${defaults.gitconfigPath ?? "none"}`);
    console.log(
      `  Docker user: ${defaults.username} (${defaults.uid}:${defaults.gid})`,
    );
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Error generating profiles.toml: ${msg}`);
    return false;
  }
}

/**
 * Interactively generate a default profiles.toml.
 *
 * Uses @clack/prompts for a TUI experience. Each step is resilient to
 * failure — if auto-detection fails, the user is prompted for manual input.
 *
 * Steps:
 *   1. Detect GitHub username via gh CLI, or prompt for manual entry
 *   2. Select GH_TOKEN strategy:
 *      - Use GH_TOKEN from environment (if set)
 *      - Capture via `gh auth token`
 *      - Enter manually (password-masked)
 *      - Skip
 *   3. Detect gitconfig path and Docker user (uid/gid)
 *
 * Falls back to a non-TTY error message if stdin is not a TTY.
 *
 * @param destPath - Where to write the generated file
 * @returns true if a file was generated, false if skipped
 */
export async function generateDefaultProfiles(
  destPath: string,
): Promise<boolean> {
  if (!process.stdin.isTTY) {
    console.error(
      `No profiles.toml found. Copy src/profiles/profiles.toml.example to ${destPath} and edit it.`,
    );
    return false;
  }

  p.intro("profiles.toml setup");

  const shouldGenerate = await p.confirm({
    message: `No profiles.toml found at ${destPath}. Generate one with defaults?`,
  });
  if (p.isCancel(shouldGenerate) || !shouldGenerate) {
    p.cancel("Skipping profiles.toml generation.");
    return false;
  }

  const s = p.spinner();

  // --- GitHub username ---
  s.start("Detecting GitHub username...");
  let ghUsername = "";
  try {
    ghUsername = (await $`gh api user -q .login 2>/dev/null`.text()).trim();
  } catch {
    try {
      const status = await $`gh auth status 2>&1`.text();
      const match = status.match(/Logged in to github\.com account (\S+)/);
      if (match) ghUsername = match[1]!;
    } catch {
      // gh CLI not available or not authenticated
    }
  }

  if (ghUsername) {
    s.stop(`GitHub username: ${ghUsername}`);
  } else {
    s.stop("Could not detect GitHub username.");
    const entered = await p.text({
      message: "Enter your GitHub username:",
      placeholder: "username",
      validate: (v) => {
        if (!v?.trim()) return "Username is required.";
        return undefined;
      },
    });
    if (p.isCancel(entered)) {
      p.cancel("Skipping profiles.toml generation.");
      return false;
    }
    ghUsername = entered.trim();
  }

  // --- GH_TOKEN ---
  const envToken = Bun.env.GH_TOKEN ?? "";
  type TokenStrategy = "env" | "gh-auth" | "manual" | "skip";
  const tokenOptions: { value: TokenStrategy; label: string; hint?: string }[] =
    [];
  if (envToken) {
    tokenOptions.push({
      value: "env",
      label: "Use GH_TOKEN from environment",
      hint: `${envToken.slice(0, 8)}…`,
    });
  }
  tokenOptions.push(
    {
      value: "gh-auth",
      label: "Capture via gh auth token",
    },
    { value: "manual", label: "Enter manually" },
    { value: "skip", label: "Skip (no token)" },
  );

  const tokenChoice = await p.select<TokenStrategy>({
    message: "How should GH_TOKEN be configured?",
    options: tokenOptions,
    initialValue: envToken ? "env" : "gh-auth",
  });

  if (p.isCancel(tokenChoice)) {
    p.cancel("Skipping profiles.toml generation.");
    return false;
  }

  let ghToken = "";
  switch (tokenChoice) {
    case "env":
      ghToken = envToken;
      break;
    case "gh-auth": {
      s.start("Running gh auth token...");
      try {
        ghToken = (await $`gh auth token 2>/dev/null`.text()).trim();
        s.stop(ghToken ? "Token captured." : "No token returned.");
      } catch {
        s.stop("gh auth token failed — skipping.");
      }
      break;
    }
    case "manual": {
      const entered = await p.password({
        message: "Paste your GitHub token:",
      });
      if (p.isCancel(entered)) {
        p.cancel("Skipping profiles.toml generation.");
        return false;
      }
      ghToken = entered;
      break;
    }
    case "skip":
      break;
  }

  // --- Remaining defaults (gitconfig, Docker user) ---
  const gitconfigPath = join(homedir(), ".gitconfig");
  const hasGitconfig = existsSync(gitconfigPath);
  const username = Bun.env.USER ?? "agent";
  let uid = "1000";
  let gid = "1000";
  try {
    uid = (await $`id -u`.text()).trim();
    gid = (await $`id -g`.text()).trim();
  } catch {
    // Use defaults
  }

  const defaults: ProfileDefaults = {
    ghUsername,
    ghToken,
    gitconfigPath: hasGitconfig ? gitconfigPath : null,
    username,
    uid,
    gid,
  };

  const content = buildProfilesContent(defaults, destPath);
  writeProfilesFile(destPath, content);

  p.note(
    [
      `Profile:     gh/${defaults.ghUsername}`,
      `GH_TOKEN:    ${defaults.ghToken ? "included" : "omitted"}`,
      `gitconfig:   ${defaults.gitconfigPath ?? "none"}`,
      `Docker user: ${defaults.username} (${defaults.uid}:${defaults.gid})`,
    ].join("\n"),
    `Generated ${destPath}`,
  );

  p.outro("profiles.toml ready");
  return true;
}

/**
 * Resolve a single secret placeholder in AoE config content.
 *
 * If value is defined: replaces `{{KEY}}` with the value.
 * If value is undefined: removes the entire line containing `{{KEY}}`,
 * plus any immediately preceding comment line that mentions KEY.
 */
export function resolveSecretPlaceholder(
  content: string,
  key: string,
  value: string | undefined,
): string {
  if (value !== undefined) {
    return content.replaceAll(`{{${key}}}`, value);
  }

  // Remove the line containing the placeholder, and any preceding comment
  // line that references the key name
  const lines = content.split("\n");
  const filtered: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.includes(`{{${key}}}`)) {
      // Also remove a preceding comment line if it mentions the key
      if (
        filtered.length > 0 &&
        filtered[filtered.length - 1]!.trimStart().startsWith("#") &&
        filtered[filtered.length - 1]!.includes(key)
      ) {
        filtered.pop();
      }
      continue;
    }
    filtered.push(line);
  }
  return filtered.join("\n");
}

/**
 * Deploy an AoE per-profile config from the profile template.
 *
 * Resolves all placeholders in the profile template using the provided
 * ProfileData, then writes the config.toml to the AoE profile directory.
 * If a gitconfig path is specified, copies it into the profile directory
 * and resolves the GITCONFIG_VOLUME placeholder.
 *
 * @param profileName - Original profile name (e.g. "gh/alice")
 * @param profileData - Resolved profile data from loadProfiles()
 * @param profileTemplatePath - Path to src/aoe-profile.toml
 * @param aoeDir - AoE app directory (e.g. ~/.config/agent-of-empires)
 */
export function deployAoeProfile(
  profileName: string,
  profileData: ProfileData,
  profileTemplatePath: string,
  aoeDir: string,
): void {
  const aoeName = sanitizeProfileName(profileName);
  const aoeProfileDir = join(aoeDir, "profiles", aoeName);
  mkdirSync(aoeProfileDir, { recursive: true });

  let content = readFileSync(profileTemplatePath, "utf-8");

  // Resolve mount_ssh from profile data (defaults to false)
  content = content.replaceAll(
    "{{MOUNT_SSH}}",
    String(profileData.mount_ssh ?? false),
  );

  // Resolve secret placeholders
  const secretKeys: (keyof ProfileData)[] = [
    "GH_TOKEN",
    "NTFY_TOPIC",
    "SANDBOX_USER",
    "SANDBOX_GROUP",
    "SANDBOX_UID",
    "SANDBOX_GID",
  ];
  for (const key of secretKeys) {
    content = resolveSecretPlaceholder(content, key, profileData[key]);
  }

  // Resolve gitconfig volume
  if (profileData.gitconfig) {
    // Copy gitconfig into the AoE profile directory
    const destGitconfig = join(aoeProfileDir, "gitconfig");
    copyFileSync(profileData.gitconfig, destGitconfig);
    // chmod 644 — readable by container user
    chmodSync(destGitconfig, 0o644);

    content = resolveSecretPlaceholder(
      content,
      "GITCONFIG_VOLUME",
      `${destGitconfig}:/etc/gitconfig:ro`,
    );
    console.log(
      `  Copied gitconfig: ${profileData.gitconfig} → ${destGitconfig}`,
    );
  } else {
    // No gitconfig — remove the volume line
    content = resolveSecretPlaceholder(content, "GITCONFIG_VOLUME", undefined);
  }

  // Write profile config with restricted permissions
  const profileConfigPath = join(aoeProfileDir, "config.toml");
  writeFileSync(profileConfigPath, content, { mode: 0o600 });
  console.log(`  AoE profile config: ${profileConfigPath}`);
}

// ---------------------------------------------------------------------------
// Main — only runs when executed directly (not when imported by tests)
// ---------------------------------------------------------------------------

if (import.meta.main) {
  // --- Help text ---
  const HELP_TEXT = `install.ts — deploy built config from out/host/ and out/sandbox/ to target directories

Usage:
  bun scripts/install.ts [options]

Options:
  --opencode-config-dir <path>  Host config directory (default: ~/.config/opencode,
                                 override with OPENCODE_CONFIG_DIR env var).
  --sandbox-config-dir <path>   Sandbox config directory (default: ~/.config/opencode-sandbox,
                                 override with SANDBOX_CONFIG_DIR env var).
  --profiles-config <path>      Path to profiles.toml (default: ~/.config/occonf/profiles.toml,
                                 override with OCCONF_PROFILES env var).
  --out-dir <path>              Output directory to read build artifacts from
                                 (default: <repo-root>/out).
  --non-interactive              Non-interactively generate profiles.toml if missing.
                                  Detects GitHub username, gitconfig, Docker UID/GID.
  --include-token               With --non-interactive, read GH_TOKEN from env
                                 and include it in the generated profiles.toml.
  --skip-cron                   Skip vault-sync cron entry installation.
  --help                        Show this help message and exit.
`;

  // --- Argument parsing ---
  const { values: args } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      "opencode-config-dir": { type: "string", default: "" },
      "sandbox-config-dir": { type: "string", default: "" },
      "profiles-config": { type: "string", default: "" },
      "out-dir": { type: "string", default: "" },
      "non-interactive": { type: "boolean", default: false },
      "include-token": { type: "boolean", default: false },
      "skip-cron": { type: "boolean", default: false },
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
  const outDir = args["out-dir"]
    ? resolve(args["out-dir"])
    : join(repoRoot, "out");
  const outHostDir = join(outDir, "host");
  const outSandboxDir = join(outDir, "sandbox");

  // --- Expand ~ and resolve ---
  function expandHome(p: string): string {
    const home = Bun.env.HOME ?? homedir();
    if (p.startsWith("~/")) return join(home, p.slice(2));
    if (p === "~") return home;
    return p;
  }

  // --- Resolve paths: CLI flag → env var → default ---
  const configDir = resolve(
    expandHome(
      args["opencode-config-dir"] ||
        Bun.env.OPENCODE_CONFIG_DIR ||
        "~/.config/opencode",
    ),
  );
  const opencodeConfigSrc = repoRoot;
  const sandboxConfigDir = resolve(
    expandHome(
      args["sandbox-config-dir"] ||
        Bun.env.SANDBOX_CONFIG_DIR ||
        "~/.config/opencode-sandbox",
    ),
  );
  const opencodeDataDir = resolve(
    expandHome("~/.local/share/opencode-sandbox-data"),
  );
  let agentVault: string = Bun.env.AGENT_VAULT ?? "";

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
      "Rsyncing out/host/ onto itself would be destructive. Check --opencode-config-dir.",
    );
    process.exit(1);
  }

  // --- Rsync out/host/ to CONFIG_DIR ---
  console.log(`Deploying host config to: ${configDir}`);
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
        "Rsyncing out/sandbox/ onto itself would be destructive. Check --sandbox-config-dir.",
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
  const aoeDir = join(homedir(), ".config", "agent-of-empires");

  if (agentVault) {
    console.log(`Ensuring opencode data directory: ${opencodeDataDir}`);
    ensureOpencodeDataDir(opencodeDataDir);

    // Load profiles.toml
    const profilesConfigPath = resolveProfilesConfig(
      args["profiles-config"]!,
      Bun.env.OCCONF_PROFILES,
    );

    // Auto-generate profiles.toml if missing
    if (!existsSync(profilesConfigPath)) {
      if (args["non-interactive"]) {
        await generateProfilesNonInteractive(
          profilesConfigPath,
          args["include-token"],
        );
      } else {
        await generateDefaultProfiles(profilesConfigPath);
      }
    }

    // Deploy global AoE config
    const globalAoeSrc = join(srcDir, "aoe-config.toml");
    const globalAoeDest = join(aoeDir, "config.toml");
    mkdirSync(aoeDir, { recursive: true });

    let globalContent = readFileSync(globalAoeSrc, "utf-8");
    globalContent = globalContent.replaceAll("{{AGENT_VAULT}}", agentVault);
    globalContent = globalContent.replaceAll(
      "{{SANDBOX_CONFIG_DIR}}",
      sandboxConfigDir,
    );
    globalContent = globalContent.replaceAll(
      "{{OPENCODE_DATA_DIR}}",
      opencodeDataDir,
    );
    writeFileSync(globalAoeDest, globalContent, "utf-8");
    console.log(`AoE global config deployed to: ${globalAoeDest}`);

    // Deploy AoE profiles for ALL profiles listed in profiles.toml
    const profileTemplatePath = join(srcDir, "aoe-profile.toml");
    const allProfileNames = listProfileNames(profilesConfigPath);

    if (!existsSync(profileTemplatePath)) {
      console.log(
        "No AoE profile template found — skipping per-profile deployment.",
      );
    } else if (allProfileNames.length === 0) {
      console.log(
        "No profiles defined in profiles.toml — skipping AoE profile deployment.",
      );
    } else {
      for (const name of allProfileNames) {
        console.log(`Deploying AoE profile: ${name}`);
        const data = loadProfiles(name, profilesConfigPath, agentVault);

        if (!data.GH_TOKEN) {
          console.error(
            `  Warning: GH_TOKEN not configured for profile "${name}" — sandbox will have no GitHub authentication.`,
          );
        }

        deployAoeProfile(name, data, profileTemplatePath, aoeDir);
      }
      console.log(`Deployed ${allProfileNames.length} AoE profile(s).`);
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
      chmodSync(vaultSyncDest, 0o755);
      console.log(`vault-sync deployed to: ${vaultSyncDest}`);

      // Install cron entry if not already present
      if (args["skip-cron"]) {
        console.log("Skipping cron installation (--skip-cron).");
      } else {
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
    }
  } else {
    console.error(
      "Warning: AGENT_VAULT not set — skipping AoE config and vault-sync deployment.",
    );
  }

  // --- Summary ---
  console.log();
  console.log("Done.");
  console.log();
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
