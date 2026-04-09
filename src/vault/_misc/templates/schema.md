# schema Format

schemas are actionable implementation specs. A future agent session should be able to execute the work from this document alone, without needing to ask clarifying questions.

Schemas must follow this structure.

## Header

Every schema starts with YAML frontmatter followed by an H1 title:

```markdown
---
repo: <owner>/<repo>
issue: <link or blank>
branch: <branch-name>
status: 📋 todo
task: <task-name>
priority: 🟡 medium
date: YYYY-MM-DD
---

# <Descriptive title>
```

### Frontmatter fields

| Field      | Description                                                                      |
| ---------- | -------------------------------------------------------------------------------- |
| `repo`     | `<owner>/<repo>` identifier                                                      |
| `issue`    | GitHub issue link (e.g. `[#1](https://github.com/owner/repo/issues/1)`) or blank |
| `branch`   | Target branch name                                                               |
| `status`   | `📋 todo` / `🔨 in-progress` / `🔍 in-review` / `✅ complete` / `🚫 closed`      |
| `task`     | Task name (kebab-case, matches directory name under `tasks/`)                    |
| `priority` | `🔥 critical` / `🔴 high` / `🟡 medium` / `🟢 low`                               |
| `date`     | Creation date (YYYY-MM-DD)                                                       |

## Problem

What issue or gap this addresses. Be specific — reference current behavior, user impact, or technical debt. Numbered list if multiple related problems.

```markdown
## Problem

<Description of the problem. Why does this work need to happen?>
```

## Approach

High-level strategy, broken into numbered steps. This is the "what" at a glance — details go in the Todos section. Include any design decisions or trade-offs made.

If there are alternative approaches that were considered and rejected, briefly note why.

```markdown
## Approach

<Numbered list of high-level steps.>
```

## Reference (optional)

Supporting material that clarifies the design: syntax examples, resolution tables, state diagrams, API mappings, etc. Use fenced code blocks, tables, or diagrams as appropriate.

```markdown
## Reference

<Tables, code examples, diagrams that clarify the spec.>
```

## Todos

The core of the schema. Organized by commit — each commit is a logical unit of work that can be reviewed independently.

### Commit structure

Each commit groups related sub-tasks. Sub-tasks are labeled `<commit#><letter>` (e.g., `1a`, `1b`, `2a`).

```markdown
## Todos

### Commit 1: <Short description>

#### 1a. `<kebab-case-label>`

<What to do, where, and why. Reference specific files, functions, and
line numbers where helpful. Include code sketches when they clarify intent.>

#### 1b. `<kebab-case-label>`

<...>

#### 1v. `validate-commit1`

Run the repo's validation suite (formatting, type checking, tests).

### Commit 2: <Short description>

<...>
```

### Sub-task guidelines

- Each sub-task should be independently understandable
- Reference specific files and functions by path
- Include code sketches (before/after) when the change isn't obvious
- End each commit with a `validate-commitN` step
- Keep commits focused — one concern per commit

## Files changed

Table of all files that will be created or modified, with the nature of each change.

```markdown
## Files changed

| File                  | Nature                         |
| --------------------- | ------------------------------ |
| `path/to/file.py`     | <Brief description of changes> |
| `path/to/new-file.md` | New: <description>             |
```

## Notes (optional)

Edge cases, caveats, open questions, or implementation notes that don't fit elsewhere. These are things the implementer should be aware of but that don't warrant their own sub-task.

```markdown
## Notes

- <Note about edge case or caveat>
- <Open question that may come up during implementation>
```
