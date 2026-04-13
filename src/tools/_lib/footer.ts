/**
 * Shared disclosure footer appended to all agent-generated GitHub artifacts
 * (comments, PRs). Centralised here so every tool uses the same format.
 */
export function buildFooter(agent: string, now?: Date): string {
  const d = now ?? new Date();
  const ts = d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  return `\n\n---\n*Posted by **${agent}** at ${ts}*`;
}
