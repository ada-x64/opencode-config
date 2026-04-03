---
name: schemas
description: >
  Find and read implementation schemas from the vault.
  Use this skill when asked to look up a schema, list available schemas,
  or check what implementation specs exist for a repository.
---

# Schemas Skill

## Overview

Implementation schemas live at `$AGENT_VAULT/tasks/<owner>/<repo>/<task>/schema.md`.
Each file is a standalone actionable spec that an implementor agent can
execute without further clarification.

The `<owner>/<repo>/<task>` triple can always be inferred from context
(the repository being worked on and the task name provided by the caller).

## Finding schemas

```bash
# List task directories for a specific repo
ls "$AGENT_VAULT/tasks/<owner>/<repo>/"

# Find a schema by task name
find "$AGENT_VAULT/tasks" -name "schema.md" -path "*/<task>/*" -not -path "*/_fleet/*"

# List all active schemas (all repos)
find "$AGENT_VAULT/tasks" -name "schema.md" -type f -not -path "*/_fleet/*"

# Read a schema
cat "$AGENT_VAULT/tasks/<owner>/<repo>/<task>/schema.md"
```

## Schema path

```
$AGENT_VAULT/tasks/<owner>/<repo>/<task>/schema.md
```

## Schema frontmatter fields

| Field    | Description                         |
| -------- | ----------------------------------- |
| `repo`   | `<owner>/<repo>`                    |
| `issue`  | GitHub issue link                   |
| `branch` | Target branch name                  |
| `status` | `todo` / `in progress` / `complete` |
| `date`   | Creation date                       |

## Fleet schemas

Cross-repo (fleet) schemas live at `$AGENT_VAULT/tasks/_fleet/<task>.md`.
See the `fleet-schemas` skill for details.

## Format template

The canonical format is at `$AGENT_VAULT/_misc/templates/schema.md`.
