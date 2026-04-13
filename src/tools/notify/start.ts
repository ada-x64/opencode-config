import { tool } from "@opencode-ai/plugin";
import { setSessionStart } from "./_lib";

export default tool({
  description:
    "Record the session start time. Call this once at the beginning of " +
    "direct work. The stored timestamp is used automatically by " +
    "notify_session — no need to pass start_epoch manually.",
  args: {},
  async execute() {
    const epoch = setSessionStart();
    return `Session start recorded: ${epoch} (${new Date(epoch * 1000).toISOString()})`;
  },
});
