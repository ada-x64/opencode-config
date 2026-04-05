import { tool } from "@opencode-ai/plugin";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export default tool({
  description:
    "Create a GitHub pull request with body generated from commit " +
    "history, diff stats, and an optional summary. Returns the PR URL.",
  args: {
    repo: tool.schema
      .string()
      .describe("GitHub owner/repo slug (e.g. 'ada-x64/opencode-config')"),
    base: tool.schema
      .string()
      .optional()
      .describe("Base branch (default: main)"),
    head: tool.schema
      .string()
      .optional()
      .describe("Head branch (default: current branch)"),
    title: tool.schema
      .string()
      .optional()
      .describe("PR title (default: derived from branch name)"),
    summary: tool.schema
      .string()
      .optional()
      .describe(
        "Agent-generated summary placed in a ## Summary section at the top",
      ),
  },
  async execute(args) {
    const base = args.base ?? "main";

    // Resolve head branch
    const head =
      args.head ?? (await Bun.$`git branch --show-current`.text()).trim();

    // Resolve title
    let title: string;
    if (args.title) {
      title = args.title;
    } else {
      const words = head.replace(/-/g, " ");
      const firstSpace = words.indexOf(" ");
      if (firstSpace === -1) {
        // Single-word branch name
        title = words.charAt(0).toUpperCase() + words.slice(1);
      } else {
        const first = words.slice(0, firstSpace);
        const rest = words.slice(firstSpace + 1);
        title = first.charAt(0).toUpperCase() + first.slice(1) + " " + rest;
      }
    }

    // Get commits and diffstat (nothrow — fallback on error)
    const commits =
      (
        await Bun.$`git log --oneline ${base}..${head}`.nothrow().text()
      ).trim() || `(no commits ahead of ${base})`;

    const diffstat =
      (
        await Bun.$`git diff --stat ${base}...${head}`.nothrow().text()
      ).trim() || "(no diff)";

    // Build PR body
    const sections: string[] = [];
    if (args.summary) {
      sections.push(`## Summary\n\n${args.summary}`);
    }
    sections.push(`## Commits\n\n\`\`\`\n${commits}\n\`\`\``);
    sections.push(`## Diff summary\n\n\`\`\`\n${diffstat}\n\`\`\``);
    const body = sections.join("\n\n");

    // Write to temp file, run gh, then clean up
    const tmpDir = await mkdtemp(join(tmpdir(), "create-pr-"));
    const tmpFile = join(tmpDir, "body.md");
    try {
      await writeFile(tmpFile, body, "utf-8");
      const result =
        await Bun.$`gh pr create -R ${args.repo} --base ${base} --head ${head} --title ${title} --body-file ${tmpFile}`.text();
      return result.trim();
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  },
});
