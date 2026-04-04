import { tool } from "@opencode-ai/plugin";
import { libTool } from "./_lib";

export default libTool({
  description:
    "Switch to a branch in a repo-type-aware way. For bare repos/worktrees, " +
    "creates a new worktree at <bare_root>/<branch>. For traditional clones, " +
    "runs git switch. Returns the working directory path to use for " +
    "subsequent operations.",
  args: {
    repo_path: tool.schema
      .string()
      .describe("Absolute path to the current repository working directory"),
    branch: tool.schema.string().describe("Branch name to switch to or create"),
  },
  lib: "skills/lib/worktree.sh",
  fn: "wt_switch_branch",
});
