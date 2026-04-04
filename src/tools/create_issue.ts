import { tool } from "@opencode-ai/plugin";
import { scriptTool } from "./_lib";

export default scriptTool({
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
  script: "skills/gh-helpers/create-issue.sh",
  buildArgs: (args) => [args.schema_file, args.repo],
});
