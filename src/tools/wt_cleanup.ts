import { tool } from "@opencode-ai/plugin";
import path from "path";

const configDir =
  process.env.OPENCODE_CONFIG_SRC ||
  path.join(process.env.HOME || "~", ".config/opencode");

export default tool({
  description:
    "Remove a git worktree. Best-effort — never fails the caller's workflow. " +
    "Only operates on actual worktrees (not clones or bare roots). " +
    "Use after a branch is merged to clean up the worktree directory.",
  args: {
    worktree_path: tool.schema
      .string()
      .describe("Absolute path to the worktree to remove"),
  },
  async execute(args) {
    const lib = path.join(configDir, "skills/lib/worktree.sh");
    const result =
      await Bun.$`bash -c ${'source "$1" && wt_cleanup "$2"'} _ ${lib} ${args.worktree_path}`
        .text()
        .catch(() => "Cleanup completed (or already clean)");
    return result.trim() || "Worktree cleanup completed";
  },
});
