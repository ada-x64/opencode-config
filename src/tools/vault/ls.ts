import { tool } from "@opencode-ai/plugin";
import fs from "fs/promises";
import { resolveVaultPath, vaultRoot } from "./_lib";
import path from "path";

export default tool({
  description:
    "List files in the vault. Without a pattern, lists the directory " +
    "at the given path. With a glob pattern, matches files within the " +
    "vault. Paths are relative to $AGENT_VAULT.",
  args: {
    path: tool.schema
      .string()
      .optional()
      .describe(
        "Relative directory path within the vault (default: vault root)",
      ),
    pattern: tool.schema
      .string()
      .optional()
      .describe(
        "Glob pattern to match (e.g. 'tasks/**/*.md'). " +
          "When set, 'path' is ignored.",
      ),
  },
  async execute(args) {
    const root = vaultRoot();

    if (args.pattern) {
      const glob = new Bun.Glob(args.pattern);
      const matches: string[] = [];
      for await (const match of glob.scan({ cwd: root })) {
        matches.push(match);
      }
      matches.sort();
      return matches.join("\n") || "(no matches)";
    }

    const dir = args.path ? resolveVaultPath(args.path) : root;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return (
      entries
        .map((e) => {
          const rel = path.relative(root, path.join(dir, e.name));
          return e.isDirectory() ? rel + "/" : rel;
        })
        .join("\n") || "(empty directory)"
    );
  },
});
