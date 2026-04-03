---
name: repo-notes
description: >
  Find and read repository reference notes from the vault.
  Use this skill when asked to look up repo documentation, list available notes,
  or check what reference docs exist for a repository.
---

# Repo Notes Skill

## Overview

Repository reference notes live at `$AGENT_VAULT/repo-notes/<owner>/<repo>/`.
Each note is a comprehensive standalone reference for a subsystem or aspect of
a repository — architecture, key files, conventions, gotchas. Written by the
designer agent.

## Finding repo notes

```bash
# List notes for a specific repo
ls "$AGENT_VAULT/repo-notes/<owner>/<repo>/"

# List all repos that have notes
ls "$AGENT_VAULT/repo-notes/"
ls "$AGENT_VAULT/repo-notes/<owner>/"

# Find a note by name
find "$AGENT_VAULT/repo-notes" -name "<name>.md"

# List all notes (all repos)
find "$AGENT_VAULT/repo-notes" -name "*.md" -type f

# Read a note
cat "$AGENT_VAULT/repo-notes/<owner>/<repo>/<name>.md"
```

## Note path

```
$AGENT_VAULT/repo-notes/<owner>/<repo>/<descriptive-name>.md
```

## Design documents

Broader design documents (cross-repo, architecture explorations, trade-off
analyses) live at `$AGENT_VAULT/design/`. These are flat files — no
`<owner>/<repo>/` subdirectory.

```bash
ls "$AGENT_VAULT/design/"
cat "$AGENT_VAULT/design/<name>.md"
```
