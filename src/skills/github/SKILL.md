---
name: github
description: >
  Templates and conventions for posting structured comments on GitHub
  issues and PRs. Load this skill before using the github_comment tool.
---

# GitHub Comment Skill

## Overview

This skill provides templates and conventions for all agent-generated
GitHub comments. Load it before posting comments using the
`github_comment` tool.

## Footer Convention

Every auto-generated comment MUST include a disclosure footer. The
`github_comment` tool appends this automatically:

```
---
*Posted by **<agent>** at YYYY-MM-DD HH:MM UTC*
```

Do NOT manually append footers — the tool handles this.

## Comment Templates

### Implementation Start

Used by `@implementor` and `auto-impl` when beginning schema execution.

```markdown
### Changed

Implementation started on branch `<branch>`.

### Validation

- Schema: <N> commit groups
- Started at: <datetime>
```

### Implementation Complete

Used by `@implementor` and `auto-impl` when all commit groups are done.

```markdown
### Changed

Implementation complete on branch `<branch>`.
All <N> commit groups implemented and validated.
```

### Commit Group Complete

Used by `auto-impl` after each commit group's review loop.

```markdown
### Changed

Commit group <N>/<total> complete.

### Validation

- Tests: <pass/fail>
- Review rounds: <count>
```

### Cross-Reference

Used by `@planner` and `@project-manager` to link issues and PRs.

```markdown
Opened #<issue-number> to track <short description>.
```

### Review Summary

Used by `auto-impl` to post review outcomes on issues.

```markdown
### Changed

Review round <N> complete for commit group <G>.

### Validation

- Findings: <count> (high: <n>, medium: <n>, low: <n>)
- Status: <resolved/escalated>

### Deferred

- <items left for later, if any>
```

## Tool Reference

Use the `github_comment` tool to post comments:

```
github_comment({
  repo: "owner/repo",
  number: 42,
  body: "<comment body following templates above>",
  agent: "implementor",
  type: "issue"   // or "pr"
})
```

The tool auto-appends the footer. Do NOT include the footer in `body`.

## When to Load This Skill

Load this skill (`skill("github")`) before any of these operations:

- Posting implementation start/complete comments
- Posting commit group status updates
- Cross-referencing issues and PRs
- Posting review summaries

The skill is explicitly loaded — it is NOT baked into agent prompts.
