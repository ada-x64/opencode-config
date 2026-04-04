import { tool } from "@opencode-ai/plugin";
import { libTool } from "./_lib";

export default libTool({
  description:
    "Derive the owner/repo slug from a repository path under $AGENT_REPOS. " +
    "Always returns exactly 2 path components (owner/repo), regardless of " +
    "worktree depth. Works for clones, worktrees, and bare repos.",
  args: {
    path: tool.schema
      .string()
      .describe(
        "Absolute path to the repository (e.g. $AGENT_REPOS/ada-x64/myrepo/main)",
      ),
  },
  lib: "skills/lib/worktree.sh",
  fn: "wt_owner_repo",
});
