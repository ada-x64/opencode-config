import { afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import vault_init from "../../src/tools/vault_init";
import { execute_tool } from "./_lib";

const AGENT_VAULT = mkdtempSync("vault-test-");
process.env.AGENT_VAULT = AGENT_VAULT;

await execute_tool(vault_init, { vault_path: AGENT_VAULT });

afterAll(() => {
  rmSync(AGENT_VAULT, { recursive: true, force: true });
});
