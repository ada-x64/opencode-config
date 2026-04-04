import { tool } from "@opencode-ai/plugin";
import { libTool } from "./_lib";

export default libTool({
  description:
    "Write a value to the YAML frontmatter of a Markdown file. " +
    "Replaces the first occurrence of the key in frontmatter. " +
    "If the key does not exist, this is a silent no-op. " +
    "Requires GNU sed (Linux).",
  args: {
    file: tool.schema.string().describe("Absolute path to the Markdown file"),
    key: tool.schema
      .string()
      .describe("Frontmatter key to write (e.g. 'status')"),
    value: tool.schema
      .string()
      .describe("Value to set (e.g. 'in progress', 'complete')"),
  },
  lib: "skills/lib/frontmatter.sh",
  fn: "fm_write",
  postProcess: (_result, args) =>
    `Updated ${args.key} to '${args.value}' in ${args.file}`,
});
