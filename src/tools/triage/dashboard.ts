import { tool } from "@opencode-ai/plugin";
import { fmRead } from "../fm/_lib";
import fs from "fs/promises";
import path from "path";

export default tool({
  description:
    "Regenerate the triage inbox dashboard at $AGENT_VAULT/triage-inbox.md. " +
    "Scans all triage files, groups by status (pending/addressed/dismissed), " +
    "and writes a Markdown table dashboard. Optionally sends a summary " +
    "notification via ntfy.",
  args: {
    notify_summary: tool.schema
      .boolean()
      .optional()
      .describe("Send a triage summary notification after generating"),
  },
  async execute(args) {
    const vault = process.env.AGENT_VAULT;
    if (!vault) return "AGENT_VAULT is not set";

    // Directories to scan (new layout)
    const triageDirs = [
      path.join(vault, "_misc/triage"),
      path.join(vault, "_misc/activity"),
      path.join(vault, "_misc/handoffs"),
    ];

    interface Row {
      link: string;
      type: string;
      agent: string;
      date: string;
    }

    const pending: Row[] = [];
    const addressed: Row[] = [];
    const dismissed: Row[] = [];
    let escalationCount = 0;

    for (const dir of triageDirs) {
      let entries: string[];
      try {
        const all = await fs.readdir(dir);
        entries = all.filter((e) => e.endsWith(".md"));
      } catch {
        // Directory doesn't exist — skip silently
        continue;
      }

      for (const entry of entries) {
        const filePath = path.join(dir, entry);
        let content: string;
        try {
          content = await fs.readFile(filePath, "utf8");
        } catch {
          continue;
        }

        const status = fmRead(content, "status", "unknown");
        const type = fmRead(content, "type", "unknown");
        const agent = fmRead(content, "agent", "unknown");
        const date = fmRead(content, "date", "unknown");

        // Vault-relative path, strip leading separator, strip .md
        const rel = filePath.slice(vault.length + 1).replace(/\.md$/, "");
        const row: Row = { link: `[[${rel}]]`, type, agent, date };

        switch (status) {
          case "addressed":
            addressed.push(row);
            break;
          case "dismissed":
            dismissed.push(row);
            break;
          default:
            // "pending" or any unrecognised status → pending bucket
            pending.push(row);
            if (type === "escalation") escalationCount++;
            break;
        }
      }
    }

    // ── notify-summary mode ──────────────────────────────────────────────────
    if (args.notify_summary) {
      let topic = process.env.NTFY_TOPIC ?? "";
      if (!topic) {
        try {
          const topicFile = path.join(vault, "_misc/ntfy-topic.txt");
          topic = (await fs.readFile(topicFile, "utf8")).trim();
        } catch {
          // file not present
        }
      }
      if (!topic) return "No NTFY_TOPIC set — skipping notification";

      let summary = `${pending.length} pending`;
      if (escalationCount > 0) summary += ` (${escalationCount} escalation(s))`;
      summary += `, ${addressed.length} addressed, ${dismissed.length} dismissed`;

      const priority = escalationCount > 0 ? "high" : "default";
      const vaultName = path.basename(vault);
      const clickUrl = `obsidian://open?vault=${vaultName}&file=triage-inbox`;

      try {
        await fetch(`https://ntfy.sh/${topic}`, {
          method: "POST",
          headers: {
            Title: "Triage Summary",
            Priority: priority,
            Tags: "clipboard",
            Click: clickUrl,
          },
          body: summary,
        });
      } catch {
        // fail silently
      }

      return summary;
    }

    // ── dashboard generation mode ────────────────────────────────────────────
    const TABLE_HEADER =
      "| Task | Type | Agent | Date |\n|------|------|-------|------|";

    const formatRow = (r: Row) =>
      `| ${r.link} | ${r.type} | ${r.agent} | ${r.date} |`;

    const renderSection = (rows: Row[], emptyMsg: string): string =>
      rows.length === 0
        ? emptyMsg
        : TABLE_HEADER + "\n" + rows.map(formatRow).join("\n");

    // "YYYY-MM-DD HH:MM UTC"
    const now = new Date();
    const generated = now.toISOString().slice(0, 16).replace("T", " ") + " UTC";

    const dashboard = [
      "# Triage Inbox",
      "",
      `_Generated: ${generated}_`,
      "",
      "## Pending",
      "",
      renderSection(pending, "_No pending triage items._"),
      "",
      "## Addressed",
      "",
      renderSection(addressed, "_None._"),
      "",
      "## Dismissed",
      "",
      renderSection(dismissed, "_None._"),
    ].join("\n");

    const outputPath = path.join(vault, "triage-inbox.md");
    await fs.writeFile(outputPath, dashboard, "utf8");

    return (
      `Dashboard written to ${outputPath}\n` +
      `  ${pending.length} pending, ${addressed.length} addressed, ${dismissed.length} dismissed`
    );
  },
});
