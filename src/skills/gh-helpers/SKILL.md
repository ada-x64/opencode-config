---
name: gh-helpers
description: >
  Create GitHub issues and PRs from schema files and commit history via custom
  tools. Use this skill when creating a schema-linked issue (title from H1,
  body in a <details> block) or when generating a PR body from commit log and
  diff stats. Load this skill to see usage examples for the create_issue and
  create_pr tools.
---

# GitHub Helpers (`gh-helpers`)

## Overview

This skill provides two custom tools that wrap `gh issue create` and
`gh pr create` with project-standard body formatting:

- **`create_issue`** — reads a schema Markdown file, extracts the H1 as the
  issue title, extracts the `## Problem` section as a visible summary, and wraps
  the full file content in a `<details>` block. Eliminates the need to read the
  schema into context.
- **`create_pr`** — generates a PR body from an agent-supplied summary,
  `git log`, and `git diff --stat` output, then calls `gh pr create`. Provides a
  consistent, informative PR description with no manual writing required.

Both tools write their body to a temp file and use `--body-file` to avoid
shell-escaping issues with large Markdown content.

## When to Use

- **`create_issue`:** Any time `@planner` creates a GitHub issue for a
  schema. Replaces the previous workflow of reading the schema template and
  schema file into context before calling `gh issue create`.
- **`create_pr`:** When build mode or `@auto-implementor` needs to propose a
  PR. Prefer this over writing a PR body by hand.

## `create_issue`

### Usage

```
create_issue({ schema_file: "<path>", repo: "<owner/repo>" })
```

### Parameters

| Name          | Required | Description                         |
| ------------- | -------- | ----------------------------------- |
| `schema_file` | Yes      | Absolute path to the schema.md file |
| `repo`        | Yes      | GitHub owner/repo slug              |

### What It Does

1. Validates both arguments and that the file exists.
2. Extracts the first `# Heading` line as the issue title.
3. Extracts the `## Problem` section content (everything between `## Problem`
   and the next `## ` heading) as a visible summary.
4. Reads the full file content, stripping YAML frontmatter (the `---`-delimited
   block at the top of the file).
5. Builds the issue body: problem summary (if found), then the stripped content
   wrapped in a `<details>` / `<summary>Full schema</summary>` block.
6. Calls `gh issue create` with the generated title and body.
7. Returns the created issue URL.

### Examples

```
create_issue({
  schema_file: "$AGENT_VAULT/tasks/ada-x64/my-repo/my-task/schema.md",
  repo: "ada-x64/my-repo"
})
```

### Post-Creation Steps (caller's responsibility)

The tool does **not**:

- Add the issue to a project board
- Set milestone or labels
- Update the schema's `issue:` frontmatter field

These steps are performed by the calling agent (`@planner`) after the tool
returns the issue URL.

## `create_pr`

### Usage

```
create_pr({ repo: "<owner/repo>" })
create_pr({ repo: "<owner/repo>", base: "main", head: "feat/dark-mode", title: "Add dark mode", summary: "..." })
```

### Parameters

| Name      | Required | Default                  | Description                              |
| --------- | -------- | ------------------------ | ---------------------------------------- |
| `repo`    | Yes      | —                        | GitHub owner/repo slug                   |
| `base`    | No       | `main`                   | Branch to merge into                     |
| `head`    | No       | current branch           | Branch with changes                      |
| `title`   | No       | derived from branch name | PR title                                 |
| `summary` | No       | omitted                  | Agent-generated summary of the work done |

### What It Does

1. Determines head branch (defaults to `git branch --show-current`).
2. Derives title from branch name if not provided (hyphens → spaces,
   first word capitalized).
3. Generates a PR body with:
   - `## Summary` — agent-supplied description (if provided)
   - `## Commits` — output of `git log --oneline <base>..<head>`
   - `## Diff summary` — output of `git diff --stat <base>...<head>`
4. Calls `gh pr create` with the generated body.
5. Returns the created PR URL.

### Examples

```
// Create a PR from current branch into main
create_pr({ repo: "ada-x64/my-repo" })

// Create a PR with explicit base and head
create_pr({ repo: "ada-x64/my-repo", base: "lint-infrastructure", head: "gh-helpers" })

// Create a PR with a custom title
create_pr({ repo: "ada-x64/my-repo", base: "main", head: "feat/dark-mode", title: "Add dark mode support" })

// Create a PR with an agent-generated summary
create_pr({
  repo: "ada-x64/my-repo",
  base: "main",
  head: "feat/dark-mode",
  title: "Add dark mode support",
  summary: "Adds a theme toggle to the settings page with system/light/dark options. Persists preference in localStorage and applies CSS custom properties."
})
```

### Post-Creation Steps (caller's responsibility)

The tool does **not**:

- Add reviewers
- Set labels
- Auto-merge

These steps are performed by the calling agent after the tool returns the
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
