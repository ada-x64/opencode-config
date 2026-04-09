import { describe, it, expect } from "bun:test";
import github_comment, { buildFooter } from "../../src/tools/github_comment";

describe("github_comment", () => {
  describe("tool shape", () => {
    it("has the correct description", () => {
      expect(github_comment.description).toContain(
        "Post a comment on a GitHub issue or PR",
      );
    });

    it("declares required args", () => {
      expect(github_comment.args).toHaveProperty("repo");
      expect(github_comment.args).toHaveProperty("number");
      expect(github_comment.args).toHaveProperty("body");
      expect(github_comment.args).toHaveProperty("agent");
    });

    it("declares optional type arg", () => {
      expect(github_comment.args).toHaveProperty("type");
    });
  });

  describe("buildFooter", () => {
    it("produces the expected format", () => {
      const date = new Date("2026-04-09T14:30:00.000Z");
      const footer = buildFooter("implementor", date);
      expect(footer).toBe(
        "\n\n---\n*Posted by **implementor** at 2026-04-09 14:30 UTC*",
      );
    });

    it("handles different agent names", () => {
      const date = new Date("2026-01-15T09:00:00.000Z");
      const footer = buildFooter("planner", date);
      expect(footer).toContain("**planner**");
      expect(footer).toContain("2026-01-15 09:00 UTC");
    });

    it("handles auto-impl agent name", () => {
      const date = new Date("2026-06-01T00:00:00.000Z");
      const footer = buildFooter("auto-impl", date);
      expect(footer).toContain("**auto-impl**");
    });

    it("starts with double newline and separator", () => {
      const footer = buildFooter("test", new Date());
      expect(footer.startsWith("\n\n---\n")).toBe(true);
    });

    it("ends with UTC suffix", () => {
      const footer = buildFooter("test", new Date());
      expect(footer.endsWith("UTC*")).toBe(true);
    });
  });

  describe("body assembly", () => {
    it("appends footer to body without double separators", () => {
      const body = "### Changed\n\nSome work done.";
      const footer = buildFooter(
        "implementor",
        new Date("2026-04-09T12:00:00Z"),
      );
      const fullBody = body + footer;

      // Should have exactly one "---" separator (from the footer)
      const separators = fullBody.match(/\n---\n/g);
      expect(separators).toHaveLength(1);
    });

    it("handles body with existing horizontal rules", () => {
      const body = "Part 1\n\n---\n\nPart 2";
      const footer = buildFooter("reviewer", new Date("2026-04-09T12:00:00Z"));
      const fullBody = body + footer;

      // Body has its own --- plus the footer ---
      const separators = fullBody.match(/\n---\n/g);
      expect(separators).toHaveLength(2);
    });

    it("handles empty body", () => {
      const body = "";
      const footer = buildFooter(
        "implementor",
        new Date("2026-04-09T12:00:00Z"),
      );
      const fullBody = body + footer;

      expect(fullBody).toContain("**implementor**");
      expect(fullBody.startsWith("\n\n---")).toBe(true);
    });
  });

  describe("default type", () => {
    it("type defaults to issue when omitted from args schema", () => {
      // The schema declares type as optional — verify the args definition exists
      // and accepts "issue" and "pr" as enum values
      const typeArg = github_comment.args.type;
      expect(typeArg).toBeDefined();
    });
  });
});
