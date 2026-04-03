import { tool } from "@opencode-ai/plugin";
import path from "path";

const configDir =
  process.env.OPENCODE_CONFIG_SRC ||
  path.join(process.env.HOME || "~", ".config/opencode");

export default tool({
  description:
    "Create a GitHub issue from a schema Markdown file. " +
    "Extracts the H1 heading as the issue title. The body contains " +
    "the '## Problem' section as a visible summary, plus the full " +
    "schema in a <details> block. Returns the issue URL.",
  args: {
    schema_file: tool.schema
      .string()
      .describe("Absolute path to the schema.md file"),
    repo: tool.schema
      .string()
      .describe("GitHub owner/repo slug (e.g. 'ada-x64/opencode-config')"),
  },
  async execute(args) {
    const script = path.join(configDir, "skills/gh-helpers/create-issue.sh");
    const result =
      await Bun.$`bash ${script} ${args.schema_file} ${args.repo}`.text();
    return result.trim();
  },
});
