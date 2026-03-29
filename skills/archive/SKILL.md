---
name: archive
description: >
  Find and read archived schemas and reviews from the vault.
  Use this skill when asked to look up completed work, find archived tasks,
  or check past schemas and reviews.
---

# Archive Skill

## Overview

Completed tasks are archived at `$AGENT_VAULT/archive/tasks/<owner>/<repo>/<task>/`.
Each archived task directory may contain `schema.md`, `review.md`, and `triage.md`.
The `vault-gc` skill moves task directories here when a task is finished.

## Finding archived content

```bash
# By org, repo, and task
ls "$AGENT_VAULT/archive/tasks/<owner>/<repo>/<task>/"
cat "$AGENT_VAULT/archive/tasks/<owner>/<repo>/<task>/schema.md"

# By repo only (search all orgs)
ls "$AGENT_VAULT"/archive/tasks/*/<repo>/ 2>/dev/null

# By document name
find "$AGENT_VAULT/archive/tasks" -name "schema.md" -path "*/<task>/*"
```

## Listing archived content

```bash
# All archived tasks
find "$AGENT_VAULT/archive/tasks" -name "schema.md" -type f

# Everything in the archive
find "$AGENT_VAULT/archive" -name "*.md" -type f
```

## Archive paths

```
$AGENT_VAULT/archive/tasks/<owner>/<repo>/<task>/schema.md
$AGENT_VAULT/archive/tasks/<owner>/<repo>/<task>/review.md
$AGENT_VAULT/archive/tasks/<owner>/<repo>/<task>/triage.md
```
