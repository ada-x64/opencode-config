---
name: vault-triage
description: >
  Full triage skill for all agents — write triage entries, send push notifications,
  and regenerate the triage inbox. Load this skill after any significant work.
  Use it to check pending triage items, generate the dashboard, or set up notifications.
---

# Vault Triage Skill

## Overview

Every agent loads this skill after completing significant work. The three
post-work steps are **mandatory** — skipping notify or inbox update is a
protocol violation:

1. **Write** a triage entry to the task directory
2. **Send** a push notification via `notify_triage`
3. **Regenerate** the triage inbox via `triage-dashboard.sh`

This skill applies in **Write Mode** (after completing work) and **Report Mode**
(when summarising pending triage items for human review).

---

## Write Mode

Follow these steps in order after completing significant work:

### Step 1 — Source the notification helper

```bash
source ~/.config/opencode/skills/vault-triage/notify.sh 2>/dev/null || true
```

### Step 2 — Confirm AGENT_VAULT is set

```bash
echo "${AGENT_VAULT:?AGENT_VAULT must be set}"
```

### Step 3 — Determine the task directory

```bash
task_dir="$AGENT_VAULT/tasks/<owner>/<repo>/<task>/"
```

If no task context exists (e.g. designer writing repo notes, auto-auditor
running a standalone audit), use the agent-specific fallback:

- `@designer` → `$AGENT_VAULT/tasks/_activity/designer/`
- `@auto-auditor` → `$AGENT_VAULT/tasks/_activity/auto-auditor/`
- `@project-manager` → `$AGENT_VAULT/tasks/_activity/project-manager/`

Task-bound agents (`@planner`, `@reviewer`, `@implementor`, `@auto-implementor`)
always have a task context and do not need a fallback.

Create the directory if it does not exist:

```bash
mkdir -p "$task_dir"
```

### Step 4 — Find the next available filename

```bash
find "$task_dir" -name "triage*.md" | sort
```

- If no files exist → use `triage.md`
- If `triage.md` exists but not `triage-2.md` → use `triage-2.md`
- Continue incrementing: `triage-3.md`, `triage-4.md`, etc.

### Step 5 — Read the format template

```bash
cat "$AGENT_VAULT/_misc/templates/triage.md"
```

### Step 6 — Write the triage entry

Use the Write tool. Follow the frontmatter format and body structure for the
entry type (see **Entry Types** below). Set `status: pending`.

### Step 7 — MANDATORY: Send notification

```bash
notify_triage "<type>" "<owner>/<repo>/<task>" "<headline>" "<body>" "" "<icon>" "<semantic-key>"
```

This is not optional. Failing to notify means the human has no real-time
awareness of completed work. The function fails silently if ntfy is not
configured — it will never block your work.

The 3rd arg (`headline`) is a short action phrase for the title. The 4th arg
(`body`) is optional bullet-point detail text. The 5th arg (`file`) can be
left empty `""` to use the default triage path. The 6th arg (`icon`) selects
the notification icon (see reference table below). The 7th arg (`semantic-key`)
controls the emoji prefix — pass a key from the table below; `notify.sh`
resolves it to the correct emoji. If omitted, a default emoji is derived from
the triage type.

### Step 8 — MANDATORY: Regenerate inbox

```bash
bash ~/.config/opencode/skills/vault-triage/triage-dashboard.sh
```

This is not optional. The triage inbox must always reflect the current
state of the vault after every write.

---

## Reference: Notification icons and emoji keys

### Icon names (per agent / mode)

Pass as the 6th argument to `notify_triage`. The icon name maps to a PNG served
from the opencode-config repo.

| Agent / Mode | Icon argument |
|--------------|--------------|
| `@implementor` | `implementor` |
| `@auto-implementor` | `auto-implementor` |
| `@auto-auditor` | `auto-auditor` |
| Audit mode | `auditor` |
| `@reviewer` | `reviewer` |
| `@planner` | `planner` |
| `@designer` | `designer` |
| `@project-manager` | `project-manager` |
| Build mode | `build` |
| Plan mode | `plan` |
| Fallback | `default` |

### Semantic keys (7th argument — emoji resolution)

Pass a semantic key as the 7th argument. `notify.sh` resolves it to the
correct emoji. **Always use semantic keys** — they are readable and their
mappings are centrally managed. Unknown keys are ignored and fall back to the
type-based default emoji.
If the 7th argument is omitted, a default emoji is derived from the triage type.

#### Type-based defaults (when 7th arg is omitted)

