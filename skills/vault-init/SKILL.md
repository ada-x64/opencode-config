---
name: vault-init
description: >
  Initialize or verify the agent vault directory structure.
  Use this skill when $AGENT_VAULT is not set, the vault directory
  doesn't exist, or vault directories/templates are missing.
---

# Vault Init Skill

## When to use

Use this skill at the start of any session that needs the vault, if any of
these are true:

- `$AGENT_VAULT` is not set
- The vault directory does not exist
- Required subdirectories or templates are missing

## How to check

```bash
# Quick check — does the vault exist and have the expected structure?
[[ -d "$AGENT_VAULT/tasks" && -f "$AGENT_VAULT/AGENTS.md" ]] && echo "vault ok" || echo "vault needs init"
```

## How to invoke

```bash
# Initialize using $AGENT_VAULT (default)
bash ~/.config/opencode/skills/vault-init/init.sh

# Initialize at a specific path
bash ~/.config/opencode/skills/vault-init/init.sh /path/to/vault

# The script is idempotent — safe to run multiple times
```

## What it creates

| Directory / File       | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `tasks/`               | Combined schemas, reviews, and triage entries        |
| `_misc/archive/tasks/` | Archived completed tasks                             |
| `_misc/cache/`         | GitHub metadata cache (projects, milestones, labels) |
| `design/`              | Design documents                                     |
| `draft/`               | Work-in-progress staging area                        |
| `repo-notes/`          | Repository reference documentation                   |
| `_misc/templates/`     | Format templates for schemas, reviews, issues, etc.  |
| `_misc/images/`        | Notification icons and image assets                  |
| `AGENTS.md`            | Vault conventions document                           |

## After init

Set the `AGENT_VAULT` environment variable to the vault path if it is not
already set. The init script prints the path at the end.
