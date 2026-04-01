---
name: fleet-schemas
description: >
  Find and read fleet (cross-repo) schemas from the vault.
  Use this skill when asked to look up multi-repo plans, find fleet
  schemas, or understand cross-repo coordination.
---

# Fleet Schemas Skill

## Overview

Fleet schemas coordinate work across multiple repositories. They live at
`$AGENT_VAULT/tasks/_fleet/` and define an umbrella plan that references
per-repo schemas at their standard vault paths.

## Structure

- **Umbrella schema:** `$AGENT_VAULT/tasks/_fleet/<task>.md`
- **Per-repo schemas:** `$AGENT_VAULT/tasks/<owner>/<repo>/<task>/schema.md`

The umbrella schema contains a repos table that lists each participating
repository and links to its per-repo schema.

## Finding fleet schemas

```bash
# List all fleet schemas
ls "$AGENT_VAULT/tasks/_fleet/"

# Read a fleet schema
cat "$AGENT_VAULT/tasks/_fleet/<task>.md"

# Find all per-repo schemas for a fleet task
find "$AGENT_VAULT/tasks" -name "schema.md" -path "*/<task>/*" -not -path "*/_fleet/*"
```

## Format template

The canonical format is at `$AGENT_VAULT/_misc/templates/fleet-schema.md`.
