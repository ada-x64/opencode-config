import { tool } from "@opencode-ai/plugin";
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { VAULT_MANIFEST } from "./_vault_manifest";

export default tool({
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
  async execute(args) {
    // 1. Resolve vault path
    let vault = args.vault_path ?? process.env.AGENT_VAULT ?? "";
    if (!vault) {
      return "Error: vault_path not provided and AGENT_VAULT is not set.";
    }

    // Expand leading ~
    if (vault === "~") {
      vault = os.homedir();
    } else if (vault.startsWith("~/")) {
      vault = path.join(os.homedir(), vault.slice(2));
    }

    const createdPaths: string[] = [];

    // Ensure vault root exists (always, not counted)
    await mkdir(vault, { recursive: true });

    // Helper: create a directory only if it doesn't already exist; track if created
    async function ensureDir(rel: string): Promise<void> {
      const full = path.join(vault, rel);
      try {
        await access(full);
      } catch {
        await mkdir(full, { recursive: true });
        createdPaths.push(rel);
      }
    }

    // Helper: write a file only if it doesn't already exist; track if created
    async function ensureFile(
      rel: string,
      content: string | Buffer,
    ): Promise<void> {
      const full = path.join(vault, rel);
      try {
        await access(full);
      } catch {
        // Ensure parent directory exists
        await mkdir(path.dirname(full), { recursive: true });
        await writeFile(full, content);
        createdPaths.push(rel);
      }
    }

    // 2. Walk the embedded vault manifest and replicate into the vault
    for (const entry of VAULT_MANIFEST) {
      if (entry.type === "dir") {
        await ensureDir(entry.path);
      } else {
        const content =
          entry.encoding === "base64"
            ? Buffer.from(entry.content!, "base64")
            : entry.content!;
        await ensureFile(entry.path, content);
      }
    }

    // 3. Build output
    const header = `Initializing vault at: ${vault}`;

    if (createdPaths.length === 0) {
      return `${header}\n\nDone: vault already fully initialized.\nVault path: ${vault}`;
    }

    const lines = createdPaths.map((p) => `  created: ${p}`).join("\n");
    return `${header}\n\n${lines}\n\nDone: ${createdPaths.length} items created.\nVault path: ${vault}`;
  },
});
