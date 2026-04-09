import { tool } from "@opencode-ai/plugin";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Build the disclosure footer appended to every agent-generated comment.
 * Exported for testability.
 */
export function buildFooter(agent: string, now?: Date): string {
  const d = now ?? new Date();
  const ts = d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  return `\n\n---\n*Posted by **${agent}** at ${ts}*`;
}

export default tool({
  description:
    "Post a comment on a GitHub issue or PR with an auto-appended " +
    "agent disclosure footer. Wraps gh issue comment / gh pr comment.",
  args: {
    repo: tool.schema
      .string()
      .describe("GitHub owner/repo slug (e.g. 'ada-x64/opencode-config')"),
    number: tool.schema.number().describe("Issue or PR number"),
    body: tool.schema
      .string()
      .describe("Comment body in Markdown (footer is appended automatically)"),
    agent: tool.schema
      .string()
      .describe("Agent name for the disclosure footer (e.g. 'implementor')"),
    type: tool.schema
      .enum(["issue", "pr"])
      .optional()
      .describe("Comment target type (default: 'issue')"),
  },
  async execute(args) {
    const type = args.type ?? "issue";
    const footer = buildFooter(args.agent);
    const fullBody = args.body + footer;

    // Write to temp file for safe multi-line handling
    const tmpDir = await mkdtemp(join(tmpdir(), "gh-comment-"));
    const tmpFile = join(tmpDir, "body.md");
    try {
      await writeFile(tmpFile, fullBody, "utf-8");
      const cmd = type === "pr" ? "pr" : "issue";
      const result =
        await Bun.$`gh ${cmd} comment ${args.number} -R ${args.repo} --body-file ${tmpFile}`.text();
      return result.trim();
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  },
});