| Triage type | Emoji |
|-------------|-------|
| `escalation` | ❗ |
| `design-question` | ❓ |
| `activity` | 📋 |
| `handoff` | 📋 |
| `run-summary` | 📋 |

#### Explicit semantic keys

| Key | Emoji | Used when |
|-----|-------|-----------|
| `activity` | 📋 | General work completion |
| `clean` | 🟢 | Review/audit: 0 high+ findings |
| `warn` | 🟡 | Review/audit: nit/low findings only |
| `reject` | 🔴 | Review/audit: high or critical findings |
| `escalation` | ❗ | Review loop exhausted or blocking issue |
| `design-question` | ❓ | Design ambiguity needing human input |

**Auto-agent prefix:** When the `icon` parameter starts with `auto-` (e.g.
`"auto-implementor"`), `notify.sh` strips the prefix for the PNG URL lookup
and prepends ⚙️ to the resolved emoji. Agents do not use separate `auto-*`
semantic keys — the ⚙️ prefix is derived automatically from the agent name.

**Example calls with icon and semantic key:**

```bash
# Reviewer — clean result
notify_triage activity "ada-x64/qproj/fix-tests" "Review Complete" "• 0 high findings" "" "reviewer" "clean"

# Auto-implementor — commit group complete (⚙️ prefix added automatically)
notify_triage activity "ada-x64/qproj/fix-tests" "Commit Group 1 Finished" "• All tests passing" "" "auto-implementor" "activity"

# Auto-auditor — warnings (⚙️ prefix added automatically)
notify_triage activity "ada-x64/qproj/audit" "Audit Complete" "• 2 medium warnings" "" "auto-auditor" "warn"

# Auto-implementor escalation (⚙️ prefix added automatically)
notify_triage escalation "ada-x64/qproj/fix-tests" "Review Loop Exhausted" "• High findings persist" "" "auto-implementor" "escalation"
```

---

## Entry Types

### `activity` — routine work completion

**When:** After any significant completed work (schema written, review done,
audit complete, implementation commit group finished, project sync done, etc.)

**Format:** Brief — 2-3 sentences:
- What the agent did
- The outcome / result
- Next steps (if any)

**Example:**
```yaml
---
type: activity
agent: reviewer
task: my-task
date: 2026-03-31
status: pending
---

Completed code review of commit group 2. Found 3 nits and 1 medium finding
(missing error handling in retry loop). Implementor should address the medium
finding before proceeding to group 3.
```

---

### `escalation` — review loop exhausted / agent stuck

**When:** After 3 review rounds with high+ findings persisting, or any time
the agent is blocked and cannot proceed without human input.

**Format:** Detailed — must include:
- **Diagnosis** — one of: `implementation-gap`, `schema-ambiguity`,
  `design-contradiction`, `underspecified-requirement`
- **Persistent findings** — verbatim from the last review
- **What was tried** — summary of fix attempts across all rounds
- **Recommendation** — suggested human action

**Example:**
```yaml
---
type: escalation
agent: auto-implementor
task: my-task
date: 2026-03-31
status: pending
---

## Diagnosis: schema-ambiguity

## Persistent Findings (Round 3)

- [high/design] The retry logic in `src/client.rs` does not handle the
  `ConnectionReset` variant — this was flagged in all 3 review rounds.

## What Was Tried

- Round 1: Added `ConnectionReset` to the retry match arm.
- Round 2: Reviewer flagged that the fix introduced a loop without backoff.
- Round 3: Added exponential backoff; reviewer flagged missing test coverage
  for the backoff path, which requires integration test infrastructure not
  present in this repo.

## Recommendation

Human should decide whether to add integration test infrastructure or accept
the backoff logic without coverage. Schema §2c is underspecified on this point.
```

---

### `design-question` — ambiguity resolved with judgment call

**When:** A genuine design ambiguity was encountered during implementation and
a non-trivial judgment call was made that the schema did not resolve.

**Format:** Detailed — must include:
- **Decision point** — the specific ambiguity encountered
- **Options considered** — list of options evaluated
- **Why the agent couldn't resolve autonomously** — what was unclear
- **Choice made and rationale** — what was chosen and why
- **Recommendation for human review** — whether the choice should be revisited

**Example:**
```yaml
---
type: design-question
agent: auto-implementor
task: my-task
date: YYYY-MM-DD
status: pending
---

## Decision Point

The schema specifies "add retry logic" but does not define the retry strategy
(fixed delay vs. exponential backoff vs. jitter).

## Options Considered

1. Fixed delay (simple, predictable)
2. Exponential backoff (standard for network retries)
3. Exponential backoff with jitter (avoids thundering herd)

## Why Agent Couldn't Resolve Autonomously

Schema §2c says "handle transient errors with retries" with no further detail.
Existing code in this repo uses fixed delays (see `src/http.rs:44`).

## Choice Made

Exponential backoff with jitter, matching the project's other HTTP client
(`src/api_client.rs:88`). Avoids introducing a second retry pattern.

## Recommendation

Review whether this is consistent with the team's preferred pattern.
```

