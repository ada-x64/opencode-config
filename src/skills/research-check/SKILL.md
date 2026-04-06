---
name: research-check
description: >
  Check repo-notes freshness by comparing provenance metadata against
  current repo state. Use this skill before dispatching @investigate to
  determine which notes are stale, missing, or fresh.
---

# Research Check Skill

## Overview

Before dispatching `@investigate`, orchestrators (mode prompts) should check
whether existing repo-notes are still valid. This skill provides a script
that reads provenance frontmatter from repo-notes and compares it against
the current repository state.

## Usage

```bash
bash ~/.config/opencode/skills/research-check/check.sh <owner>/<repo> <repo-path>
```

**Arguments:**
- `<owner>/<repo>` — the repo identifier (e.g. `ada-x64/opencode-config`)
- `<repo-path>` — absolute path to the local repository checkout

**Output:** A structured report listing each note's status:

- **Fresh** — commit matches HEAD and web sources (if any) are ≤ 7 days old
- **Stale (commit-drift)** — note's `commit` does not match current HEAD
- **Stale (web-age)** — note references web sources and `date` is > 7 days old
- **Missing** — no notes exist for the repo at all

## When to Run

Run this check in mode prompts (plan, build, audit) before dispatching
`@planner`, `@designer`, or `@auto-auditor` — any agent that consumes
repo-notes. If the check reports stale or missing notes, dispatch
`@investigate` first to refresh them.

## Integration with Mode Prompts

The staleness-check protocol:

1. Load the `research-check` skill
2. Run `check.sh` for the target repo
3. If all notes are fresh → proceed with the planned dispatch
4. If notes are stale or missing → dispatch `@investigate` first, then proceed
