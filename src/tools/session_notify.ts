import { tool } from "@opencode-ai/plugin";
import path from "path";
import { configDir } from "./_lib";

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
      .describe(
        "Unix epoch (seconds) captured at the start of work via date +%s",
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
    const now = Math.floor(Date.now() / 1000);
    const start = parseInt(args.start_epoch, 10);
    if (isNaN(start) || !/^\d+$/.test(args.start_epoch))
      return "Invalid start_epoch — must be a Unix timestamp";

    const elapsed = now - start;
    if (elapsed <= 180) {
      return `Task completed in ${elapsed}s — below 3-minute notification threshold`;
    }

    const minutes = Math.floor(elapsed / 60);
    const taskCtx = args.task ?? "session";
    const headline = args.headline ?? "Session Task Complete";

    const notifyScript = path.join(configDir, "skills/vault-triage/notify.sh");
    await Bun.$`bash -c ${'source "$1" && notify_triage "$2" "$3" "$4" "$5" "" "$6" ""'} _ ${notifyScript} activity ${taskCtx} ${headline} ${"Elapsed: " + minutes + " minutes"} ${args.icon}`.nothrow();

    return `Notification sent — task took ${minutes} minutes`;
  },
});
