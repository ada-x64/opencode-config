import { tool } from "@opencode-ai/plugin";
import { scriptTool } from "./_lib";

export default scriptTool({
  description:
    "Regenerate the triage inbox dashboard at $AGENT_VAULT/triage-inbox.md. " +
    "Scans all triage files, groups by status (pending/addressed/dismissed), " +
    "and writes a Markdown table dashboard. Optionally sends a summary " +
    "notification via ntfy.",
  args: {
    notify_summary: tool.schema
      .boolean()
      .optional()
      .describe("Send a triage summary notification after generating"),
  },
  script: "skills/vault-triage/triage-dashboard.sh",
  buildArgs: (args) => (args.notify_summary ? ["--notify-summary"] : []),
});
