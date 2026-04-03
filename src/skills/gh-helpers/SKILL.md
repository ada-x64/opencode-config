---
name: gh-helpers
description: >
  Create GitHub issues and PRs from schema files and commit history via helper
  scripts. Use this skill when creating a schema-linked issue (title from H1,
  body in a <details> block) or when generating a PR body from commit log and
  diff stats. Load this skill to see usage examples for create-issue.sh and
  create-pr.sh.
---

# GitHub Helpers (`gh-helpers`)

## Overview

This skill bundles two shell scripts that wrap `gh issue create` and
`gh pr create` with project-standard body formatting:

- **`create-issue.sh`** — reads a schema Markdown file, extracts the H1 as the
  issue title, extracts the `## Problem` section as a visible summary, and wraps
  the full file content in a `<details>` block. Eliminates the need to read the
  schema into context.
- **`create-pr.sh`** — generates a PR body from an agent-supplied summary,
  `git log`, and `git diff --stat` output, then calls `gh pr create`. Provides a
  consistent, informative PR description with no manual writing required.

Both scripts write their body to a temp file and use `--body-file` to avoid
shell-escaping issues with large Markdown content.

## When to Use

- **`create-issue.sh`:** Any time `@planner` creates a GitHub issue for a
  schema. Replaces the previous workflow of reading the schema template and
  schema file into context before calling `gh issue create`.
- **`create-pr.sh`:** When build mode or `@auto-implementor` needs to propose a
  PR. Prefer this over writing a PR body by hand.

## `create-issue.sh`

### Usage

```bash
bash {{CONFIG_DIR}}/skills/gh-helpers/create-issue.sh <schema.md> <owner/repo>
```

### Arguments

| Position | Name         | Required | Description                      |
| -------- | ------------ | -------- | -------------------------------- |
| `$1`     | `schema.md`  | Yes      | Path to the schema Markdown file |
| `$2`     | `owner/repo` | Yes      | GitHub repository slug           |

### What It Does

1. Validates both arguments and that the file exists.
2. Extracts the first `# Heading` line as the issue title.
3. Extracts the `## Problem` section content (everything between `## Problem`
   and the next `## ` heading) as a visible summary.
4. Reads the full file content, stripping YAML frontmatter (the `---`-delimited
   block at the top of the file).
5. Builds the issue body: problem summary (if found), then the stripped content
   wrapped in a `<details>` / `<summary>Full schema</summary>` block.
6. Writes the body to a temp file and calls:
   ```bash
   gh issue create -R <owner/repo> --title <title> --body-file <tmpfile>
   ```
7. Prints the created issue URL to stdout (as output by `gh issue create`).
8. Cleans up the temp file on exit.

### Examples

```bash
# Create an issue for a schema
bash {{CONFIG_DIR}}/skills/gh-helpers/create-issue.sh \
  "$AGENT_VAULT/tasks/ada-x64/my-repo/my-task/schema.md" \
  "ada-x64/my-repo"
```

### Post-Creation Steps (caller's responsibility)

The script does **not**:

- Add the issue to a project board
- Set milestone or labels
- Update the schema's `issue:` frontmatter field

These steps are performed by the calling agent (`@planner`) after the script
returns the issue URL.

## `create-pr.sh`

### Usage

```bash
bash {{CONFIG_DIR}}/skills/gh-helpers/create-pr.sh <owner/repo> [base-branch] [head-branch] [title] [summary]
```

### Arguments

| Position | Name          | Required | Default                  | Description                              |
| -------- | ------------- | -------- | ------------------------ | ---------------------------------------- |
| `$1`     | `owner/repo`  | Yes      | —                        | GitHub repository slug                   |
| `$2`     | `base-branch` | No       | `main`                   | Branch to merge into                     |
| `$3`     | `head-branch` | No       | current branch           | Branch with changes                      |
| `$4`     | `title`       | No       | derived from branch name | PR title                                 |
| `$5`     | `summary`     | No       | omitted                  | Agent-generated summary of the work done |

### What It Does

1. Validates `$1` is provided.
2. Determines head branch (defaults to `git branch --show-current`).
3. Derives title from branch name if `$4` is omitted (hyphens → spaces,
   first word capitalized).
4. Generates a PR body with:
   - `## Summary` — agent-supplied description (if `$5` is provided)
   - `## Commits` — output of `git log --oneline <base>..<head>`
   - `## Diff summary` — output of `git diff --stat <base>...<head>`
5. Writes the body to a temp file and calls:
   ```bash
   gh pr create -R <owner/repo> --base <base> --head <head> --title <title> --body-file <tmpfile>
   ```
6. Prints the created PR URL to stdout.
7. Cleans up the temp file on exit.

### Examples

```bash
# Create a PR from current branch into main
bash {{CONFIG_DIR}}/skills/gh-helpers/create-pr.sh "ada-x64/my-repo"

# Create a PR with explicit base and head
bash {{CONFIG_DIR}}/skills/gh-helpers/create-pr.sh \
  "ada-x64/my-repo" "lint-infrastructure" "gh-helpers"

# Create a PR with a custom title
bash {{CONFIG_DIR}}/skills/gh-helpers/create-pr.sh \
  "ada-x64/my-repo" "main" "feat/dark-mode" "Add dark mode support"

# Create a PR with an agent-generated summary
bash {{CONFIG_DIR}}/skills/gh-helpers/create-pr.sh \
  "ada-x64/my-repo" "main" "feat/dark-mode" "Add dark mode support" \
  "Adds a theme toggle to the settings page with system/light/dark options. Persists preference in localStorage and applies CSS custom properties."
```

### Post-Creation Steps (caller's responsibility)

The script does **not**:

- Add reviewers
- Set labels
- Auto-merge

These steps are performed by the calling agent after the script returns the
PR URL.

## Troubleshooting

- **`Error: file not found`** — check that the schema path is absolute or
  relative to the current working directory.
- **`Error: no H1 heading found`** — the schema file must have at least one
  `# Heading` line. Check that the file is not empty or that YAML frontmatter
  is not the only content.
- **`gh: not logged in`** — run `gh auth login` first.
- **Empty commits section** — verify that `head` is ahead of `base` with
  `git log --oneline <base>..<head>`. If the branches have diverged with no
  new commits on head, the section will show the fallback message.
