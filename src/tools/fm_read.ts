import { tool } from "@opencode-ai/plugin";
import path from "path";

const configDir =
  process.env.OPENCODE_CONFIG_SRC ||
  path.join(process.env.HOME || "~", ".config/opencode");

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
    const lib = path.join(configDir, "skills/lib/frontmatter.sh");
    const result =
      await Bun.$`bash -c ${'source "$1" && fm_read "$2" "$3" "$4"'} _ ${lib} ${args.file} ${args.key} ${args.default_value ?? ""}`.text();
    return result.trim();
  },
});
