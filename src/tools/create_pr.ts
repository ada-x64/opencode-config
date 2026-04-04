import { tool } from "@opencode-ai/plugin";
import { scriptTool } from "./_lib";

export default scriptTool({
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
  script: "skills/gh-helpers/create-pr.sh",
  buildArgs: (args) => [
    args.repo,
    args.base ?? "main",
    args.head ?? "",
    args.title ?? "",
    args.summary ?? "",
  ],
});
