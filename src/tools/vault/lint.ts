/* oxlint-disable prefer-string-starts-ends-with */
import { tool } from "@opencode-ai/plugin";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
// ---------------------------------------------------------------------------
// Frontmatter helpers
// ---------------------------------------------------------------------------

function extractFrontmatter(content: string): {
  block: string;
  present: boolean;
} {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return { block: "", present: false };
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end === -1) return { block: "", present: false };
  return { block: lines.slice(1, end).join("\n"), present: true };
}

// ---------------------------------------------------------------------------
// Schema linter
// ---------------------------------------------------------------------------

function lintSchema(content: string, relPath: string): string[] {
  const errors: string[] = [];
  const { block, present } = extractFrontmatter(content);

  if (!present) {
    errors.push(`${relPath}: missing YAML frontmatter`);
    // Can't check fields without frontmatter
    return errors;
  }

  for (const field of ["repo", "date"]) {
    if (!new RegExp(`^${field}:`, "m").test(block)) {
      errors.push(`${relPath}: missing '${field}' in frontmatter`);
    }
  }

  const statusMatch = block.match(/^status:\s*(.+)$/m);
  if (!statusMatch) {
    errors.push(`${relPath}: missing 'status' in frontmatter`);
  } else {
    const status = statusMatch[1]!.trim();
    if (!["todo", "in progress", "complete"].includes(status)) {
      errors.push(
        `${relPath}: invalid status value: '${status}' (expected: todo, in progress, complete)`,
      );
    }
  }

  if (!/^issue:/m.test(block)) {
    errors.push(`${relPath}: warning: missing 'issue' in frontmatter`);
  }

  if (!/^# /m.test(content)) {
    errors.push(`${relPath}: missing H1 heading`);
  }

  for (const section of ["Problem", "Approach", "Todos", "Files changed"]) {
    if (!new RegExp(`^## ${section}`, "m").test(content)) {
      errors.push(`${relPath}: missing ## ${section}`);
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Review linter
// ---------------------------------------------------------------------------

function lintReview(content: string, relPath: string): string[] {
  const errors: string[] = [];
  const { block, present } = extractFrontmatter(content);

  if (!present) {
    errors.push(`${relPath}: missing YAML frontmatter`);
    return errors;
  }

  for (const field of ["repo", "date"]) {
    if (!new RegExp(`^${field}:`, "m").test(block)) {
      errors.push(`${relPath}: missing '${field}' in frontmatter`);
    }
  }

  const statusMatch = block.match(/^status:\s*(.+)$/m);
  if (!statusMatch) {
    errors.push(`${relPath}: missing 'status' in frontmatter`);
  } else {
    const status = statusMatch[1]!.trim();
    if (!["todo", "in progress", "complete"].includes(status)) {
      errors.push(
        `${relPath}: invalid status value: '${status}' (expected: todo, in progress, complete)`,
      );
    }
  }

  if (!/^# Review:/m.test(content)) {
    errors.push(`${relPath}: H1 must start with 'Review:'`);
  }

  if (!/^## Verdict:/m.test(content)) {
    errors.push(`${relPath}: missing ## Verdict: section`);
  }

  // Check each ### N. issue block for **Severity:** and **Category:**
  const lines = content.split("\n");
  let issueCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^### \d+\./.test(lines[i]!)) {
      issueCount++;
      // Collect up to 20 lines of the block, stopping at the next ###
      let issueBlock = "";
      for (let j = i + 1; j < lines.length && j <= i + 20; j++) {
        if (/^###/.test(lines[j]!)) break;
        issueBlock += lines[j] + "\n";
      }
      if (!/\*\*Severity:\*\*/.test(issueBlock)) {
        errors.push(`${relPath}: issue #${issueCount} missing **Severity:**`);
      }
      if (!/\*\*Category:\*\*/.test(issueBlock)) {
        errors.push(`${relPath}: issue #${issueCount} missing **Category:**`);
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// File walkers
// ---------------------------------------------------------------------------

async function findFiles(
  dir: string,
  predicate: (relPath: string) => boolean,
): Promise<string[]> {
  let entries: string[];
  try {
    entries = (await readdir(dir, { recursive: true })) as string[];
  } catch {
    return [];
  }
  return entries.filter(predicate).map((e) => path.join(dir, e));
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export default tool({
  description:
    "Validate vault schemas and reviews against format templates. " +
    "Checks YAML frontmatter required fields, valid status values, " +
    "required H2 sections, and review issue annotations. " +
    "Can also lint agent permission baselines against the embedded baseline.",
  args: {
    schemas_only: tool.schema
      .boolean()
      .optional()
      .describe("Only lint schemas (skip reviews)"),
    reviews_only: tool.schema
      .boolean()
      .optional()
      .describe("Only lint reviews (skip schemas)"),
    filter: tool.schema
      .string()
      .optional()
      .describe(
        "Filter by owner/repo (e.g. 'ada-x64/opencode-config'). " +
          "Ignored when agents is set.",
      ),
  },

  async execute(args) {
    const vault = process.env.AGENT_VAULT;
    if (!vault) return "Error: AGENT_VAULT is not set";

    const lintSchemas = !args.reviews_only;
    const lintReviews = !args.schemas_only;
    const filter = args.filter;

    const allErrors: string[] = [];

    // ── Schemas ──────────────────────────────────────────────────────────────
    if (lintSchemas) {
      const schemaFiles = await findFiles(
        path.join(vault, "tasks"),
        (rel) =>
          path.basename(rel) === "schema.md" &&
          (!filter ||
            rel.startsWith(filter + "/") ||
            rel.includes("/" + filter + "/")),
      );

      if (schemaFiles.length === 0) {
        allErrors.push("(no schema files found)");
      } else {
        for (const file of schemaFiles) {
          const content = await readFile(file, "utf-8");
          const rel = file.slice(vault.length + 1);
          allErrors.push(...lintSchema(content, rel));
        }
      }
    }

    // ── Reviews ──────────────────────────────────────────────────────────────
    if (lintReviews) {
      const reviewFiles = await findFiles(path.join(vault, "tasks"), (rel) => {
        const base = path.basename(rel);
        const parentDir = path.basename(path.dirname(rel));
        return (
          base.startsWith("review") &&
          rel.endsWith(".md") &&
          parentDir === "reviews" &&
          (!filter ||
            rel.startsWith(filter + "/") ||
            rel.includes("/" + filter + "/"))
        );
      });

      if (reviewFiles.length === 0) {
        allErrors.push("(no review files found)");
      } else {
        for (const file of reviewFiles) {
          const content = await readFile(file, "utf-8");
          const rel = file.slice(vault.length + 1);
          allErrors.push(...lintReview(content, rel));
        }
      }
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    if (allErrors.length === 0) {
      return "All files pass validation.";
    }

    return allErrors.join("\n") + "\n\nLint found issues above.";
  },
});
