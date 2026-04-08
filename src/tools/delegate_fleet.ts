import { tool } from "@opencode-ai/plugin";
import path from "path";

const configDir =
  process.env.OPENCODE_CONFIG_SRC ||
  path.join(process.env.HOME || "~", ".config/opencode");

export default tool({
  description:
    "Batch-dispatch multiple copilot AoE sessions in parallel. " +
    "Creates isolated worktrees, runs the confirmation protocol once " +
    "for all sessions, and returns successfully created session IDs as a JSON array. " +
    "Partial failures are logged to stderr; the array may be shorter than the input. " +
    "Use this instead of multiple delegate() calls for copilot fleet work.",
  args: {
    repo: tool.schema.string().describe("Absolute path to the repository"),
    sessions: tool.schema
      .array(
        tool.schema.object({
          title: tool.schema.string().describe("AoE session title"),
          prompt: tool.schema.string().describe("Task prompt for this session"),
          branch: tool.schema
            .string()
            .optional()
            .describe(
              "Branch or commit to check out in the temporary worktree",
            ),
        }),
      )
      .describe("Array of session specs to dispatch in parallel"),
    group: tool.schema
      .string()
      .optional()
      .describe("AoE group for organizing sessions"),
  },
  async execute(args) {
    if (args.sessions.length === 0) {
      throw new Error("sessions array must not be empty");
    }
    const script = path.join(configDir, "skills/delegate/delegate.sh");
    const sessionsJson = JSON.stringify(args.sessions);
    // Safety: Bun.$`` passes each ${} interpolation as a separate argv entry
    // (shell word), not through shell expansion. sessionsJson arrives as a
    // literal $4 in the -c script — never interpreted by the shell.
    const result =
      await Bun.$`bash -euo pipefail -c ${'source "$1" && delegate_fleet "$2" "$3" "$4"'} _ ${script} ${args.repo} ${args.group ?? ""} ${sessionsJson}`.text();
    return result.trim();
  },
});
