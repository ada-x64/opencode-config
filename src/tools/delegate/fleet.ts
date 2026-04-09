import { tool } from "@opencode-ai/plugin";
import { assertNotSandbox, delegateFleet } from "./_lib";

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
    assertNotSandbox();
    if (args.sessions.length === 0) {
      throw new Error(
        "sessions array must not be empty — provide at least one {title, prompt} session spec",
      );
    }
    const sessionIds = await delegateFleet({
      repo: args.repo,
      sessions: args.sessions,
      group: args.group,
    });
    return JSON.stringify(sessionIds);
  },
});
