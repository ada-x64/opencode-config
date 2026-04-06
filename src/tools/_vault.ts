import path from "path";

/**
 * Return $AGENT_VAULT, throwing if unset.
 */
export function vaultRoot(): string {
  const v = process.env.AGENT_VAULT;
  if (!v) throw new Error("AGENT_VAULT is not set");
  return v;
}

/**
 * Resolve a relative path against $AGENT_VAULT.
 * Throws if AGENT_VAULT is unset or if the resolved path escapes the vault.
 */
export function resolveVaultPath(relativePath: string): string {
  const root = vaultRoot();
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(
      `Path traversal blocked: '${relativePath}' resolves outside vault`,
    );
  }
  return resolved;
}
