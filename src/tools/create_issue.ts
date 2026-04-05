/* oxlint-disable prefer-string-starts-ends-with */
import { tool } from "@opencode-ai/plugin";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export default tool({
  description:
    "Create a GitHub issue from a schema Markdown file. " +
    "Extracts the H1 heading as the issue title. The body contains " +
    "the '## Problem' section as a visible summary, plus the full " +
    "schema in a <details> block. Returns the issue URL.",
  args: {
    schema_file: tool.schema
      .string()
      .describe("Absolute path to the schema.md file"),
    repo: tool.schema
      .string()
      .describe("GitHub owner/repo slug (e.g. 'ada-x64/opencode-config')"),
  },
  async execute(args) {
    const raw = await readFile(args.schema_file, "utf-8");

    // Extract H1 title
    const titleMatch = raw.match(/^# (.+)/m);
    if (!titleMatch) {
      throw new Error(`No H1 heading found in ${args.schema_file}`);
    }
    const title = titleMatch[1]!.trim();

    // Strip YAML frontmatter (--- delimited block at top)
    let content = raw;
    if (/^---/.test(content)) {
      const endFm = content.indexOf("\n---", 3);
      if (endFm !== -1) {
        const afterClose = content.indexOf("\n", endFm + 1);
        content = afterClose !== -1 ? content.slice(afterClose + 1) : "";
      }
    }
    // Trim leading blank lines
    content = content.replace(/^\n+/, "");

    // Extract "## Problem" section: text from ## Problem up to next ## heading or EOF
    let problem = "";
    const problemHeading = "## Problem\n";
    const problemStart = content.indexOf(problemHeading);
    if (problemStart !== -1) {
      const afterProblem = content.slice(problemStart + problemHeading.length);
      const nextH2 = afterProblem.search(/\n## /);
      problem = (
        nextH2 !== -1 ? afterProblem.slice(0, nextH2) : afterProblem
      ).trim();
    }

    // Build issue body
    const body = problem
      ? `${problem}\n\n<details>\n<summary>Full schema</summary>\n\n${content}\n\n</details>`
      : `<details>\n<summary>Full schema</summary>\n\n${content}\n\n</details>`;

    // Write to temp file, run gh, then clean up
    const tmpDir = await mkdtemp(join(tmpdir(), "create-issue-"));
    const tmpFile = join(tmpDir, "body.md");
    try {
      await writeFile(tmpFile, body, "utf-8");
      const result =
        await Bun.$`gh issue create -R ${args.repo} --title ${title} --body-file ${tmpFile}`.text();
      return result.trim();
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  },
});
