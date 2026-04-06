import { tool } from "@opencode-ai/plugin";
import { notifyTriage } from "./_notify";

export default tool({
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
        "Agent/skill icon name (e.g. 'planner', 'auto-implementor'). " +
          "Maps to PNG on GitHub. Auto- prefix is stripped for URL.",
      ),
    emoji: tool.schema
      .string()
      .optional()
      .describe(
        "Semantic key for emoji prefix: activity, clean, warn, reject, escalation, design-question",
      ),
  },
  async execute(args) {
    await notifyTriage({
      type: args.type,
      task: args.task,
      headline: args.headline,
      body: args.body,
      file: args.file,
      icon: args.icon,
      emoji: args.emoji,
    });
    return "Notification sent (or silently skipped if ntfy not configured)";
  },
});
