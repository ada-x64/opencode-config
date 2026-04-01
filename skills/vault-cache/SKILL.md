---
name: vault-cache
description: >
  Refresh the GitHub metadata cache (projects, milestones, labels) for
  repositories with vault content. Use this skill when the cache is stale,
  after creating new milestones or labels, or before planning sessions that
  need up-to-date project board or milestone information.
---

# Vault Cache Skill

## Overview

The vault caches GitHub metadata (projects, milestones, labels) at
`$AGENT_VAULT/_misc/cache/<owner>.json`. This avoids repeated `gh` API calls during
planning sessions. The `refresh.sh` script discovers all repos that have vault
content and refreshes the cache for each one.

## How to Invoke

```bash
# Refresh cache for all repos with vault content
bash ~/.config/opencode/skills/vault-cache/refresh.sh

# Refresh a specific repo only
bash ~/.config/opencode/skills/vault-cache/refresh.sh ada-x64/wf
```

## What Gets Cached

| Data | Source | Cache key |
|------|--------|-----------|
| Projects | `gh project list --owner <owner>` | `.projects` |
| Milestones | `gh api repos/<owner>/<repo>/milestones` | `.repos.<repo>.milestones` |
| Labels | `gh api repos/<owner>/<repo>/labels` | `.repos.<repo>.labels` |

## Cache Location

`$AGENT_VAULT/_misc/cache/<owner>.json` — one file per org. Multiple repos under
the same org share a cache file.

## When to Refresh

- Before a planning session (to get current milestones and project IDs)
- After creating a new milestone or label on GitHub
- When the planner reports stale or missing project/milestone data
