# Triage Document Format

Triage documents capture autonomous agent output within a task directory. They are written by agents (especially the auto-implementor) to record decisions, escalations, and handoff notes for human review.

## Location

Triage documents live inside task directories:

```
tasks/<owner>/<repo>/<task>/triage.md
```

## Frontmatter

Every triage document starts with YAML frontmatter:

```yaml
---
type: escalation | handoff | design-question | run-summary
agent: auto-implementor | planner | designer
task: task-name
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
| `agent`  | `auto-implementor`, `planner`, `designer` | Which agent wrote this                                     |
| `task`   | string                                    | Task name matching the parent directory                    |
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
