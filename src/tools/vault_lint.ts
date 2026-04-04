import { tool } from "@opencode-ai/plugin";
import { scriptTool } from "./_lib";

export default scriptTool({
  description:
    "Validate vault schemas and reviews against format templates. " +
    "Checks YAML frontmatter, required sections, and structure. " +
    "Can also lint agent permission baselines.",
  args: {
    schemas_only: tool.schema
      .boolean()
      .optional()
      .describe("Only lint schemas (skip reviews)"),
    reviews_only: tool.schema
      .boolean()
      .optional()
      .describe("Only lint reviews (skip schemas)"),
    agents: tool.schema
      .boolean()
      .optional()
      .describe("Lint agent permission baselines instead of vault files"),
    filter: tool.schema
      .string()
      .optional()
      .describe(
        "Filter by owner/repo (e.g. 'ada-x64/opencode-config'). " +
          "Ignored when --agents is set.",
      ),
  },
  script: "skills/vault-lint/lint.sh",
  buildArgs: (args) => {
    const flags: string[] = [];
    if (args.schemas_only) flags.push("--schemas-only");
    if (args.reviews_only) flags.push("--reviews-only");
    if (args.agents) flags.push("--agents");
    if (args.filter) flags.push(args.filter);
    return flags;
  },
});
