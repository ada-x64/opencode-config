import { tool } from "@opencode-ai/plugin";
import { libTool } from "./_lib";

export default libTool({
  description:
    "Send a triage push notification via ntfy. " +
    "Fails silently if ntfy is not configured. " +
    "Used after writing a triage entry to alert the user.",
  args: {
    type: tool.schema
      .enum([
        "activity",
        "escalation",
        "design-question",
        "handoff",
        "run-summary",
      ])
      .describe("Triage entry type"),
    task: tool.schema
      .string()
      .describe("owner/repo/task path (e.g. 'ada-x64/myrepo/fix-bug')"),
    headline: tool.schema
      .string()
      .describe(
        "Short action phrase for notification title (e.g. 'Commit Group 1 Complete')",
      ),
    body: tool.schema
      .string()
      .optional()
      .describe("Bullet-point detail text for notification body"),
    file: tool.schema
      .string()
      .optional()
      .describe(
        "Vault-relative path to the triage file (default: tasks/<task>/triage.md)",
      ),
    icon: tool.schema
      .string()
      .optional()
      .describe(
        "Agent/icon name (e.g. 'planner', 'auto-implementor'). " +
          "Maps to PNG on GitHub. Auto- prefix is stripped for URL.",
      ),
    emoji: tool.schema
      .string()
      .optional()
      .describe(
        "Semantic key for emoji prefix: activity, clean, warn, reject, escalation, design-question",
      ),
  },
  lib: "skills/vault-triage/notify.sh",
  fn: "notify_triage",
  postProcess: (result) =>
    result || "Notification sent (or silently skipped if ntfy not configured)",
});
