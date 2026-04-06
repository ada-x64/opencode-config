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

1. **Write** a triage entry:
   ```
   triage_write({ type: "<type>", task: "<owner>/<repo>/<task>", agent: "<agent>", headline: "<headline>", body: "<body>" })
   ```
2. **Send** a push notification:
   ```
   notify_triage({ type: "<type>", task: "<owner>/<repo>/<task>", headline: "<headline>", body: "<body>", icon: "<icon>", emoji: "<semantic-key>" })
   ```
3. **Regenerate** the triage inbox:
   ```
   triage_dashboard({})
   ```

> **First-time setup:** Run `bash "$OPENCODE_CONFIG_SRC/skills/vault-triage/setup.sh"` once after install.

---

## Reference: Notification icons and emoji keys

### Icon names (per agent / mode)

Pass as the `icon` parameter to `notify_triage`. The icon name maps to a PNG served
from the opencode-config repo.

| Agent / Mode       | Icon argument      |
| ------------------ | ------------------ |
| `@implementor`     | `implementor`      |
| `auto-impl` skill  | `auto-implementor` |
| `@auto-auditor`    | `auto-auditor`     |
| Audit mode         | `auditor`          |
| `@reviewer`        | `reviewer`         |
| `@planner`         | `planner`          |
| `@designer`        | `designer`         |
| `@investigate`     | `investigate`      |
| `@project-manager` | `project-manager`  |
| Build mode         | `build`            |
| Plan mode          | `plan`             |
| Fallback           | `default`          |

### Semantic keys (`emoji` parameter — emoji resolution)

Pass a semantic key as the `emoji` parameter. The tool resolves it to the
correct emoji. **Always use semantic keys** — they are readable and their
mappings are centrally managed. Unknown keys are ignored and fall back to the
type-based default emoji.

#### Type-based defaults (when `emoji` is omitted)

| Triage type       | Emoji |
| ----------------- | ----- |
| `escalation`      | ❗    |
| `design-question` | ❓    |
| `activity`        | 📋    |
| `handoff`         | 📋    |
| `run-summary`     | 📋    |

#### Explicit semantic keys

| Key               | Emoji | Used when                               |
| ----------------- | ----- | --------------------------------------- |
| `activity`        | 📋    | General work completion                 |
| `clean`           | 🟢    | Review/audit: 0 high+ findings          |
| `warn`            | 🟡    | Review/audit: nit/low findings only     |
| `reject`          | 🔴    | Review/audit: high or critical findings |
| `escalation`      | ❗    | Review loop exhausted or blocking issue |
| `design-question` | ❓    | Design ambiguity needing human input    |

**Auto-agent prefix:** When the `icon` parameter starts with `auto-` (e.g.
`"auto-implementor"`), `notify.sh` strips the prefix for the PNG URL lookup
and prepends ⚙️ to the resolved emoji. Agents do not use separate `auto-*`
semantic keys — the ⚙️ prefix is derived automatically from the agent name.

---

## Entry Types

### `activity` — routine work completion

**When:** After any significant completed work (schema written, review done,
audit complete, implementation commit group finished, project sync done, etc.)

**Format:** Brief — 2-3 sentences:

- What the agent did
- The outcome / result
- Next steps (if any)

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

| Agent              | Events                                                   | Type              |
| ------------------ | -------------------------------------------------------- | ----------------- |
| `@planner`         | Schema written; Issue created                            | `activity`        |
| `@reviewer`        | Review completed (include finding counts + max severity) | `activity`        |
| `@designer`        | Design document written                                  | `activity`        |
| `@investigate`     | Repo notes written (include note count + topics)         | `activity`        |
| `@implementor`     | Commit group completed; Full implementation complete     | `activity`        |
| `auto-impl` skill  | Review loop exhausted                                    | `escalation`      |
| `auto-impl` skill  | Design ambiguity resolved                                | `design-question` |
| `auto-impl` skill  | Run complete                                             | `run-summary`     |
| `auto-impl` skill  | Commit group completed                                   | `activity`        |
| `@auto-auditor`    | Audit report completed (include critical/high counts)    | `activity`        |
| `@project-manager` | Bulk operations completed; Vault cleanup; Project sync   | `activity`        |

---

## Report Mode

To read triage files and generate a summary of pending items:

1. Collect all triage files in scope using `vault_find`:

   ```
   vault_find({ section: "triage" })
   vault_find({ section: "triage", repo: "ada-x64/opencode-config" })
   ```

2. Read each file and extract frontmatter fields using the `fm_read` tool:

   ```
   fm_read({ file: "<path>", key: "type", default_value: "unknown" })
   fm_read({ file: "<path>", key: "status", default_value: "unknown" })
   fm_read({ file: "<path>", key: "date", default_value: "unknown" })
   fm_read({ file: "<path>", key: "agent", default_value: "unknown" })
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

## Environment

| Variable      | Required | Source                                                  |
| ------------- | -------- | ------------------------------------------------------- |
| `AGENT_VAULT` | Yes      | Agent environment                                       |
| `NTFY_TOPIC`  | No       | Falls back to `$AGENT_VAULT/_misc/cache/ntfy-topic.txt` |

## Dashboard output

Generated at `$AGENT_VAULT/triage-inbox.md`. Sections: Pending, Addressed,
Dismissed. Each row has a wiki-link to the triage file, type, agent, and date.

## Notification priorities

| Triage type       | ntfy priority | Phone audible |
| ----------------- | ------------- | ------------- |
| `escalation`      | high          | Yes           |
| `design-question` | high          | Yes           |
| `activity`        | default       | No            |
| `handoff`         | default       | No            |
| `run-summary`     | low           | No            |
