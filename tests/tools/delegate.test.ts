import { describe, it, expect } from "bun:test";
import { configDir, scriptPath } from "../../src/tools/delegate/_lib";
import { existsSync } from "fs";
import path from "path";

// delegate tools require aoe/tmux/bash — shape-only tests.

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
    await expect(fleet.execute({ repo: "/tmp", sessions: [] })).rejects.toThrow(
      "sessions array must not be empty",
    );
  });
});

describe("delegate _lib", () => {
  it("configDir is a non-empty string", () => {
    expect(typeof configDir).toBe("string");
    expect(configDir.length).toBeGreaterThan(0);
  });

  it("scriptPath points to delegate.sh", () => {
    expect(scriptPath).toContain("skills/delegate/delegate.sh");
    expect(path.isAbsolute(scriptPath)).toBe(true);
  });

  it("delegate.sh exists at scriptPath", () => {
    expect(existsSync(scriptPath)).toBe(true);
  });
});
