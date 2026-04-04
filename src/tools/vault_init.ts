import { tool } from "@opencode-ai/plugin";
import { scriptTool } from "./_lib";

export default scriptTool({
  description:
    "Initialize or verify the agent vault directory structure. " +
    "Creates all directories and copies templates without overwriting " +
    "existing files. Idempotent — safe to run multiple times.",
  args: {
    vault_path: tool.schema
      .string()
      .optional()
      .describe("Path to the vault directory (default: $AGENT_VAULT)"),
  },
  script: "skills/vault-init/init.sh",
  buildArgs: (args) => (args.vault_path ? [args.vault_path] : []),
});
