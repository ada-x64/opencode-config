import { tool } from "@opencode-ai/plugin";
import path from "path";

const configDir =
  process.env.OPENCODE_CONFIG_SRC ||
  path.join(process.env.HOME || "~", ".config/opencode");

export default tool({
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
  async execute(args) {
    const lib = path.join(configDir, "skills/lib/worktree.sh");
    const result =
      await Bun.$`bash -c ${'source "$1" && wt_owner_repo "$2"'} _ ${lib} ${args.path}`.text();
    return result.trim();
  },
});
