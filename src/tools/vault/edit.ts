import { tool } from "@opencode-ai/plugin";
import { resolveVaultPath } from "./_lib";

export default tool({
  description:
    "Edit a file in the vault by replacing a string. Paths are " +
    "relative to $AGENT_VAULT. Errors if the old string is not found " +
    "or found multiple times (unless replace_all is true).",
  args: {
    path: tool.schema.string().describe("Relative path within the vault"),
    old_string: tool.schema.string().describe("The text to find and replace"),
    new_string: tool.schema.string().describe("The replacement text"),
    replace_all: tool.schema
      .boolean()
      .optional()
      .describe("Replace all occurrences (default: false)"),
  },
  async execute(args) {
    const resolved = resolveVaultPath(args.path);
    const content = await Bun.file(resolved).text();

    if (!content.includes(args.old_string)) {
      throw new Error(`old_string not found in ${args.path}`);
    }

    if (!args.replace_all) {
      const count = content.split(args.old_string).length - 1;
      if (count > 1) {
        throw new Error(
          `Found ${count} matches for old_string in ${args.path}. ` +
            `Use replace_all to replace every occurrence.`,
        );
      }
    }

    const newContent = args.replace_all
      ? content.replaceAll(args.old_string, args.new_string)
      : content.replace(args.old_string, args.new_string);

    await Bun.write(resolved, newContent);
    return `Edited ${args.path}`;
  },
});
