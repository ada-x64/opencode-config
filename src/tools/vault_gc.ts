import { tool } from "@opencode-ai/plugin";
import { scriptTool } from "./_lib";

export default scriptTool({
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
  script: "skills/vault-gc/gc.sh",
  buildArgs: (args) => (args.dry_run ? ["--dry-run"] : []),
});
