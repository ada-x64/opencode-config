---
name: delegate
description: >
  Spawn AoE sessions for parallel agent work. Supports opencode (Docker
  sandbox) and copilot (cloud delegation) backends. Use this skill when
  orchestrating fleet operations across repos or branches.
---

# delegate

## Overview

The delegate skill orchestrates parallel agent work through a three-phase
workflow: **compose → approve → dispatch**. Prompts are vault-managed
Markdown files that the user reviews in Obsidian before any session launches.

Two dispatch backends are supported:

1. **opencode** — local Docker sandbox sessions. Runs with `-s` (sandbox)
   and `-y` (YOLO mode). The common case for repository work.
2. **copilot** — cloud delegation via GitHub Copilot's `/delegate` command.
   Uses a two-step confirmation protocol with tmux interaction.

Two dispatch tools are available:

- `delegate()` — single session dispatch (either backend)
- `delegate_fleet()` — batch copilot dispatch for same-repo sessions

## Prompt File Format

Each prompt is a standalone Markdown file with YAML frontmatter:

```markdown
---
title: "<session title>"
repo: "<owner>/<repo>"
branch: "<branch name>"
backend: "copilot" | "opencode"
new_branch: true | false
group: "<optional AoE group>"
phase: "<optional phase label>"
---

<Full task instructions for the delegated agent>
```

### Frontmatter fields

| Field        | Type      | Required | Description                                                                                     |
| ------------ | --------- | -------- | ----------------------------------------------------------------------------------------------- |
| `title`      | `string`  | Yes      | AoE session title                                                                               |
| `repo`       | `string`  | Yes      | `<owner>/<repo>` identifier                                                                     |
| `branch`     | `string`  | No       | Target branch name                                                                              |
| `backend`    | `string`  | Yes      | `"copilot"` or `"opencode"`                                                                     |
| `new_branch` | `boolean` | No       | Create a new branch (default: `true`; ignored if `branch` is not set or `backend` is `copilot`) |
| `group`      | `string`  | No       | AoE group for session organization                                                              |
| `phase`      | `string`  | No       | Phase label for ordering in multi-phase fleets                                                  |

### Body conventions

- Markdown headers (`##`) and formatting are safe. Avoid only `--` at line
  starts — tmux interprets these as flags.
- Opencode prompts: direct task instructions. The session starts in build
  mode; instruct the agent to switch modes if needed.
- Copilot prompts: end with explicit push/PR instructions
  (e.g., "Create a PR via GitHub referencing #NNN").

### Schema execution prompts

For prompts that execute an existing schema, reference the auto-impl skill
rather than inlining the execution protocol:

```
Load the auto-impl skill and execute the schema at
$AGENT_VAULT/tasks/<task>/schema.md

Repository: $AGENT_REPOS/<owner>/<repo>
Task directory: $AGENT_VAULT/tasks/<task>/

<Any additional context or constraints>
```

## Phase 1: Compose

Write prompt files to the staging directory in the vault:

| Context  | Staging path                                  |
| -------- | --------------------------------------------- |
| Any task | `$AGENT_VAULT/tasks/<task>/prompts/<name>.md` |

### Generation guidance

- One prompt file per session. Filenames are freeform but should be descriptive.
- Use the `phase` frontmatter field to indicate ordering for multi-phase fleets.
- Derive prompt content from the schema's commit groups, reformatted as agent
  instructions with setup/completion context.
- For schema execution, reference the auto-impl skill (see above) — do not
  inline the full execution protocol.
- Use the template at `$AGENT_VAULT/_misc/templates/delegate-prompt.md` as a
  starting point.

## Phase 2: Approve

After composing all prompts, present them to the user for review:

1. Tell the user how many prompts are staged and where they are located.
2. List each prompt by filename and title.
3. Instruct the user to review them in Obsidian.
4. **STOP and wait for explicit confirmation.** Do NOT proceed to dispatch.

The user may:

- Approve all prompts → proceed to Phase 3.
- Request edits → modify the prompt files and re-present for review.
- Cancel → do not dispatch.

This gate is **mandatory**. The agent MUST NOT dispatch sessions without
the user explicitly saying to proceed.

## Phase 3: Dispatch

Read all prompt files from the staging directory and dispatch sessions.

### Backend grouping

Group prompts by backend and repo for optimal dispatch:

| Scenario                 | Dispatch method                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| Opencode (any)           | Individual `delegate()` call per session                                                 |
| Copilot, all same repo   | Single `delegate_fleet()` call                                                           |
| Copilot, different repos | Individual `delegate()` calls (parallel OK)                                              |
| Mixed fleet              | Group copilot by repo → `delegate_fleet()` per group; opencode → individual `delegate()` |

### Dispatch pattern

For each prompt file, read the frontmatter to extract tool parameters and the
body as the prompt text. Then invoke the appropriate tool:

**Individual dispatch (opencode or single copilot):**

```
delegate({
  repo: "<resolved absolute path from owner/repo>",
  prompt: "<prompt body text>",
  title: "<title from frontmatter>",
  tool: "<backend from frontmatter>",
  branch: "<branch from frontmatter>",
  new_branch: <new_branch from frontmatter>,
  group: "<group from frontmatter>"
})
```

**Fleet dispatch (multiple copilot, same repo):**

```
delegate_fleet({
  repo: "<resolved absolute path>",
  group: "<shared group>",
  sessions: [
    { title: "<title>", prompt: "<body>", branch: "<branch>" },
    ...
  ]
})
```

