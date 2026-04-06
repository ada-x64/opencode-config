import { tool } from "@opencode-ai/plugin";
import fs from "fs/promises";
import { resolveVaultPath } from "./_vault";

export default tool({
  description:
    "Read a file or directory from the vault. For files, returns the " +
    "content as a string. For directories, lists entries one per line " +
    "with a trailing / for subdirectories. Paths are relative to " +
    "$AGENT_VAULT.",
  args: {
    path: tool.schema
      .string()
      .describe(
        "Relative path within the vault (e.g. 'tasks/owner/repo/task/schema.md')",
      ),
  },
  async execute(args) {
    const resolved = resolveVaultPath(args.path);
    const stat = await fs.stat(resolved);
    if (stat.isDirectory()) {
      const entries = await fs.readdir(resolved, { withFileTypes: true });
      return entries
        .map((e) => (e.isDirectory() ? e.name + "/" : e.name))
        .join("\n");
    }
    return await Bun.file(resolved).text();
  },
});
