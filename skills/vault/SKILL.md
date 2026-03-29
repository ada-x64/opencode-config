---
name: vault
description: >
  Search across all vault sections or look up local/remote repositories.
  Use this skill for cross-section searches, general vault queries,
  or locating repositories. For section-specific lookups, prefer the
  schemas, reviews, repo-notes, or archive skills instead.
---

# Vault Skill

## Environment

Run `printenv AGENT_VAULT` to confirm the vault root. All vault paths are
relative to `$AGENT_VAULT`.

## Vault section index

| Skill       | Section             | Path                                              |
|-------------|---------------------|---------------------------------------------------|
| schemas     | Implementation specs | `$AGENT_VAULT/tasks/<owner>/<repo>/<task>/schema.md` |
| reviews     | Code reviews        | `$AGENT_VAULT/tasks/<owner>/<repo>/<task>/review.md` |
| repo-notes  | Reference docs      | `$AGENT_VAULT/repo-notes/<owner>/<repo>/`         |
| archive     | Completed work      | `$AGENT_VAULT/archive/tasks/<owner>/<repo>/<task>/` |

## Cross-section search

```bash
# Find everything related to a task name
find "$AGENT_VAULT" -name "*.md" -path "*/<task>/*" -not -path "*/.obsidian/*"

# Search content across the entire vault
rg "search term" "$AGENT_VAULT" --glob "*.md" --glob "!.obsidian"

# List all vault content for a specific repo
find "$AGENT_VAULT" -path "*/<owner>/<repo>/*" -name "*.md" -type f

# Use obsidian CLI for full-text search
obsidian search vault=agent.obs query="search term"
```

## Repository lookup

Repos are located at `$AGENT_REPOS/<owner>/<repo>/`. Run `printenv AGENT_REPOS`
to confirm the repos root.

```bash
# Check if a repo is checked out locally
ls "$AGENT_REPOS/<owner>/"

# Fall back to remote
gh repo view <owner>/<repo>
```

Resolution order: local checkout first, fall back to remote.

## Vault instructions

The vault's conventions and instructions live at:
`$AGENT_VAULT/AGENTS.md`

Read this file at the start of any session that writes to the vault.
