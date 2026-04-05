import { describe, it, expect } from "bun:test";
import vault_find from "../../src/tools/vault_find";
import type { ToolContext } from "@opencode-ai/plugin";

describe("vault_find", () => {
  it("has the correct tool shape", () => {
    expect(vault_find.description).toContain("vault");
    expect(vault_find.args).toHaveProperty("section");
    expect(vault_find.args).toHaveProperty("repo");
    expect(vault_find.args).toHaveProperty("pattern");
    expect(vault_find.args).toHaveProperty("content_grep");
  });

  it("description mentions all sections", () => {
    expect(vault_find.description).toContain("schemas");
    expect(vault_find.description).toContain("reviews");
    expect(vault_find.description).toContain("repo-notes");
    expect(vault_find.description).toContain("triage");
  });

  it("returns valid JSON for schemas section", async () => {
    const result = await vault_find.execute(
      { section: "schemas" },
      {} as ToolContext,
    );
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    for (const entry of parsed) {
      expect(entry).toHaveProperty("path");
      expect(entry).toHaveProperty("title");
      expect(entry).toHaveProperty("frontmatter");
    }
  });

  it("returns valid JSON for all section with content_grep", async () => {
    const result = await vault_find.execute(
      {
        section: "all",
        content_grep: "vault_find",
      },
      {} as ToolContext,
    );
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
  });
});
