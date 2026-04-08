import { tool } from "@opencode-ai/plugin";
import { readFile } from "node:fs/promises";
import { fmRead } from "./_lib";

export default tool({
  description:
    "Read a value from the YAML frontmatter of a Markdown file. " +
    "Returns the value of the specified key, or the default if the key is absent.",
  args: {
    file: tool.schema.string().describe("Absolute path to the Markdown file"),
    key: tool.schema
      .string()
      .describe("Frontmatter key to read (e.g. 'status', 'repo', 'issue')"),
    default_value: tool.schema
      .string()
      .optional()
      .describe("Value to return if the key is absent (default: empty string)"),
  },
  async execute(args) {
    const content = await readFile(args.file, "utf-8");
    return fmRead(content, args.key, args.default_value ?? "");
  },
});
