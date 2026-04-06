import { tool } from "@opencode-ai/plugin";
import path from "path";
import fs from "fs/promises";
import { resolveVaultPath } from "./_vault";

export default tool({
  description:
    "Write content to a file in the vault. Auto-creates parent " +
    "directories. Overwrites existing files. Paths are relative to " +
    "$AGENT_VAULT.",
  args: {
    path: tool.schema
      .string()
      .describe(
        "Relative path within the vault (e.g. 'tasks/owner/repo/task/schema.md')",
      ),
    content: tool.schema.string().describe("Content to write to the file"),
  },
  async execute(args) {
    const resolved = resolveVaultPath(args.path);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await Bun.write(resolved, args.content);
    const lines = args.content.split("\n").length;
    return `Wrote ${lines} lines to ${args.path}`;
  },
});
