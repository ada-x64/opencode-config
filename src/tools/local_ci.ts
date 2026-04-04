import { tool } from "@opencode-ai/plugin";
import { scriptTool } from "./_lib";

export default scriptTool({
  description:
    "Run and debug GitHub Actions workflows locally using gh act. " +
    "Starts a Docker artifact server and passes arguments through " +
    "to gh act. Use this to test CI locally before pushing.",
  args: {
    workflow: tool.schema
      .string()
      .optional()
      .describe("Workflow file path (e.g. '.github/workflows/lint.yml')"),
    job: tool.schema
      .string()
      .optional()
      .describe("Specific job ID to run (e.g. 'lint')"),
    event: tool.schema
      .string()
      .optional()
      .describe("Event name to simulate (default: push)"),
    extra_args: tool.schema
      .string()
      .optional()
      .describe("Additional arguments to pass to gh act (space-separated)"),
  },
  script: "skills/local-ci/act.sh",
  buildArgs: (args) => {
    const flags: string[] = [];
    if (args.workflow) flags.push("-W", args.workflow);
    if (args.job) flags.push("-j", args.job);
    if (args.event) flags.push("-e", args.event);
    if (args.extra_args) flags.push(...args.extra_args.split(" "));
    return flags;
  },
});
