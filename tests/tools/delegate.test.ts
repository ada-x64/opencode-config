import { describe, it, expect } from "bun:test";
import { execute_tool } from "./_lib";
import {
  OPENCODE_INIT_DELAY_MS,
  COPILOT_INIT_DELAY_MS,
  COPILOT_POST_PROMPT_DELAY_MS,
  COPILOT_POLL_INTERVAL_MS,
  COPILOT_POLL_MAX_ATTEMPTS,
  COPILOT_POST_DELEGATE_DELAY_MS,
  FLEET_INIT_DELAY_MS,
  FLEET_STAGGER_DELAY_MS,
  FLEET_POST_DELEGATE_DELAY_MS,
  FLEET_CLEANUP_DELAY_MS,
  UUID_RE,
  CONFIRM_RE,
  assertNotSandbox,
  copilotSendPrompt,
  copilotFindTmux,
  copilotCheckConfirmed,
  createIsolatedWorktree,
  removeWorktree,
  createAoeSession,
  delegateSession,
  delegateFleet,
} from "../../src/tools/delegate/_lib";

// delegate tools require aoe/tmux — shape-only tests.

import { existsSync } from "node:fs";

const inSandbox = existsSync("/.dockerenv");

const { session, fleet } = await import("../../src/tools/delegate");

describe("delegate session tool", () => {
  it("has correct description", () => {
    expect(session.description).toContain("AoE session");
    expect(session.description).toContain("opencode");
    expect(session.description).toContain("copilot");
    expect(session.description).toContain("index.lock");
  });

  it("has required args", () => {
    expect(session.args).toHaveProperty("repo");
    expect(session.args).toHaveProperty("prompt");
    expect(session.args).toHaveProperty("title");
  });

  it("has optional args", () => {
    expect(session.args).toHaveProperty("tool");
    expect(session.args).toHaveProperty("branch");
    expect(session.args).toHaveProperty("new_branch");
    expect(session.args).toHaveProperty("group");
  });
});

describe("delegate fleet tool", () => {
  it("has correct description", () => {
    expect(fleet.description).toContain("Batch-dispatch");
    expect(fleet.description).toContain("copilot");
    expect(fleet.description).toContain("JSON array");
  });

  it("has required args", () => {
    expect(fleet.args).toHaveProperty("repo");
    expect(fleet.args).toHaveProperty("sessions");
  });

  it("has optional args", () => {
    expect(fleet.args).toHaveProperty("group");
  });

  it("rejects empty sessions array", async () => {
    await expect(
      execute_tool(fleet, { repo: "/tmp", sessions: [] }),
    ).rejects.toThrow(
      inSandbox
        ? "cannot run inside a sandbox"
        : "sessions array must not be empty",
    );
  });
});

describe("delegate _lib", () => {
  describe("timing constants", () => {
    it.each([
      ["OPENCODE_INIT_DELAY_MS", OPENCODE_INIT_DELAY_MS],
      ["COPILOT_INIT_DELAY_MS", COPILOT_INIT_DELAY_MS],
      ["COPILOT_POST_PROMPT_DELAY_MS", COPILOT_POST_PROMPT_DELAY_MS],
      ["COPILOT_POLL_INTERVAL_MS", COPILOT_POLL_INTERVAL_MS],
      ["COPILOT_POLL_MAX_ATTEMPTS", COPILOT_POLL_MAX_ATTEMPTS],
      ["COPILOT_POST_DELEGATE_DELAY_MS", COPILOT_POST_DELEGATE_DELAY_MS],
      ["FLEET_INIT_DELAY_MS", FLEET_INIT_DELAY_MS],
      ["FLEET_STAGGER_DELAY_MS", FLEET_STAGGER_DELAY_MS],
      ["FLEET_POST_DELEGATE_DELAY_MS", FLEET_POST_DELEGATE_DELAY_MS],
      ["FLEET_CLEANUP_DELAY_MS", FLEET_CLEANUP_DELAY_MS],
    ])("%s is a positive number", (_name, value) => {
      expect(typeof value).toBe("number");
      expect(value).toBeGreaterThan(0);
    });
  });

  describe("regex constants", () => {
    it("UUID_RE matches a valid UUID", () => {
      expect(UUID_RE).toBeInstanceOf(RegExp);
      expect(UUID_RE.test("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(true);
      expect(UUID_RE.test("not-a-uuid")).toBe(false);
    });

    it("CONFIRM_RE matches confirmation keywords", () => {
      expect(CONFIRM_RE).toBeInstanceOf(RegExp);
      expect(CONFIRM_RE.test("ready")).toBe(true);
      expect(CONFIRM_RE.test("Understood")).toBe(true);
      expect(CONFIRM_RE.test("I CONFIRM")).toBe(true);
      expect(CONFIRM_RE.test("will wait")).toBe(true);
      expect(CONFIRM_RE.test("hello world")).toBe(false);
    });
  });

  describe("exported functions", () => {
    it.each([
      ["assertNotSandbox", assertNotSandbox],
      ["copilotSendPrompt", copilotSendPrompt],
      ["copilotFindTmux", copilotFindTmux],
      ["copilotCheckConfirmed", copilotCheckConfirmed],
      ["createIsolatedWorktree", createIsolatedWorktree],
      ["removeWorktree", removeWorktree],
      ["createAoeSession", createAoeSession],
      ["delegateSession", delegateSession],
      ["delegateFleet", delegateFleet],
    ])("%s is a function", (_name, fn) => {
      expect(typeof fn).toBe("function");
    });
  });

  describe("assertNotSandbox", () => {
    if (inSandbox) {
      it("throws inside a sandbox container", () => {
        expect(() => assertNotSandbox()).toThrow(
          "cannot run inside a sandbox container",
        );
      });
    } else {
      it("does not throw on host (no /.dockerenv)", () => {
        expect(() => assertNotSandbox()).not.toThrow();
      });
    }
  });
});
