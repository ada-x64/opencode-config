import { tool } from "@opencode-ai/plugin";
import path from "path";

const configDir =
  process.env.OPENCODE_CONFIG_SRC ||
  path.join(process.env.HOME || "~", ".config/opencode");

export default tool({
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
  async execute(args) {
    const lib = path.join(configDir, "skills/lib/frontmatter.sh");
    await Bun.$`bash -c ${'source "$1" && fm_write "$2" "$3" "$4"'} _ ${lib} ${args.file} ${args.key} ${args.value}`;
    return `Updated ${args.key} to '${args.value}' in ${args.file}`;
  },
});
