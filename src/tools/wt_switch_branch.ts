import { tool } from "@opencode-ai/plugin";
import path from "path";

const configDir =
  process.env.OPENCODE_CONFIG_SRC ||
  path.join(process.env.HOME || "~", ".config/opencode");

export default tool({
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
  async execute(args) {
    const lib = path.join(configDir, "skills/lib/worktree.sh");
    const result =
      await Bun.$`bash -c ${'source "$1" && wt_switch_branch "$2" "$3"'} _ ${lib} ${args.repo_path} ${args.branch}`.text();
    return result.trim();
  },
});
