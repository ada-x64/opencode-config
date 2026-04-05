import { tool } from "@opencode-ai/plugin";
import { wtDetect } from "./_worktree";

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
    const { worktree_path } = args;
    const repoType = await wtDetect(worktree_path);

    if (repoType !== "worktree") {
      return (
        `wt_cleanup: '${worktree_path}' is not a worktree ` +
        `(type: ${repoType}) — skipping`
      );
    }

    await Bun.$`git -C ${worktree_path} worktree remove ${worktree_path}`.nothrow();
    return "Worktree cleanup completed";
  },
});
