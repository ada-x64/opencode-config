import { tool } from "@opencode-ai/plugin";
import path from "path";

const configDir =
  process.env.OPENCODE_CONFIG_SRC ||
  path.join(process.env.HOME || "~", ".config/opencode");

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
    const script = path.join(configDir, "skills/gh-helpers/create-pr.sh");
    const result =
      await Bun.$`bash ${script} ${args.repo} ${args.base ?? "main"} ${args.head ?? ""} ${args.title ?? ""} ${args.summary ?? ""}`.text();
    return result.trim();
  },
});
