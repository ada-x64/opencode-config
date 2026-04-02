---
name: vault-lint
description: >
  Validate schemas and reviews against their format templates.
  Use this skill when asked to check vault format compliance, lint schemas,
  verify that reviews follow the correct structure, or audit vault quality
  before archiving.
---

# Vault Lint Skill

## Overview

`lint.sh` validates schemas and reviews against the canonical format templates
at `$AGENT_VAULT/_misc/templates/`. It checks for required headings, frontmatter
fields, valid status values, and per-issue annotations.

## How to Invoke

```bash
# Lint everything (vault docs + bash scripts)
bash "$OPENCODE_CONFIG_SRC/skills/vault-lint/lint.sh"

# Schemas only
bash "$OPENCODE_CONFIG_SRC/skills/vault-lint/lint.sh" --schemas-only

# Reviews only
bash "$OPENCODE_CONFIG_SRC/skills/vault-lint/lint.sh" --reviews-only

# Filter to a specific owner/repo
bash "$OPENCODE_CONFIG_SRC/skills/vault-lint/lint.sh" ada-x64/agent-config
bash "$OPENCODE_CONFIG_SRC/skills/vault-lint/lint.sh" --schemas-only ada-x64/agent-config
```

## What Gets Checked

### Schemas (`$AGENT_VAULT/tasks/**/schema.md`)

| Check              | Rule                                                   |
| ------------------ | ------------------------------------------------------ |
| YAML frontmatter   | Must be present (opening `---`)                        |
| `repo` property    | Required in frontmatter                                |
| `date` property    | Required in frontmatter                                |
| `status` property  | Required; must be `todo`, `in progress`, or `complete` |
| H1 heading         | Must be present after frontmatter                      |
| `## Problem`       | Required section                                       |
| `## Approach`      | Required section                                       |
| `## Todos`         | Required section                                       |
| `## Files changed` | Required section                                       |
| `issue` property   | Warning if missing (not a hard error)                  |

### Reviews (`$AGENT_VAULT/tasks/**/review.md`)

| Check                     | Rule                                                   |
| ------------------------- | ------------------------------------------------------ |
| YAML frontmatter          | Must be present (opening `---`)                        |
| `repo` property           | Required in frontmatter                                |
| `date` property           | Required in frontmatter                                |
| `status` property         | Required; must be `todo`, `in progress`, or `complete` |
| H1 heading                | Must start with `# Review:`                            |
| `## Verdict:`             | Required section                                       |
| Per-issue `**Severity:**` | Required for each `### N.` issue section               |
| Per-issue `**Category:**` | Required for each `### N.` issue section               |

### Bash scripts (`$OPENCODE_CONFIG_SRC/skills/**/*.sh`)

All shell scripts are passed through `shellcheck`. Requires `shellcheck` to be
installed (`apt-get install shellcheck` or `brew install shellcheck`). If not
installed, this check is skipped with a warning.

## Exit Codes

- `0` — all files pass
- `1` — one or more violations found

Violations are printed as `<vault-relative-path>: <error>`.
