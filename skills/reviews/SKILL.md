---
name: reviews
description: >
  Find and read code review files from the vault.
  Use this skill when asked to look up a review, list available reviews,
  or check what review feedback exists for a repository.
---

# Reviews Skill

## Overview

Code reviews live at `$AGENT_VAULT/tasks/<owner>/<repo>/<task>/review.md`.
Each file is a structured review produced by the reviewer agent.
For running a new review, use the **reviewer** agent directly.

## Finding reviews

```bash
# List task directories for a specific repo
ls "$AGENT_VAULT/tasks/<owner>/<repo>/"

# Find a review by task name
find "$AGENT_VAULT/tasks" -name "review.md" -path "*/<task>/*"

# List all active reviews (all repos)
find "$AGENT_VAULT/tasks" -name "review.md" -type f

# Read a review
cat "$AGENT_VAULT/tasks/<owner>/<repo>/<task>/review.md"
```

## Review path

```
$AGENT_VAULT/tasks/<owner>/<repo>/<task>/review.md
```

## Review frontmatter fields

| Field | Description |
|-------|-------------|
| `repo` | `<owner>/<repo>` |
| `status` | `todo` / `in progress` / `complete` |
| `date` | Review date |

## Format template

The canonical format is at `$AGENT_VAULT/templates/review.md`.
