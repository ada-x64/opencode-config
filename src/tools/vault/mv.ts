import { tool } from "@opencode-ai/plugin";
import fs from "fs/promises";
import path from "path";
import { resolveVaultPath } from "./_lib";

export default tool({
  description:
    "Move or rename a file or directory within the vault. " +
    "Auto-creates parent directories for the target. " +
    "Both paths are relative to $AGENT_VAULT.",
  args: {
    from: tool.schema.string().describe("Source path relative to vault root"),
    to: tool.schema
      .string()
      .describe("Destination path relative to vault root"),
  },
  async execute(args) {
    const src = resolveVaultPath(args.from);
    const dst = resolveVaultPath(args.to);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.rename(src, dst);
    return `Moved ${args.from} → ${args.to}`;
  },
});
