import { tool } from "@opencode-ai/plugin";
import fs from "fs/promises";
import { resolveVaultPath } from "./_lib";

export default tool({
  description:
    "Remove a file from the vault. Refuses to remove directories " +
    "(use vault_gc for bulk cleanup). Path is relative to $AGENT_VAULT.",
  args: {
    path: tool.schema.string().describe("Relative path to the file to remove"),
  },
  async execute(args) {
    const resolved = resolveVaultPath(args.path);
    const stat = await fs.stat(resolved);
    if (stat.isDirectory()) {
      throw new Error(
        `Refusing to remove directory '${args.path}'. ` +
          `Use vault_gc for bulk cleanup.`,
      );
    }
    await fs.unlink(resolved);
    return `Removed ${args.path}`;
  },
});
