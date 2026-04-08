import { describe, it, expect } from "bun:test";
import { existsSync } from "fs";
import path from "path";
import { execute_tool } from "./_lib";

// _preload.ts generates the vault manifest and runs vault_init into
// process.env.AGENT_VAULT before all tests.

// Dynamic import — the manifest must be generated first (done by _preload.ts)
const { default: vault_init } = await import("../../src/tools/vault/init");

describe("vault_init", () => {
  it("creates the top-level directories", () => {
    const vault = process.env.AGENT_VAULT!;
    for (const dir of ["tasks", "audits", "designs", "drafts", "notes", "projects"]) {
      expect(existsSync(path.join(vault, dir))).toBe(true);
    }
  });

  it("creates the _misc sub-directories", () => {
    const vault = process.env.AGENT_VAULT!;
    for (const dir of [
      "_misc/activity",
      "_misc/archive",
      "_misc/images",
      "_misc/templates",
    ]) {
      expect(existsSync(path.join(vault, dir))).toBe(true);
    }
  });

  it("creates AGENTS.md", () => {
    const vault = process.env.AGENT_VAULT!;
    expect(existsSync(path.join(vault, "AGENTS.md"))).toBe(true);
  });

  it("creates README.md files in each directory", () => {
    const vault = process.env.AGENT_VAULT!;
    for (const readme of [
      "tasks/README.md",
      "audits/README.md",
      "designs/README.md",
      "drafts/README.md",
      "notes/README.md",
      "projects/README.md",
      "_misc/activity/README.md",
      "_misc/archive/README.md",
      "_misc/images/README.md",
      "_misc/templates/README.md",
    ]) {
      expect(existsSync(path.join(vault, readme))).toBe(true);
    }
  });

  it("creates template files", () => {
    const vault = process.env.AGENT_VAULT!;
    for (const tmpl of [
      "_misc/templates/schema.md",
      "_misc/templates/review.md",
      "_misc/templates/triage.md",
      "_misc/templates/audit.md",
      "_misc/templates/design.md",
      "_misc/templates/repo-notes.md",
      "_misc/templates/fleet-schema.md",
      "_misc/templates/fleet-schema-issue.md",
      "_misc/templates/project-status.md",
    ]) {
      expect(existsSync(path.join(vault, tmpl))).toBe(true);
    }
  });

  it("creates notification icon images", () => {
    const vault = process.env.AGENT_VAULT!;
    for (const img of [
      "_misc/images/build.png",
      "_misc/images/implementor.png",
      "_misc/images/reviewer.png",
      "_misc/images/planner.png",
      "_misc/images/designer.png",
      "_misc/images/default.png",
    ]) {
      expect(existsSync(path.join(vault, img))).toBe(true);
    }
  });

  it("is idempotent — re-running does not fail or overwrite AGENTS.md", async () => {
    const vault = process.env.AGENT_VAULT!;
    const agentsMdBefore = await Bun.file(path.join(vault, "AGENTS.md")).text();

    const result = await execute_tool(vault_init, { vault_path: vault });
    expect(result).toContain("vault already fully initialized");

    const agentsMdAfter = await Bun.file(path.join(vault, "AGENTS.md")).text();
    expect(agentsMdAfter).toBe(agentsMdBefore);
  });

  it("reports the vault path in its output", async () => {
    const vault = process.env.AGENT_VAULT!;
    const result = await execute_tool(vault_init, { vault_path: vault });
    expect(result).toContain(vault);
  });
});