### After dispatch

- Record returned session IDs for monitoring.
- Prompt files remain in the staging directory as a record of what was sent.
- If a session fails and needs re-dispatch, the prompt is already available —
  re-read and re-dispatch.
- For fleet dispatch, the returned array may be shorter than the input if
  some sessions failed to create. Check stderr for error details.

## Tool Reference

### `delegate()` Parameters

| Parameter    | Type                        | Required | Default      | Description                                                                                |
| ------------ | --------------------------- | -------- | ------------ | ------------------------------------------------------------------------------------------ |
| `repo`       | `string`                    | Yes      | —            | Absolute path to the repository                                                            |
| `prompt`     | `string`                    | Yes      | —            | Task prompt text to send to the spawned agent                                              |
| `title`      | `string`                    | Yes      | —            | AoE session title                                                                          |
| `tool`       | `"opencode"` \| `"copilot"` | No       | `"opencode"` | Backend to use                                                                             |
| `branch`     | `string`                    | No       | —            | Branch name (opencode: creates worktree with `-b` flag; copilot: determines worktree HEAD) |
| `new_branch` | `boolean`                   | No       | `true`       | Create a new branch (ignored if `branch` is not set or `backend` is `copilot`)             |
| `group`      | `string`                    | No       | —            | AoE group for organizing sessions                                                          |

Returns the **session ID** (UUID string).

### `delegate_fleet()` Parameters

| Parameter  | Type            | Required | Default | Description                        |
| ---------- | --------------- | -------- | ------- | ---------------------------------- |
| `repo`     | `string`        | Yes      | —       | Absolute path to the repository    |
| `sessions` | `SessionSpec[]` | Yes      | —       | Array of session specs (see below) |
| `group`    | `string`        | No       | —       | AoE group for organizing sessions  |

**SessionSpec:**

| Field    | Type     | Required | Description                                             |
| -------- | -------- | -------- | ------------------------------------------------------- |
| `title`  | `string` | Yes      | AoE session title                                       |
| `prompt` | `string` | Yes      | Task prompt for this session                            |
| `branch` | `string` | No       | Branch or commit to check out in the temporary worktree |

Returns a **JSON array of session IDs**.

**Performance:** Fleet dispatch takes ~2 minutes regardless of session count.
Individual copilot dispatch takes ~2 minutes per session.

## Monitoring

After spawning sessions, use these AoE commands to track progress:

| Command                          | Purpose                   |
| -------------------------------- | ------------------------- |
| `aoe status`                     | Show all session statuses |
| `aoe session capture <id>`       | Capture tmux pane output  |
| `aoe session capture <id> -n 50` | Last 50 lines of output   |
| `aoe session show <id> --json`   | Session details as JSON   |
| `aoe session stop <id>`          | Stop a session            |
| `aoe send <id> <message>`        | Send a follow-up message  |

### Completion signals

- **Opencode:** Poll for an idle prompt, check for triage entries in
  `$AGENT_VAULT/_misc/activity/`, or check schema status changes in vault
  frontmatter.
- **Copilot:** Poll the session output for a PR URL. Copilot creates a PR
  on GitHub when delegation completes.

## Copilot-Specific

### Two-Step Protocol

The copilot backend uses a confirmation protocol:

1. The prompt is sent prefixed with
   "Read this task. Do NOT execute. Confirm understanding."
2. The script polls for confirmation keywords ("Ready", "Understood",
   "Confirm", "Will wait") for up to 90 seconds (checking every 5s).
3. Once confirmed (or timed out), `/delegate` is sent.
4. The "Send to GitHub?" dialog is confirmed via Enter keypress.

### Worktree Isolation

Each copilot session gets its own temporary worktree under
`/tmp/delegate-<id>` to prevent `index.lock` conflicts when multiple
sessions target the same repository. Worktrees are cleaned up automatically
after delegation completes.

- Single dispatch (`delegate()`): worktree created/cleaned within `delegate_session()`.
- Fleet dispatch (`delegate_fleet()`): all worktrees created upfront, cleaned after all sessions complete.

### Timing Expectations

- **Init:** ~8 seconds per session, ~15 seconds shared (fleet).
- **Confirmation:** Typically 15–25 seconds after prompt delivery.
- **Delegation:** ~5 seconds after `/delegate` is sent.

### Troubleshooting

- **"Session not found" on `/delegate`:** Dismiss with Esc, run `/clear`,
  retry `/delegate`.
- **Copilot did not confirm within 90s:** The script continues and sends
  `/delegate`. Check session output manually.
- **index.lock errors:** Should not occur with worktree isolation. If seen,
  check that the worktree was created successfully.

## Constraints

- **MUST NOT dispatch without user approval.** Phase 2 (Approve) is mandatory.
  Never skip directly from compose to dispatch.
- **MUST write prompts to vault before dispatch.** Prompts must exist as
  reviewable files, not as inline strings passed directly to tools.
- **MUST wait for explicit user confirmation.** "Looks good", "proceed",
  "dispatch" — any affirmative. Do not infer approval from silence or
  ambiguous responses.
- **MUST NOT modify prompt files after user approval.** If changes are
  needed, re-enter Phase 2 (Approve) for a new review cycle.
- **Fleet dispatch is copilot-only.** `delegate_fleet()` only handles
  copilot sessions. Opencode sessions always dispatch individually.
- **Fleet dispatch is single-repo.** One `delegate_fleet()` call per repo.
  Multi-repo fleets dispatch as separate calls.
