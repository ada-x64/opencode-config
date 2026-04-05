import { tool } from "@opencode-ai/plugin";
import { existsSync } from "node:fs";
import path from "node:path";
import { wtBareRoot, wtDetect } from "./_worktree";

export default tool({
  description:
    "Switch to a branch in a repo-type-aware way. For bare repos/worktrees, " +
    "creates a new worktree at <bare_root>/<branch>. For traditional clones, " +
    "runs git switch. Returns the working directory path to use for " +
    "subsequent operations.",
  args: {
    repo_path: tool.schema
      .string()
      .describe("Absolute path to the current repository working directory"),
    branch: tool.schema.string().describe("Branch name to switch to or create"),
  },
  async execute(args) {
    const { repo_path, branch } = args;
    const repoType = await wtDetect(repo_path);

    if (repoType === "worktree" || repoType === "bare") {
      const currentBranch = (
        await Bun.$`git -C ${repo_path} branch --show-current`.text()
      ).trim();

      if (currentBranch === branch) return repo_path;

      const bareRoot = await wtBareRoot(repo_path);
      const newWt = path.join(bareRoot, branch);

      if (existsSync(newWt)) return newWt;

      // Try creating a new branch in the worktree; fall back to an existing branch
      const addNew =
        await Bun.$`git -C ${repo_path} worktree add ${newWt} -b ${branch}`.nothrow();
      if (addNew.exitCode !== 0) {
        const addExisting =
          await Bun.$`git -C ${repo_path} worktree add ${newWt} ${branch}`.nothrow();
        if (addExisting.exitCode !== 0) {
          throw new Error(
            `wt_switch_branch: failed to create worktree at '${newWt}' for branch '${branch}'`,
          );
        }
      }

      return newWt;
    }

    if (repoType === "clone") {
      const switchNew =
        await Bun.$`git -C ${repo_path} switch -c ${branch}`.nothrow();
      if (switchNew.exitCode !== 0) {
        await Bun.$`git -C ${repo_path} switch ${branch}`;
      }
      return repo_path;
    }

    throw new Error(
      `wt_switch_branch: '${repo_path}' is not a recognised git repository`,
    );
  },
});
