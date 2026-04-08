---
name: delegate
description: >
  Spawn AoE sessions for parallel agent work. Supports opencode (Docker
  sandbox) and copilot (cloud delegation) backends. Use this skill when
  orchestrating fleet operations across repos or branches.
---

# delegate

## Overview

The delegate tool spawns [Agent of Empires](https://github.com/njbrake/agent-of-empires)
(AoE) sessions for parallel agent work. Two backends are supported:

1. **opencode** — local Docker sandbox sessions. The common case for
   repository work. Runs with `-s` (sandbox) and `-y` (YOLO mode).
2. **copilot** — cloud delegation via GitHub Copilot's `/delegate` command.
   Uses a two-step confirmation protocol with tmux interaction.

## Tool Reference

### Parameters

| Parameter    | Type                        | Required | Default      | Description                                           |
| ------------ | --------------------------- | -------- | ------------ | ----------------------------------------------------- |
| `repo`       | `string`                    | Yes      | —            | Absolute path to the repository                       |
| `prompt`     | `string`                    | Yes      | —            | Task prompt text to send to the spawned agent         |
| `title`      | `string`                    | Yes      | —            | AoE session title                                     |
| `tool`       | `"opencode"` \| `"copilot"` | No       | `"opencode"` | Backend to use                                        |
| `branch`     | `string`                    | No       | —            | Branch name (implies `--worktree` in AoE)             |
| `new_branch` | `boolean`                   | No       | `true`       | Create a new branch (only applies when branch is set) |
| `group`      | `string`                    | No       | —            | AoE group for organizing sessions                     |

### Return Value

Returns the **session ID** (UUID string) for the spawned AoE session. Use
this ID with monitoring commands to track progress.

### Usage Examples

**Opencode (default):**

```
delegate({
  repo: "/workspace/owner/repo/main",
  prompt: "Implement the caching layer per schema. Run tests after each commit group.",
  title: "cache-layer",
  branch: "feat/cache-layer"
})
```

**Copilot (cloud):**

```
delegate({
  repo: "/workspace/owner/repo/main",
  prompt: "Fix the race condition in the connection pool. Do NOT push. Create a PR via GitHub referencing #42.",
  title: "fix-race-condition",
  tool: "copilot",
  branch: "fix/race-condition"
})
```

**With group (fleet orchestration):**

```
delegate({
  repo: "/workspace/owner/repo/main",
  prompt: "Run the full audit suite and write findings to the vault.",
  title: "audit-repo-a",
  group: "weekly-audit"
})
```

## Fleet Orchestration

To orchestrate parallel work across multiple repos or branches:

1. **Spawn sessions** — call `delegate` once per session, collecting the
   returned session IDs.
2. **Monitor progress** — enter a polling loop using the monitoring commands
   below.
3. **Collect results** — check for triage entries, PRs, or specific output
   patterns depending on the backend.

### Pattern

```
# Spawn sessions
id_1 = delegate({ repo: repo_a, prompt: task_a, title: "task-a", group: "batch" })
id_2 = delegate({ repo: repo_b, prompt: task_b, title: "task-b", group: "batch" })

# Monitor loop
# Use aoe status, aoe session capture <id>, and aoe session show <id> --json
# to track progress across all sessions.
```

## Monitoring Commands

After spawning sessions, use these AoE commands to track progress:

| Command                          | Purpose                   |
| -------------------------------- | ------------------------- |
| `aoe status`                     | Show all session statuses |
| `aoe session capture <id>`       | Capture tmux pane output  |
| `aoe session capture <id> -n 50` | Last 50 lines of output   |
| `aoe session show <id> --json`   | Session details as JSON   |
| `aoe session stop <id>`          | Stop a session            |
| `aoe send <id> <message>`        | Send a follow-up message  |

## Prompt Guidelines

- **Flat text only.** No Markdown formatting that could confuse tmux.
- **Avoid `--` at line starts.** tmux interprets these as flags, which
  corrupts the prompt delivery.
- **Opencode prompts:** Direct task instructions. The session starts in
  build mode; for audit or note-taking, instruct the agent to switch modes
  in the prompt.
- **Copilot prompts:** End with explicit instructions like
  "Do NOT push. Create a PR via GitHub referencing #NNN." Copilot handles
  its own git operations.

## Copilot-Specific

### Two-Step Protocol

The copilot backend uses a confirmation protocol to ensure the agent
understands the task before delegation:

1. The prompt is sent prefixed with
   "Read this task. Do NOT execute. Confirm understanding."
2. The script polls for confirmation keywords ("Ready", "Understood",
   "Confirm", "Will wait") for up to 90 seconds (checking every 5s).
3. Once confirmed (or timed out), `/delegate` is sent.
4. The "Send to GitHub?" dialog is confirmed via Enter keypress.

### Timing Expectations

- **Init:** ~8 seconds for copilot to become responsive.
- **Confirmation:** Typically 15–25 seconds after prompt delivery.
- **Delegation:** ~5 seconds after `/delegate` is sent.

### Troubleshooting

- **"Session not found" on `/delegate`:** This is intermittent. Dismiss
  with Esc, run `/clear`, then retry `/delegate`.
- **Copilot did not confirm within 90s:** The script continues anyway and
  sends `/delegate`. Check the session output manually to verify the task
  was received.

## Result Collection

- **Opencode sessions:** Poll for an idle prompt or check for triage entries
  in `$AGENT_VAULT/_misc/activity/`. The spawned agent writes triage entries
  on completion.
- **Copilot sessions:** Poll the session output for a PR URL. Copilot
  creates a PR on GitHub when delegation completes successfully.