---

### `run-summary` — end-of-run summary

**When:** At completion of a full autonomous implementation run.

**Format:** Comprehensive — must include:
- Commit groups completed (list with validation results)
- Total review rounds
- Escalations filed (filenames or "none")
- Design decisions made (or "none")
- Unresolved nit/low findings

---

### `handoff` — context transfer

**When:** Work is interrupted mid-run and the next agent or human needs
context to continue.

**Format:** Clear and complete — must include:
- Last completed work
- What remains
- Any context the next agent/human needs to pick up cleanly

---

## Notification Events by Agent Role

| Agent | Events | Type |
|-------|--------|------|
| `@planner` | Schema written; Issue created | `activity` |
| `@reviewer` | Review completed (include finding counts + max severity) | `activity` |
| `@designer` | Repo notes or design document written | `activity` |
| `@implementor` | Commit group completed; Full implementation complete | `activity` |
| `@auto-implementor` | Review loop exhausted | `escalation` |
| `@auto-implementor` | Design ambiguity resolved | `design-question` |
| `@auto-implementor` | Run complete | `run-summary` |
| `@auto-implementor` | Commit group completed | `activity` |
| `@auto-auditor` | Audit report completed (include critical/high counts) | `activity` |
| `@project-manager` | Bulk operations completed; Vault cleanup; Project sync | `activity` |

---

## Report Mode

To read triage files and generate a summary of pending items:

1. Collect all triage files in scope:
   ```bash
   find "$AGENT_VAULT/tasks/<owner>/<repo>/" -name "triage*.md" | sort
   ```
   Or across the entire vault:
   ```bash
   find "$AGENT_VAULT/tasks/" -name "triage*.md" | sort
   ```

2. Read each file and extract frontmatter fields:
   ```bash
   source ~/.config/opencode/skills/lib/frontmatter.sh
   fm_read "$file" "type" "unknown"
   fm_read "$file" "status" "unknown"
   fm_read "$file" "date" "unknown"
   fm_read "$file" "agent" "unknown"
   ```

3. Group by type. Filter to `status: pending` by default (unless the human
   asks for addressed or dismissed items too).

4. Produce a Markdown summary grouped by type:
   - **Escalations** (action required — highest priority)
   - **Design questions** (human judgment needed)
   - **Handoffs** (pick up where agent left off)
   - **Run summaries** (review at leisure)
   - **Activity** (FYI — no action required)

---

## How to Invoke (Dashboard and Notifications)

### Generate the dashboard

```bash
# Regenerate triage-inbox.md
bash ~/.config/opencode/skills/vault-triage/triage-dashboard.sh

# Send a summary notification instead of regenerating
bash ~/.config/opencode/skills/vault-triage/triage-dashboard.sh --notify-summary
```

### Send a notification manually

```bash
source ~/.config/opencode/skills/vault-triage/notify.sh
notify_triage escalation "ada-x64/qproj/fix-tests" "Review loop exhausted on commit group 2" "" "" "auto-implementor" "escalation"
notify_triage activity "ada-x64/qproj/fix-tests" "Commit group 1 complete" "• All tests passing" "" "auto-implementor" "activity"
```

### First-time setup

> **Note:** `setup.sh` is shipped separately. Run once after the full skill is installed.

```bash
bash ~/.config/opencode/skills/vault-triage/setup.sh
```

---

## Environment

| Variable | Required | Source |
|----------|----------|--------|
| `AGENT_VAULT` | Yes | Agent environment |
| `NTFY_TOPIC` | No | Falls back to `$AGENT_VAULT/_misc/cache/ntfy-topic.txt` |

## Dashboard output

Generated at `$AGENT_VAULT/triage-inbox.md`. Sections: Pending, Addressed,
Dismissed. Each row has a wiki-link to the triage file, type, agent, and date.

## Notification priorities

All triage types produce desktop toasts (via ntfy subscriber) and phone
notifications. Priority controls audible alerts on mobile:

| Triage type | ntfy priority | Phone audible |
|-------------|---------------|---------------|
| `escalation` | high | Yes |
| `design-question` | high | Yes |
| `activity` | default | No |
| `handoff` | default | No |
| `run-summary` | low | No |
