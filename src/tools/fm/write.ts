import { tool } from "@opencode-ai/plugin";
import { readFile, writeFile } from "node:fs/promises";
import { fmWrite, validateFmValue } from "./_lib";

export default tool({
  description:
    "Write a value to the YAML frontmatter of a Markdown file. " +
    "Replaces the first occurrence of the key in frontmatter. " +
    "If the key does not exist, this is a silent no-op.",
  args: {
    file: tool.schema.string().describe("Absolute path to the Markdown file"),
    key: tool.schema
      .string()
      .describe("Frontmatter key to write (e.g. 'status')"),
    value: tool.schema
      .string()
      .describe("Value to set (e.g. '📋 todo', '✅ complete')"),
  },
  async execute(args) {
    const original = await readFile(args.file, "utf-8");
    // Only validate if the key actually exists in frontmatter (fmWrite is a
    // silent no-op for missing keys, so validation shouldn't block that).
    const updated = fmWrite(original, args.key, args.value);
    if (updated !== original) {
      const error = validateFmValue(args.file, args.key, args.value);
      if (error) return `Error: ${error}`;
      await writeFile(args.file, updated, "utf-8");
    }
    return `Updated ${args.key} to '${args.value}' in ${args.file}`;
  },
});
