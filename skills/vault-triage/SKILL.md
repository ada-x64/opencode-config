---
name: vault-triage
description: >
  Generate a triage dashboard and send push notifications for agent triage entries.
  Use this skill when asked to check pending triage items, generate the triage inbox,
  send triage notifications, or set up the notification system.
---

# Vault Triage Skill

## Overview

Agents write triage files (`triage.md`) to task directories during autonomous runs.
This skill provides tools to surface those triage entries:

1. **Dashboard generation** — `triage-dashboard.sh` walks all triage files and generates
   `$AGENT_VAULT/triage-inbox.md` with wiki-links, grouped by status.
2. **Push notifications** — `notify.sh` provides a `notify_triage` function that agents
   call after writing triage files, sending alerts via ntfy.sh.
3. **Setup** — `setup.sh` performs one-time platform configuration for notifications
   (scheduled daily summaries, ntfy client config, topic generation).

## How to Invoke

### Generate the dashboard

```bash
# Regenerate triage-inbox.md
bash ~/.config/opencode/skills/vault-triage/triage-dashboard.sh

# Send a summary notification instead of regenerating
bash ~/.config/opencode/skills/vault-triage/triage-dashboard.sh --notify-summary
```

### Send a notification (used by agents)

```bash
# Source the helper, then call
source ~/.config/opencode/skills/vault-triage/notify.sh
notify_triage escalation "ada-x64/qproj/fix-tests" "Review loop exhausted on commit group 2"
```

### First-time setup

> **Note:** `setup.sh` is shipped separately. Run once after the full skill is installed.

```bash
bash ~/.config/opencode/skills/vault-triage/setup.sh
```

## Environment

| Variable | Required | Source |
|----------|----------|--------|
| `AGENT_VAULT` | Yes | Agent environment |
| `NTFY_TOPIC` | No | Falls back to `$AGENT_VAULT/cache/ntfy-topic.txt` |

## Dashboard output

Generated at `$AGENT_VAULT/triage-inbox.md`. Sections: Pending, Addressed, Dismissed.
Each row has a wiki-link to the triage file, type, agent, and date.

## Notification priorities

| Triage type | ntfy priority | Audible |
|-------------|---------------|---------|
| `escalation` | high | Yes |
| `design-question` | high | Yes |
| `handoff` | default | No |
| `run-summary` | low | No |
