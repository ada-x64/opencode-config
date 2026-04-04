import { tool } from "@opencode-ai/plugin";
import { scriptTool } from "./_lib";

export default scriptTool({
  description:
    "Refresh the GitHub metadata cache (projects, milestones, labels) " +
    "for repositories with vault content. Use this tool when the cache " +
    "is stale, after creating new milestones or labels, or before planning " +
    "sessions that need up-to-date project board or milestone information.",
  args: {
    filter: tool.schema
      .string()
      .optional()
      .describe(
        "Filter to a specific owner/repo (e.g. 'ada-x64/opencode-config'). " +
          "Default: all repos with vault content.",
      ),
  },
  script: "skills/vault-cache/refresh.sh",
  buildArgs: (args) => (args.filter ? [args.filter] : []),
});
