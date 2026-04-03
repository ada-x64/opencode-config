import { tool } from "@opencode-ai/plugin";
import path from "path";

const configDir =
  process.env.OPENCODE_CONFIG_SRC ||
  path.join(process.env.HOME || "~", ".config/opencode");

export default tool({
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
  async execute(args) {
    const script = path.join(
      configDir,
      "skills/vault-triage/triage-dashboard.sh",
    );
    const cmd = args.notify_summary
      ? ["bash", script, "--notify-summary"]
      : ["bash", script];
    const result = await Bun.$`${cmd}`.text();
    return result.trim();
  },
});
