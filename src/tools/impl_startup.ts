import { tool } from "@opencode-ai/plugin";
import { readFile } from "fs/promises";
import { extractIssueNumber } from "./_lib";
import fm_read from "./fm_read";
import fm_write from "./fm_write";

export default tool({
  description:
    "Lifecycle startup tool for implementor agents. Reads branch and issue " +
    "from schema frontmatter, sets status to 'in progress', counts commit " +
    "groups, and returns gh commands to apply the in-progress label and post " +
    "a start comment. NEVER executes gh commands — returns them as strings " +
    "for the caller to run.",
  args: {
    schema_file: tool.schema.string().describe("Absolute path to schema.md"),
    repo: tool.schema.string().describe("GitHub owner/repo slug"),
  },
  async execute(args) {
    // 1. Read branch from frontmatter
    const branch = await fm_read.execute({
      file: args.schema_file,
      key: "branch",
    });

    // 2. Read issue from frontmatter
    const issue = await fm_read.execute({
      file: args.schema_file,
      key: "issue",
    });

    // 3. Set status to "in progress"
    await fm_write.execute({
      file: args.schema_file,
      key: "status",
      value: "in progress",
    });

    // 4. Read schema file content
    const content = await readFile(args.schema_file, "utf-8");

    // 5. Count commit groups via regex
    const matches = content.match(/^### Commit \d+/gm);
    const group_count = matches ? matches.length : 0;

    // 6. Extract issue number
    const issue_number = extractIssueNumber(issue);

    // 7. Build commands array
    const commands: string[] = [];
    if (issue_number) {
      const now =
        new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
      commands.push(
        `gh issue edit ${issue_number} -R ${args.repo} --add-label "in-progress"`,
        `gh issue comment ${issue_number} -R ${args.repo} --body "Implementation started on branch \`${branch}\`. Schema: ${group_count} commit groups. Started at ${now}."`,
      );
    }

    // 8. Return JSON
    return JSON.stringify(
      {
        branch,
        issue_number: issue_number || "",
        group_count,
        commands,
      },
      null,
      2,
    );
  },
});
