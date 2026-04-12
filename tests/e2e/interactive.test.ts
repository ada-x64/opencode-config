import { describe, it, expect, beforeAll } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  requireTmux,
  setupInteractiveTest,
  waitForText,
  sendKeys,
} from "./_helpers";

// ---------------------------------------------------------------------------
// Interactive TUI tests — driven via tmux
//
// These tests start install.ts inside a tmux session with a real PTY,
// then drive the @clack/prompts TUI by sending keystrokes and polling
// for expected output. Each test gets its own isolated environment
// (HOME, out dir, vault) and its own build.
// ---------------------------------------------------------------------------

// Fail hard if tmux is not installed
beforeAll(() => {
  requireTmux();
});

// Test counter for unique session names
let testCounter = 0;
function nextSession(): string {
  return `interactive-${process.pid}-${++testCounter}`;
}

// Default profiles.toml path relative to HOME
function profilesPath(home: string): string {
  return join(home, ".config", "occonf", "profiles.toml");
}

// AoE profile config path
function aoeProfileConfig(home: string, profileName: string): string {
  return join(
    home,
    ".config",
    "agent-of-empires",
    "profiles",
    profileName,
    "config.toml",
  );
}

describe("interactive TUI", () => {
  it("no gh → manual username → skip token → generates profile without token", async () => {
    const session = nextSession();
    const { home, cleanup } = await setupInteractiveTest(session, {
      // No mockGh — username detection will fail
    });

    try {
      // Wait for the confirm prompt
      await waitForText(session, "Generate one with defaults?");
      sendKeys(session, "Enter");

      // Username detection fails → manual entry prompt
      await waitForText(session, "Enter your GitHub username:");
      sendKeys(session, "manualuser");
      sendKeys(session, "Enter");

      // Token strategy prompt (no env token → 3 options)
      await waitForText(session, "How should GH_TOKEN be configured?");
      // Navigate to "Skip (no token)" — 2 down from "Capture via gh auth token"
      sendKeys(session, "Down");
      sendKeys(session, "Down");
      sendKeys(session, "Enter");

      // Wait for completion
      await waitForText(session, "profiles.toml ready");

      // Assert generated file
      const path = profilesPath(home);
      expect(existsSync(path)).toBe(true);

      const content = readFileSync(path, "utf-8");
      expect(content).toContain('[profiles."gh/manualuser"]');
      expect(content).toContain("mount_ssh = true");
      expect(content).not.toContain("GH_TOKEN");

      // Assert AoE profile deployed
      const aoePath = aoeProfileConfig(home, "gh-manualuser");
      expect(existsSync(aoePath)).toBe(true);
    } finally {
      cleanup();
    }
  }, 30_000);

  it("gh detected → use GH_TOKEN from environment → generates profile with env token", async () => {
    const session = nextSession();
    const { home, cleanup } = await setupInteractiveTest(session, {
      mockGh: { username: "envuser", token: "ghp_unused" },
      ghTokenEnv: "ghp_from_environment_123",
    });

    try {
      // Confirm prompt
      await waitForText(session, "Generate one with defaults?");
      sendKeys(session, "Enter");

      // Username auto-detected → goes straight to token prompt
      await waitForText(session, "How should GH_TOKEN be configured?");
      // "Use GH_TOKEN from environment" is the default when env token is set
      expect(
        (await waitForText(session, "Use GH_TOKEN from environment")).length,
      ).toBeGreaterThan(0);
      sendKeys(session, "Enter");

      // Wait for completion
      await waitForText(session, "profiles.toml ready");

      // Assert
      const content = readFileSync(profilesPath(home), "utf-8");
      expect(content).toContain('[profiles."gh/envuser"]');
      expect(content).toContain('GH_TOKEN = "ghp_from_environment_123"');
    } finally {
      cleanup();
    }
  }, 30_000);

  it("gh detected → capture via gh auth token → generates profile with captured token", async () => {
    const session = nextSession();
    const { home, cleanup } = await setupInteractiveTest(session, {
      mockGh: { username: "authuser", token: "ghp_mock_auth_token" },
      // No ghTokenEnv — "Capture via gh auth token" will be the default
    });

    try {
      await waitForText(session, "Generate one with defaults?");
      sendKeys(session, "Enter");

      // Token prompt — "Capture via gh auth token" is default (no env token)
      await waitForText(session, "How should GH_TOKEN be configured?");
      sendKeys(session, "Enter");

      await waitForText(session, "profiles.toml ready");

      const content = readFileSync(profilesPath(home), "utf-8");
      expect(content).toContain('[profiles."gh/authuser"]');
      expect(content).toContain('GH_TOKEN = "ghp_mock_auth_token"');
    } finally {
      cleanup();
    }
  }, 30_000);

  it("gh detected → enter token manually (password-masked) → generates profile with entered token", async () => {
    const session = nextSession();
    const { home, cleanup } = await setupInteractiveTest(session, {
      mockGh: { username: "manualtoken", token: "ghp_unused" },
    });

    try {
      await waitForText(session, "Generate one with defaults?");
      sendKeys(session, "Enter");

      // Token prompt — navigate to "Enter manually"
      await waitForText(session, "How should GH_TOKEN be configured?");
      sendKeys(session, "Down"); // → "Enter manually"
      sendKeys(session, "Enter");

      // Password prompt
      await waitForText(session, "Paste your GitHub token:");
      sendKeys(session, "ghp_typed_secret_value");
      sendKeys(session, "Enter");

      await waitForText(session, "profiles.toml ready");

      const content = readFileSync(profilesPath(home), "utf-8");
      expect(content).toContain('[profiles."gh/manualtoken"]');
      expect(content).toContain('GH_TOKEN = "ghp_typed_secret_value"');
    } finally {
      cleanup();
    }
  }, 30_000);

  it("gh detected → skip token → generates profile without token", async () => {
    const session = nextSession();
    const { home, cleanup } = await setupInteractiveTest(session, {
      mockGh: { username: "skipuser", token: "ghp_unused" },
    });

    try {
      await waitForText(session, "Generate one with defaults?");
      sendKeys(session, "Enter");

      await waitForText(session, "How should GH_TOKEN be configured?");
      // Navigate to "Skip (no token)" — 2 down from default
      sendKeys(session, "Down");
      sendKeys(session, "Down");
      sendKeys(session, "Enter");

      await waitForText(session, "profiles.toml ready");

      const content = readFileSync(profilesPath(home), "utf-8");
      expect(content).toContain('[profiles."gh/skipuser"]');
      expect(content).not.toContain("GH_TOKEN");
    } finally {
      cleanup();
    }
  }, 30_000);

  it("cancel at confirm prompt → no profiles.toml generated", async () => {
    const session = nextSession();
    const { home, cleanup } = await setupInteractiveTest(session, {
      mockGh: { username: "canceluser", token: "ghp_unused" },
    });

    try {
      await waitForText(session, "Generate one with defaults?");
      // Select "No"
      sendKeys(session, "Right");
      sendKeys(session, "Enter");

      // Wait for install to finish (it should proceed past the cancelled
      // profiles step and print the summary)
      await waitForText(session, "Done.");

      // profiles.toml should NOT exist
      expect(existsSync(profilesPath(home))).toBe(false);
    } finally {
      cleanup();
    }
  }, 30_000);
});
