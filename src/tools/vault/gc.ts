import { tool } from "@opencode-ai/plugin";
import { readdir, readFile, rename, mkdir, cp, rm } from "node:fs/promises";
import path from "node:path";
import { fmRead } from "../fm/_lib";

export default tool({
  description:
    "Archive completed vault tasks. A task is complete if its schema " +
    "status is 'complete' or its linked GitHub issue is closed. " +
    "Moves task directories from tasks/ to _misc/archive/tasks/. " +
    "Use --dry-run to preview without moving.",
  args: {
    dry_run: tool.schema
      .boolean()
      .optional()
      .describe("Preview what would be archived without moving files"),
  },
  async execute(args) {
    const vault = process.env.AGENT_VAULT;
    if (!vault) return "Error: AGENT_VAULT is not set.";

    const tasksRoot = path.join(vault, "tasks");
    const archiveRoot = path.join(vault, "_misc/archive/tasks");
    const dryRun = args.dry_run ?? false;

    // Walk tasks/ recursively, collect schema.md files, skip /_fleet/
    let schemaFiles: string[] = [];
    try {
      const entries = await readdir(tasksRoot, { recursive: true });
      schemaFiles = entries
        .map((e) => path.join(tasksRoot, String(e)))
        .filter(
          (fullPath) =>
            path.basename(fullPath) === "schema.md" &&
            !fullPath.includes("/_fleet/"),
        );
    } catch {
      return "Error: could not read tasks/ directory (does it exist?).";
    }

    const toArchive: string[] = []; // absolute paths to task directories
    const noSignal: string[] = [];
    const errors: string[] = [];

    for (const schemaFile of schemaFiles) {
      // Task directory is the immediate parent of schema.md
      const taskDir = path.dirname(schemaFile);
      const taskRel = taskDir.slice(vault.length).replace(/^\//, "");

      let content: string;
      try {
        content = await readFile(schemaFile, "utf-8");
      } catch {
        errors.push(`  error: could not read ${taskRel}/schema.md`);
        continue;
      }

      // a. Check status frontmatter field
      const status = fmRead(content, "status");
      if (status === "complete") {
        toArchive.push(taskDir);
        continue;
      }

      // b. Check issue frontmatter field for a GitHub issue URL
      const issue = fmRead(content, "issue");
      if (!issue) {
        noSignal.push(taskRel);
        continue;
      }

      // Extract owner/repo/num from a URL like:
      //   https://github.com/owner/repo/issues/123
      const issueMatch = issue.match(
        /github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/,
      );
      if (!issueMatch) {
        noSignal.push(taskRel);
        continue;
      }

      const [, issueOwner, issueRepo, issueNum] = issueMatch;

      // c. Query the GitHub API
      try {
        const result =
          await Bun.$`gh api repos/${issueOwner}/${issueRepo}/issues/${issueNum}`.json();
        if (result?.state === "closed") {
          toArchive.push(taskDir);
        }
        // open or unknown → leave in place silently
      } catch {
        errors.push(
          `  error: gh api failed for ${issueOwner}/${issueRepo}#${issueNum}`,
        );
      }
    }

    // 4. Archive (or report) each task directory
    const archived: string[] = [];
    const archiveErrors: string[] = [];

    for (const taskDir of toArchive) {
      const taskRel = taskDir.slice(vault.length).replace(/^\//, "");
      // Strip leading "tasks/" to get owner/repo/task
      const innerRel = taskRel.replace(/^tasks\//, "");
      const dest = path.join(archiveRoot, innerRel);
      const destRel = dest.slice(vault.length).replace(/^\//, "");

      if (dryRun) {
        archived.push(`  [dry-run] would move: ${taskRel} → ${destRel}`);
        continue;
      }

      try {
        await mkdir(path.dirname(dest), { recursive: true });
        try {
          await rename(taskDir, dest);
        } catch (err: unknown) {
          // Cross-device move (EXDEV) — fall back to copy + remove
          if (
            err !== null &&
            typeof err === "object" &&
            "code" in err &&
            (err as NodeJS.ErrnoException).code === "EXDEV"
          ) {
            await cp(taskDir, dest, { recursive: true });
            await rm(taskDir, { recursive: true, force: true });
          } else {
            throw err;
          }
        }
        archived.push(`  moved: ${taskRel} → ${destRel}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        archiveErrors.push(`  error: ${taskRel}: ${msg}`);
      }
    }

    // 5. Build summary output
    const lines: string[] = [];

    if (archived.length > 0) {
      lines.push(dryRun ? "Tasks that would be archived:" : "Archived tasks:");
      lines.push(...archived);
    }

    if (noSignal.length > 0) {
      lines.push("No signal (skipped):");
      lines.push(...noSignal.map((p) => `  ${p}`));
    }

    if (errors.length > 0 || archiveErrors.length > 0) {
      lines.push("Errors:");
      lines.push(...errors, ...archiveErrors);
    }

    if (lines.length === 0) {
      return "GC complete: no tasks to archive.";
    }

    const summary = dryRun
      ? `GC dry-run: ${toArchive.length} would be archived, ${noSignal.length} skipped.`
      : `GC complete: ${archived.length} archived, ${noSignal.length} skipped.`;

    return [summary, "", ...lines].join("\n");
  },
});
