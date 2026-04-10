#!/usr/bin/env bun
/**
 * setup.ts — standalone installer for opencode-config (Bun port)
 *
 * Bootstrapper entry point. Prompts for environment paths, downloads the
 * release tarball to a staging directory, runs build.ts to produce stamped
 * output, then rsyncs out/ to ~/.config/opencode and writes shell env vars.
 *
 * Usage:
 *   # Recommended — via bunx:
 *   bunx cubething-occonf
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";
import { $ } from "bun";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CONFIG_DIR = path.join(os.homedir(), ".config", "opencode");
const REPO = "ada-x64/opencode-config";
const TARBALL_URL = `https://github.com/${REPO}/releases/latest/download/opencode-config.tar.gz`;

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function info(msg: string): void {
  console.log(`\x1b[1;32m==>\x1b[0m \x1b[1m${msg}\x1b[0m`);
}

function warn(msg: string): void {
  console.error(`\x1b[1;33mWarning:\x1b[0m ${msg}`);
}

// ---------------------------------------------------------------------------
// Interactive prompts
// When piped via curl | bun, stdin is the script, not the terminal.
// Open /dev/tty explicitly so we can interact with the user.
// ---------------------------------------------------------------------------

function openTty(): readline.Interface | null {
  try {
    const ttyFd = fs.openSync("/dev/tty", "r");
    const ttyStream = fs.createReadStream("", { fd: ttyFd });
    return readline.createInterface({
      input: ttyStream,
      output: process.stdout,
      terminal: false,
    });
  } catch {
    return null;
  }
}

function prompt(rl: readline.Interface, message: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(message);
    rl.once("line", (line) => {
      resolve(line.trim());
    });
  });
}

async function promptRequired(
  rl: readline.Interface,
  label: string,
  envKey: string,
): Promise<string> {
  const defaultVal = Bun.env[envKey] ?? "";
  while (true) {
    let value: string;
    if (defaultVal) {
      value = await prompt(rl, `${label} [${defaultVal}]: `);
    } else {
      value = await prompt(rl, `${label} (required): `);
    }
    const result = value || defaultVal;
    if (result) {
      return result;
    }
    warn(`${envKey} is required.`);
  }
}

async function promptOptional(
  rl: readline.Interface,
  label: string,
): Promise<string> {
  return prompt(rl, `${label} (optional, Enter to skip): `);
}

// ---------------------------------------------------------------------------
// Shell profile helpers
// ---------------------------------------------------------------------------

function findShellProfile(): string {
  const zdotdir = Bun.env["ZDOTDIR"] ?? "";
  if (zdotdir) {
    return path.join(zdotdir, ".zshrc");
  }
  const zshrc = path.join(os.homedir(), ".zshrc");
  if (fs.existsSync(zshrc)) {
    return zshrc;
  }
  return path.join(os.homedir(), ".bashrc");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log();
  console.log("  cubething-occonf setup");
  console.log("  =====================");
  console.log();

  // --- Open /dev/tty for interactive prompts ---
  const rl = openTty();
  if (rl === null) {
    warn("No interactive terminal available.");
    warn(
      "Set AGENT_VAULT and AGENT_REPOS in your environment and re-run setup.ts directly:",
    );
    warn("  AGENT_VAULT=~/obsidian/agent.obs bun run setup.ts");
    process.exit(1);
  }

  let agentVault: string;
  let agentRepos: string;
  let ntfyTopic: string;
  try {
    agentVault = await promptRequired(
      rl,
      "Where is your agent vault?",
      "AGENT_VAULT",
    );
    agentRepos = await promptRequired(
      rl,
      "Where do you keep repos?",
      "AGENT_REPOS",
    );
    ntfyTopic = await promptOptional(
      rl,
      "ntfy.sh topic for push notifications",
    );
  } finally {
    rl.close();
  }

  console.log();

  // --- Download tarball to staging directory ---
  info("Downloading opencode-config...");
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-config-"));
  try {
    const tarballPath = path.join(staging, "opencode-config.tar.gz");

    const response = await fetch(TARBALL_URL);
    if (!response.ok) {
      throw new Error(
        `Download failed: ${response.status} ${response.statusText}`,
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(tarballPath, Buffer.from(arrayBuffer));

    info("Extracting...");
    await $`tar xzf ${tarballPath} -C ${staging}`;

    // The tarball may contain a top-level directory — find the repo root
    // (look for scripts/build.ts to identify it)
    let repoRoot = staging;
    const entries = fs.readdirSync(staging, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const candidate = path.join(staging, entry.name);
        if (fs.existsSync(path.join(candidate, "scripts", "build.ts"))) {
          repoRoot = candidate;
          break;
        }
      }
    }

    // --- Set up environment for child processes ---
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
    };
    env["OPENCODE_CONFIG_SRC"] = CONFIG_DIR;
    env["AGENT_VAULT"] = agentVault;
    env["AGENT_REPOS"] = agentRepos;
    if (ntfyTopic) {
      env["NTFY_TOPIC"] = ntfyTopic;
    }

    // --- Run build.ts (generates build.json, copies src/ → out/, stamps everything) ---
    info("Running build.ts...");
    const buildScript = path.join(repoRoot, "scripts", "build.ts");
    await $`bun run ${buildScript} --config-dir ${CONFIG_DIR}`
      .env(env)
      .cwd(repoRoot);

    // --- Run install.ts (rsyncs out/ → CONFIG_DIR, deploys AoE config) ---
    info("Running install.ts...");
    const installScript = path.join(repoRoot, "scripts", "install.ts");
    await $`bun run ${installScript} --opencode-config-dir ${CONFIG_DIR}`
      .env(env)
      .cwd(repoRoot);
  } finally {
    // Clean up staging directory
    fs.rmSync(staging, { recursive: true, force: true });
  }

  // --- Write environment variables to shell profile ---
  const profile = findShellProfile();
  let existing = "";
  try {
    if (fs.existsSync(profile)) {
      existing = fs.readFileSync(profile, "utf-8");
    }
  } catch {
    // ignore read errors
  }

  if (existing.includes("OPENCODE_CONFIG_SRC")) {
    warn(
      `Shell profile already contains OPENCODE_CONFIG_SRC — skipping env block. Update ${profile} manually if needed.`,
    );
  } else {
    let block = "\n# opencode-config\n";
    block += `export OPENCODE_CONFIG_SRC="${CONFIG_DIR}"\n`;
    block += `export AGENT_VAULT="${agentVault}"\n`;
    block += `export AGENT_REPOS="${agentRepos}"\n`;
    if (ntfyTopic) {
      block += `export NTFY_TOPIC="${ntfyTopic}"\n`;
    }
    fs.appendFileSync(profile, block);
    info(`Environment variables written to ${profile}`);
  }

  // --- Summary ---
  console.log();
  info("Setup complete!");
  console.log();
  console.log(`  Config:    ${CONFIG_DIR}`);
  console.log("  AoE:       ~/.config/agent-of-empires/config.toml");
  console.log(`  Vault:     ${agentVault}`);
  console.log(`  Repos:     ${agentRepos}`);
  console.log();
  console.log(`Restart your shell or run: source ~/${path.basename(profile)}`);
  console.log();
}

await main();
