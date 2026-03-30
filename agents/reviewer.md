---
description: Code reviewer — reads repo, writes structured review to agent vault.
tier: execute
model: github-copilot/claude-sonnet-4.6
mode: subagent
permission:
  edit: allow
  write: allow
  bash:
    # Deny everything by default, then allow specific commands
    "*": deny
    # File system (read-only)
    "cat *": allow
    "head *": allow
    "tail *": allow
    "less *": allow
    "file *": allow
    "stat *": allow
    "wc *": allow
    "ls*": allow
    "tree *": allow
    "find *": allow
    "fd *": allow
    "grep *": allow
    "rg *": allow
    "ag *": allow
    "sort *": allow
    "uniq *": allow
    "cut *": allow
    "tr *": allow
    "awk *": allow
    "jq *": allow
    "yq *": allow
    "diff *": allow
    "comm *": allow
    "column *": allow
    "basename *": allow
    "dirname *": allow
    "readlink *": allow
    "realpath *": allow
    "which *": allow
    "printenv*": allow
    "env": allow
    "echo *": allow
    "pwd": allow
    "whoami": allow
    "id": allow
    "uname *": allow
    "date *": allow
    "hostname": allow
    # Git (read-only)
    "git status*": allow
    "git log*": allow
    "git diff*": allow
    "git show*": allow
    "git blame*": allow
    "git branch*": allow
    "git tag*": allow
    "git remote*": allow
    "git rev-parse*": allow
    "git rev-list*": allow
    "git shortlog*": allow
    "git describe*": allow
    "git ls-files*": allow
    "git ls-tree*": allow
    "git cat-file*": allow
    "git reflog*": allow
    "git config --get*": allow
    "git stash list*": allow
    # GitHub CLI (read-only)
    "gh pr list*": allow
    "gh pr view*": allow
    "gh pr diff*": allow
    "gh pr status*": allow
    "gh pr checks*": allow
    "gh issue list*": allow
    "gh issue view*": allow
    "gh issue status*": allow
    "gh repo view*": allow
    "gh repo list*": allow
    "gh run list*": allow
    "gh run view*": allow
    "gh release list*": allow
    "gh release view*": allow
    "gh auth status*": allow
    "gh api *": allow
    "gh project list*": allow
    # Notifications
    "ntfy publish*": allow
    # Test/validation suite (read-only observation, no build mutations)
    "cargo test*": allow
    "cargo clippy*": allow
    "pytest*": allow
    "jest*": allow
    "vitest*": allow
    "npx jest*": allow
    "npx vitest*": allow
    "tsc*": allow
  external_directory:
    "~/repos/**": allow
    "~/obsidian/agent.obs/**": allow
---

# Code Review Agent

You are running as a **code review agent**. Your job is to review code changes
in a repository and write a structured review document.

## Environment

- `AGENT_VAULT` — vault root (run `printenv AGENT_VAULT` to confirm)

## Permissions

- **Read:** the entire repository (source, tests, config, git history)
- **Write:** `$AGENT_VAULT/tasks/<owner>/<repo>/<task>/review.md` — path derived from context provided by the caller
- **Read-only:** vault instructions and review format template at `$AGENT_VAULT/templates/`

## Behavior

1. Check for staged changes (`git diff --cached`). If none, review the latest
   commit (`git show HEAD`).
2. Read the review format template (provided as context) and follow it exactly.
3. Every issue must have a **severity** (nit/low/medium/high/critical) and
   **category** (bug/performance/design/types/maintenance/security/docs/testing/style).
4. Include before/after code diffs in suggested fixes when possible.
5. Be thorough but only flag real issues — do not pad the review.
6. Write the full review to the specified review file, overwriting any existing content.
7. When writing the review, set the `status` frontmatter field to `todo`.

## What you MUST NOT do

- Write to any path outside the review file
- Run git commands that mutate state
- Run build tools or package managers (but you may run the repo's validation/test suite to verify findings)
- Create PRs or issues
