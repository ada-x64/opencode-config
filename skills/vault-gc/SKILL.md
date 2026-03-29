---
name: vault-gc
description: >
  Clean up the vault by archiving completed schemas and reviews.
  Use this skill when asked to clean up the vault, archive completed work,
  find stale schemas, or tidy up after closing issues.
  Supports --dry-run to preview what would be moved.
---

# Vault GC Skill

## Overview

`gc.sh` walks all active task directories and archives any that are complete.
A task is considered complete if either:

1. Its schema's `status` frontmatter field is `complete`, or
2. It has an `issue` frontmatter link and that GitHub issue is `closed`

Archiving moves the entire task directory from `tasks/` into `archive/tasks/`.

## How to Invoke

```bash
# Preview what would be archived (no changes made)
bash ~/.config/opencode/skills/vault-gc/gc.sh --dry-run

# Archive all completed tasks
bash ~/.config/opencode/skills/vault-gc/gc.sh
```

## What Gets Moved

| From | To |
|------|----|
| `$AGENT_VAULT/tasks/<owner>/<repo>/<task>/` | `$AGENT_VAULT/archive/tasks/<owner>/<repo>/<task>/` |

The entire task directory (schema.md, review.md, triage.md) is moved as a unit.
Fleet schemas (`tasks/_fleet/`) are skipped.

## Output

The script prints each task it archives (or would archive in dry-run mode),
then a summary line: `N archived, N still open, N without issue or status`.
