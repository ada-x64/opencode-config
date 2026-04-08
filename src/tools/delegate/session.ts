import { tool } from "@opencode-ai/plugin";
import { scriptPath } from "./_lib";

export default tool({
  description:
    "Spawn an AoE session for parallel agent work. " +
    "Supports opencode (sandbox) and copilot (cloud) backends. " +
    "Copilot sessions use isolated worktrees to prevent index.lock conflicts. " +
    "Returns the session ID for monitoring.",
  args: {
    repo: tool.schema.string().describe("Absolute path to the repository"),
    prompt: tool.schema
      .string()
      .describe("Task prompt text to send to the spawned agent"),
    title: tool.schema.string().describe("AoE session title"),
    tool: tool.schema
      .enum(["opencode", "copilot"])
      .optional()
      .describe("Backend to use (default: opencode)"),
    branch: tool.schema
      .string()
      .optional()
      .describe(
        "Branch name (opencode: creates worktree with -b flag; copilot: determines worktree HEAD commit)",
      ),
    new_branch: tool.schema
      .boolean()
      .optional()
      .describe("Create a new branch (default: true, use with branch)"),
    group: tool.schema
      .string()
      .optional()
      .describe("AoE group for organizing sessions"),
  },
  async execute(args) {
    // Safety: Bun.$`` passes each ${} interpolation as a separate argv entry.
    // Prompt text, repo paths, and other args are never shell-expanded.
    const result =
      await Bun.$`bash -euo pipefail -c ${'source "$1" && delegate_session "$2" "$3" "$4" "$5" "$6" "$7" "$8"'} _ ${scriptPath} ${args.repo} ${args.prompt} ${args.title} ${args.tool ?? "opencode"} ${args.branch ?? ""} ${String(args.new_branch ?? true)} ${args.group ?? ""}`.text();
    return result.trim();
  },
});
