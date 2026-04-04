import { tool } from "@opencode-ai/plugin";
import { libTool } from "./_lib";

export default libTool({
  description:
    "Detect the git repository type at a given path. " +
    "Returns 'clone' (traditional .git directory), 'worktree' (.git file), " +
    "'bare' (bare repo with HEAD+refs), or 'unknown'.",
  args: {
    path: tool.schema
      .string()
      .describe("Absolute path to the repository root to detect"),
  },
  lib: "skills/lib/worktree.sh",
  fn: "wt_detect",
  nothrow: true,
});
