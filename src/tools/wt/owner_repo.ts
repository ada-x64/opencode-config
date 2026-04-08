import { tool } from "@opencode-ai/plugin";
import path from "node:path";

export default tool({
  description:
    "Derive the owner/repo slug from a repository path under $AGENT_REPOS. " +
    "Always returns exactly 2 path components (owner/repo), regardless of " +
    "worktree depth. Works for clones, worktrees, and bare repos.",
  args: {
    path: tool.schema
      .string()
      .describe(
        "Absolute path to the repository (e.g. $AGENT_REPOS/ada-x64/myrepo/main)",
      ),
  },
  async execute(args) {
    const agentRepos = process.env["AGENT_REPOS"];
    if (!agentRepos) {
      throw new Error("AGENT_REPOS must be set");
    }

    // Resolve to absolute, normalising any symlinks or relative segments.
    // path.resolve works even for paths that don't exist on disk.
    const resolved = path.resolve(args.path);

    // Strip the AGENT_REPOS prefix (normalise away any trailing slash first)
    const reposRoot = agentRepos.replace(/\/$/, "");
    const prefix = reposRoot + "/";
    const rel = resolved.startsWith(prefix)
      ? resolved.slice(prefix.length)
      : resolved.startsWith(reposRoot)
        ? resolved.slice(reposRoot.length).replace(/^\//, "")
        : resolved;

    // Take only the first two components: <owner>/<repo>
    const parts = rel.split("/");
    const owner = parts[0];
    const repo = parts[1];

    if (!owner || !repo) {
      throw new Error(
        `wt_owner_repo: cannot derive owner/repo from '${args.path}'`,
      );
    }

    return `${owner}/${repo}`;
  },
});
