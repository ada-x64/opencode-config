import { afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import path from "path";
import { generateVaultManifest } from "../../scripts/build";

// Generate the vault manifest before importing vault_init (which depends on it)
const repoRoot = path.resolve(import.meta.dir, "../..");
const vaultSrc = path.join(repoRoot, "src", "vault");
const manifestOut = path.join(repoRoot, "src", "tools", "vault", "_vault_manifest.ts");
generateVaultManifest(vaultSrc, manifestOut);

const { default: vault_init } = await import("../../src/tools/vault/init");
const { execute_tool } = await import("./_lib");

const AGENT_VAULT = mkdtempSync("vault-test-");
process.env.AGENT_VAULT = AGENT_VAULT;

await execute_tool(vault_init, { vault_path: AGENT_VAULT });

afterAll(() => {
  rmSync(AGENT_VAULT, { recursive: true, force: true });
});
