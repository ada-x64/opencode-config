import { tool } from "@opencode-ai/plugin";
import { getSessionStart, notifyTriage } from "./_lib";

export default tool({
  description:
    "Send a session completion notification if the task took longer " +
    "than 3 minutes. Call this at the end of direct work (not after " +
    "dispatching a subagent). Compares current time against the " +
    "provided start epoch and only sends a notification if elapsed " +
    "time exceeds 180 seconds.",
  args: {
    start_epoch: tool.schema
      .string()
      .optional()
      .describe(
        "Unix epoch (seconds). If omitted, uses the value from session_start.",
      ),
    icon: tool.schema
      .string()
      .describe("Mode icon name: 'build', 'plan', or 'auditor'"),
    task: tool.schema
      .string()
      .optional()
      .describe(
        "owner/repo/task context for the notification (default: 'session')",
      ),
    headline: tool.schema
      .string()
      .optional()
      .describe("Notification headline (default: 'Session Task Complete')"),
  },
  async execute(args) {
    let startStr = args.start_epoch;
    if (!startStr) {
      const stored = getSessionStart();
      if (stored === null) {
        return "No start_epoch provided and session_start was never called";
      }
      startStr = stored.toString();
    }

    if (!/^\d+$/.test(startStr)) {
      return "Invalid start_epoch — must be a Unix timestamp";
    }

    const now = Math.floor(Date.now() / 1000);
    const start = parseInt(startStr, 10);
    const elapsed = now - start;

    if (elapsed <= 180) {
      return `Task completed in ${elapsed}s — below 3-minute notification threshold`;
    }

    const minutes = Math.floor(elapsed / 60);
    await notifyTriage({
      type: "activity",
      task: args.task ?? "session",
      headline: args.headline ?? "Session Task Complete",
      body: "Elapsed: " + minutes + " minutes",
      icon: args.icon,
    });

    return `Notification sent — task took ${minutes} minutes`;
  },
});
