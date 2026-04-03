import { tool } from "@opencode-ai/plugin";
import path from "path";

const configDir =
  process.env.OPENCODE_CONFIG_SRC ||
  path.join(process.env.HOME || "~", ".config/opencode");

export default tool({
  description:
    "Detect the git repository type at a given path. " +
    "Returns 'clone' (traditional .git directory), 'worktree' (.git file), " +
    "'bare' (bare repo with HEAD+refs), or 'unknown'.",
  args: {
    path: tool.schema
      .string()
      .describe("Absolute path to the repository root to detect"),
  },
  async execute(args) {
    const lib = path.join(configDir, "skills/lib/worktree.sh");
    // wt_detect exits 1 for "unknown" — use nothrow() so Bun.$ doesn't throw
    const result =
      await Bun.$`bash -c ${'source "$1" && wt_detect "$2"'} _ ${lib} ${args.path}`
        .nothrow()
        .text();
    return result.trim();
  },
});
