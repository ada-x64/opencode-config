import { tool } from "@opencode-ai/plugin";
import fm_read from "./fm_read";
import fm_write from "./fm_write";

export default tool({
  description:
    "Lifecycle completion tool for implementor agents. Sets schema status " +
    "to 'complete' and returns gh commands to remove the in-progress label, " +
    "add the review-ready label, and post a completion comment. NEVER " +
    "executes gh commands — returns them as strings for the caller to run.",
  args: {
    schema_file: tool.schema
      .string()
      .describe("Absolute path to schema.md"),
    repo: tool.schema
      .string()
      .describe("GitHub owner/repo slug"),
    branch: tool.schema
      .string()
      .describe("Branch name for completion comment"),
  },
  async execute(args) {
    // 1. Read issue from frontmatter
    const issue = await fm_read.execute({
      file: args.schema_file,
      key: "issue",
    });

    // 2. Set status to "complete"
    await fm_write.execute({
      file: args.schema_file,
      key: "status",
      value: "complete",
    });

    // 3. Extract issue number (same logic as startup)
    let issue_number = "";
    if (issue && !issue.startsWith("local-")) {
      const m = issue.match(/issues\/(\d+)/) ?? issue.match(/(\d+)\)?$/);
      if (m) issue_number = m[1];
    }

    // 4. Build commands array
    const commands: string[] = [];
    if (issue_number) {
      commands.push(
        `gh issue edit ${issue_number} -R ${args.repo} --remove-label "in-progress" --add-label "review-ready"`,
        `gh issue comment ${issue_number} -R ${args.repo} --body "Implementation complete on branch \`${args.branch}\`. Ready for review."`,
      );
    }

    // 5. Return JSON
    return JSON.stringify(
      {
        issue_number: issue_number || "",
        commands,
      },
      null,
      2,
    );
  },
});
