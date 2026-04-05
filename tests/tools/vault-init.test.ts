import { describe, it, expect } from "bun:test";
import { existsSync } from "fs";
import path from "path";
import vault_init from "../../src/tools/vault_init";
import { execute_tool } from "./_lib";

// _setup.test.ts runs vault_init into process.env.AGENT_VAULT before all tests.

describe("vault_init", () => {
  it("creates the top-level task directories", () => {
    const vault = process.env.AGENT_VAULT!;
    for (const dir of [
      "tasks",
      "audits",
      "projects",
      "design",
      "draft",
      "repo-notes",
    ]) {
      expect(existsSync(path.join(vault, dir))).toBe(true);
    }
  });

  it("creates the _misc sub-directories", () => {
    const vault = process.env.AGENT_VAULT!;
    for (const dir of [
      "_misc/archive/tasks",
      "_misc/archive/draft",
      "_misc/cache",
      "_misc/templates",
      "_misc/images",
    ]) {
      expect(existsSync(path.join(vault, dir))).toBe(true);
    }
  });

  it("creates AGENTS.md", () => {
    const vault = process.env.AGENT_VAULT!;
    expect(existsSync(path.join(vault, "AGENTS.md"))).toBe(true);
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
