import { tool } from "@opencode-ai/plugin";
import { existsSync } from "node:fs";
import path from "node:path";
import { wtBareRoot, wtDetect } from "./_lib";

/**
 * If origin/<branch> exists, fetch it and hard-reset the local branch to match.
 * No-op if the branch has no remote tracking counterpart.
 */
async function syncToRemote(wtPath: string, branch: string): Promise<void> {
  // Fetch the specific branch from origin (no-op if origin doesn't have it)
  const fetch =
    await Bun.$`git -C ${wtPath} fetch --no-tags origin ${branch}`.nothrow();
  if (fetch.exitCode !== 0) return; // No remote tracking — leave as-is

  // Check if origin/<branch> ref exists
  const refCheck =
    await Bun.$`git -C ${wtPath} rev-parse --verify origin/${branch}`.nothrow();
  if (refCheck.exitCode !== 0) return; // No remote ref — leave as-is

  // Compare local HEAD with remote
  const localSha = (await Bun.$`git -C ${wtPath} rev-parse HEAD`.text()).trim();
  const remoteSha = (
    await Bun.$`git -C ${wtPath} rev-parse origin/${branch}`.text()
  ).trim();

  if (localSha !== remoteSha) {
    await Bun.$`git -C ${wtPath} reset --hard origin/${branch}`;
  }
}

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

      if (existsSync(newWt)) {
        await syncToRemote(newWt, branch);
        return newWt;
      }

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

      await syncToRemote(newWt, branch);
      return newWt;
    }

    if (repoType === "clone") {
      const switchNew =
        await Bun.$`git -C ${repo_path} switch -c ${branch}`.nothrow();
      if (switchNew.exitCode !== 0) {
        await Bun.$`git -C ${repo_path} switch ${branch}`;
      }
      await syncToRemote(repo_path, branch);
      return repo_path;
    }

    throw new Error(
      `wt_switch_branch: '${repo_path}' is not a recognised git repository`,
    );
  },
});
