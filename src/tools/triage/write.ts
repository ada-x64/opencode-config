import { tool } from "@opencode-ai/plugin";
import fs from "fs/promises";
import path from "path";

export default tool({
  description:
    "Write a triage entry to the vault. Handles directory resolution " +
    "_misc/activity/, UTC timestamp " +
    "filename generation, and frontmatter construction. " +
    "Returns { path, filename } for use with notify_triage.",
  args: {
    type: tool.schema
      .enum([
        "activity",
        "escalation",
        "design-question",
        "handoff",
        "run-summary",
        "permissions-request",
      ])
      .describe("Triage entry type"),
    task: tool.schema
      .string()
      .describe(
        "owner/repo/task path (e.g. 'ada-x64/myrepo/fix-bug'). " +
          "First two components become repo, remainder becomes task name.",
      ),
    agent: tool.schema.string().describe("Agent name that produced this entry"),
    headline: tool.schema
      .string()
      .describe("Short summary for the triage entry title"),
    body: tool.schema
      .string()
      .describe("Markdown body content for the triage entry"),
    severity: tool.schema
      .string()
      .optional()
      .describe("Severity level for escalations (e.g. 'high', 'critical')"),
  },
  async execute(args) {
    const vault = process.env.AGENT_VAULT;
    if (!vault) return "Error: AGENT_VAULT is not set";

    // All types route to _misc/activity
    const subdir = "_misc/activity";

    const dir = path.join(vault, subdir);
    await fs.mkdir(dir, { recursive: true });

    // Generate UTC timestamp filename: YYYY-MM-DDTHH-MM-SS.md
    const now = new Date();
    const isoStr = now.toISOString(); // e.g. "2024-01-15T10:30:45.123Z"
    const datePart = isoStr.slice(0, 10); // "2024-01-15"
    const timePart = isoStr.slice(11, 19).replace(/:/g, "-"); // "10-30-45"
    const filename = `${datePart}T${timePart}.md`;
    const filepath = path.join(dir, filename);

    // Parse task into repo + task_name
    const parts = args.task.split("/");
    let repo: string;
    let taskName: string;
    if (parts.length >= 3) {
      repo = `${parts[0]}/${parts[1]}`;
      taskName = parts.slice(2).join("/");
    } else if (parts.length === 2) {
      repo = args.task;
      taskName = "";
    } else {
      repo = "";
      taskName = parts[0] ?? args.task;
    }

    // Build frontmatter + body
    const lines: string[] = [
      "---",
      `type: ${args.type}`,
      `agent: ${args.agent}`,
      `task: ${taskName}`,
      `repo: ${repo}`,
      `headline: ${args.headline}`,
      `date: ${datePart}`,
      "status: ⏳ pending",
    ];
    if (args.severity) {
      lines.push(`severity: ${args.severity}`);
    }
    lines.push("---", "", args.body);

    await fs.writeFile(filepath, lines.join("\n"), "utf8");

    const relPath = filepath.slice(vault.length + 1);
    return JSON.stringify({ path: relPath, filename });
  },
});
