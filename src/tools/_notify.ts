import path from "path";
import fs from "fs/promises";

export async function notifyTriage(opts: {
  type: string;
  task: string;
  headline: string;
  body?: string;
  file?: string;
  icon?: string;
  emoji?: string;
}): Promise<void> {
  try {
    // Priority and tag by type
    let priority = "default";
    let tag = "information_source";

    switch (opts.type) {
      case "escalation":
        priority = "high";
        tag = "rotating_light";
        break;
      case "design-question":
        priority = "high";
        tag = "question";
        break;
      case "activity":
        priority = "default";
        tag = "hammer_and_wrench";
        break;
      case "handoff":
        priority = "default";
        tag = "handshake";
        break;
      case "run-summary":
        priority = "low";
        tag = "memo";
        break;
    }

    // Override priority from env
    if (process.env.NOTIFY_TRIAGE_PRIORITY) {
      priority = process.env.NOTIFY_TRIAGE_PRIORITY;
    }

    // Icon URL construction — strip "auto-" prefix for PNG lookup
    const base =
      "https://raw.githubusercontent.com/ada-x64/opencode-config/main/images";
    const rawIcon = opts.icon ?? "default";
    const isAuto = rawIcon.startsWith("auto-");
    const iconName = rawIcon.replace(/^auto-/, "");
    const iconUrl = `${base}/${iconName}.png`;

    // Emoji resolution: semantic key → emoji, fallback to type default
    const emojiMap: Record<string, string> = {
      activity: "📋",
      clean: "🟢",
      warn: "🟡",
      reject: "🔴",
      escalation: "❗",
      "design-question": "❓",
    };

    let emojiPrefix =
      opts.emoji !== undefined ? (emojiMap[opts.emoji] ?? "") : "";
    if (!emojiPrefix) {
      // Fall back to type-based default
      if (opts.type === "escalation") emojiPrefix = "❗";
      else if (opts.type === "design-question") emojiPrefix = "❓";
      else emojiPrefix = "📋";
    }
    if (isAuto) emojiPrefix = "⚙️" + emojiPrefix;

    // Title
    const taskName = opts.task.split("/").at(-1) ?? opts.task;
    const fullTitle = `${emojiPrefix} [${taskName}]${opts.headline ? " " + opts.headline : ""}`;

    // Topic resolution: env var → file → silent skip
    let topic = process.env.NTFY_TOPIC ?? "";
    if (!topic && process.env.AGENT_VAULT) {
      try {
        const topicFile = path.join(
          process.env.AGENT_VAULT,
          "_misc/cache/ntfy-topic.txt",
        );
        topic = (await fs.readFile(topicFile, "utf8")).trim();
      } catch {
        // file not present — continue
      }
    }
    if (!topic) return; // silent skip

    // Click URL (Obsidian deep link)
    const agentVault = process.env.AGENT_VAULT ?? "";
    const vaultName = path.basename(agentVault);
    let clickUrl = "";
    if (vaultName) {
      const filePath = opts.file ?? `tasks/${opts.task}/triage`;
      const fileNoExt = filePath.replace(/\.md$/, "");
      clickUrl = `obsidian://open?vault=${vaultName}&file=${fileNoExt}`;
    }

    // Notification body
    const notifyBody = opts.body ?? opts.headline;

    // Build headers
    const headers: Record<string, string> = {
      Title: fullTitle,
      Priority: priority,
      Tags: tag,
      Icon: iconUrl,
    };
    if (clickUrl) headers["Click"] = clickUrl;

    // Send via fetch — fail silently
    await fetch(`https://ntfy.sh/${topic}`, {
      method: "POST",
      headers,
      body: notifyBody,
    });
  } catch {
    // Never throw — notifications must not interrupt agent work
  }
}
