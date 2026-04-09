# Parent Task Schema Format

Parent task schemas are umbrella documents that coordinate work across multiple
repositories. They define the cross-repo problem, list affected repos, and
specify synchronized commit groups. Each repo also gets its own standard
schema (see `schema.md`) that can be executed independently.

## Header

Every parent task schema starts with YAML frontmatter followed by an H1 title:

```markdown
---
task: <task-name>
issue: <link or blank>
status: 📋 todo
date: YYYY-MM-DD
---

# <Descriptive title>
```

### Frontmatter fields

| Field    | Description                                         |
| -------- | --------------------------------------------------- |
| `task`   | Shared task name used across all per-repo schemas   |
| `issue`  | GitHub issue link for the umbrella issue (or blank) |
| `status` | `📋 todo` / `🔨 in-progress` / `✅ complete`        |
| `date`   | Creation date (YYYY-MM-DD)                          |

## Problem

What cross-repo issue or gap this addresses. Explain why this requires
coordinated changes across multiple repositories.

```markdown
## Problem

<Description of the cross-repo problem. Why can't this be done repo-by-repo?>
```

## Repos

Table of all participating repositories. This table is the source of truth for
which repos are involved — the parent task implementor parses it to discover repos.

```markdown
## Repos

| Repo             | Path                     | schema                             |
| ---------------- | ------------------------ | ---------------------------------- |
| `<owner>/<repo>` | `~/repos/<owner>/<repo>` | `tasks/<task>/<subtask>/schema.md` |
```

- **Repo:** GitHub `owner/repo` identifier.
- **Path:** Local checkout path.
- **schema:** Vault-relative path to the per-repo subtask schema (under `tasks/<task>/`).

## Approach

High-level cross-repo strategy. Explain what changes in each repo and how they
relate. Include design decisions and trade-offs.

```markdown
## Approach

<Numbered list of high-level steps spanning all repos.>
```

## Commit Groups

Defines the synchronized barrier points. Each group maps to a commit group in
each per-repo schema. All repos complete group N before any starts group N+1.

```markdown
## Commit Groups

### Group 1: <description>

<What each repo does in this group. Note any per-repo differences.>

### Group 2: <description>

<...>
```

### Guidelines

- Groups should be logical synchronization points, not just sequencing.
- If repos have genuinely independent work, it can go in the same group.
- Per-repo schemas define the sub-tasks (1a, 1b, ...); the umbrella defines
  only the high-level group descriptions and ordering.
- Validation runs per-repo at the end of each group (same as standard schemas).

## Notes (optional)

Cross-repo coordination notes, ordering constraints, migration gotchas.

```markdown
## Notes

- <Coordination constraint or gotcha>
- <Migration-specific caveat>
```
