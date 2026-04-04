import { tool } from "@opencode-ai/plugin";
import { libTool } from "./_lib";

export default libTool({
  description:
    "Remove a git worktree. Best-effort — never fails the caller's workflow. " +
    "Only operates on actual worktrees (not clones or bare roots). " +
    "Use after a branch is merged to clean up the worktree directory.",
  args: {
    worktree_path: tool.schema
      .string()
      .describe("Absolute path to the worktree to remove"),
  },
  lib: "skills/lib/worktree.sh",
  fn: "wt_cleanup",
  catchMessage: "Cleanup completed (or already clean)",
  postProcess: (result) => result || "Worktree cleanup completed",
});
