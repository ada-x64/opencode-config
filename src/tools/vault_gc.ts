import { tool } from "@opencode-ai/plugin";
import path from "path";

const configDir =
  process.env.OPENCODE_CONFIG_SRC ||
  path.join(process.env.HOME || "~", ".config/opencode");

export default tool({
  description:
    "Archive completed vault tasks. A task is complete if its schema " +
    "status is 'complete' or its linked GitHub issue is closed. " +
    "Moves task directories from tasks/ to _misc/archive/tasks/. " +
    "Use --dry-run to preview without moving.",
  args: {
    dry_run: tool.schema
      .boolean()
      .optional()
      .describe("Preview what would be archived without moving files"),
  },
  async execute(args) {
    const script = path.join(configDir, "skills/vault-gc/gc.sh");
    const cmd = args.dry_run ? ["bash", script, "--dry-run"] : ["bash", script];
    const result = await Bun.$`${cmd}`.text();
    return result.trim();
  },
});
