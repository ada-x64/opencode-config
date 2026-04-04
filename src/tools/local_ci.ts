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
    event_file: tool.schema
      .string()
      .optional()
      .describe(
        "Path to a JSON event payload file to pass to gh act via -e " +
          "(e.g. 'event.json'). Must be a file path, not an event name.",
      ),
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
    if (args.event_file) flags.push("-e", args.event_file);
    if (args.extra_args)
      flags.push(...args.extra_args.split(" ").filter(Boolean));
    return flags;
  },
});
