# Triage Document Format

Triage documents capture autonomous agent output. They are written by agents (especially the auto-implementor) to record decisions, escalations, and handoff notes for human review.

## Location

Triage entries live in one of three flat directories under `_misc/`, named by UTC timestamp:

| Directory | Entry types | In dashboard? |
|-----------|------------|--------------|
| `_misc/triage/` | `escalation`, `design-question`, `permissions-request` | **Yes** |
| `_misc/activity/` | `activity` | No |
| `_misc/handoffs/` | `handoff`, `run-summary` | No |

Example filename: `_misc/triage/2026-04-01T14-30-00.md`

All context (task, repo, agent) is in YAML frontmatter — not encoded in the path.

## Frontmatter

Every triage document starts with YAML frontmatter:

```yaml
---
type: escalation | handoff | design-question | run-summary | activity | permissions-request
agent: auto-implementor | planner | designer | reviewer | implementor | auto-auditor | project-manager
task: <task-name or empty>
repo: <owner/repo or empty>
date: YYYY-MM-DD
status: pending | addressed | dismissed
---
```

### Field definitions

| Field    | Values                                    | Meaning                                                    |
| -------- | ----------------------------------------- | ---------------------------------------------------------- |
| `type`   | `escalation`                              | Agent is stuck — needs human intervention                  |
|          | `handoff`                                 | Agent completed partial work, handing off context          |
|          | `design-question`                         | Agent encountered an ambiguous design decision             |
|          | `run-summary`                             | Summary of an autonomous run (what was done, what remains) |
|          | `activity`                                | Routine work completion notification                       |
|          | `permissions-request`                     | Bash command denied by permission model                    |
| `agent`  | `auto-implementor`, `planner`, `designer`, `reviewer`, `implementor`, `auto-auditor`, `project-manager` | Which agent wrote this |
| `task`   | string or empty                           | Task name (empty for non-task-bound work)                  |
| `repo`   | `<owner>/<repo>` or empty                 | Repository context (empty for non-repo-bound work)         |
| `date`   | `YYYY-MM-DD`                              | When the triage was written                                |
| `status` | `pending`                                 | Awaiting human review                                      |
|          | `addressed`                               | Human has reviewed and acted on this                       |
|          | `dismissed`                               | Human reviewed and decided no action needed                |

## Body

After the frontmatter, the body is free-form Markdown. Structure depends on the `type`:

### Escalation

- What the agent was trying to do
- What went wrong or what blocked progress
- Relevant error messages or context
- Suggested next steps

### Handoff

- What was completed
- What remains
- Any context the next agent/human needs

### Design question

- The decision point encountered
- Options considered
- Why the agent couldn't resolve it autonomously
- Recommendation (if any)

### Run summary

- Commit groups completed
- Validation results
- Decisions made during the run
- Outstanding items
