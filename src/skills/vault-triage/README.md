# vault-triage

Surfaces agent triage output (escalations, design questions, run summaries)
via a Markdown dashboard and push notifications.

## What it does

When agents run autonomously overnight they write `triage.md` files deep inside
`$AGENT_VAULT/tasks/`. This skill gives you two ways to find them:

1. **Dashboard** (`triage-inbox.md`) — a generated Markdown file at the vault
   root listing all triage entries grouped by status (Pending / Addressed /
   Dismissed). Refresh it on demand; open it in Obsidian for clickable
   wiki-links.

2. **Push notifications** — agents call `notify_triage` after writing a triage
   entry. All notifications produce desktop toasts (via ntfy subscriber →
   BurntToast / notify-send / osascript) and phone alerts. Escalations and
   design questions ring audibly (high priority); activity and handoff are
   silent; run summaries are low priority. A scheduled daily digest sends a
   count summary at 9am and 5pm.

Notifications travel via **ntfy.sh**: the agent does a plain `curl` POST, and
you receive it on your phone (ntfy app) and desktop (ntfy client daemon →
`notify-send` / `osascript`). This works even when agents run headlessly on a
remote machine with no display.

## First-time setup

### 1. Run setup.sh

```bash
bash "$OPENCODE_CONFIG_SRC/skills/vault-triage/setup.sh"
```

This will:

- Detect your platform (Linux / macOS / WSL)
- Generate a random ntfy topic and save it to `$AGENT_VAULT/_misc/cache/ntfy-topic.txt`
- Write an ntfy client config to `~/.config/ntfy/client.yml`
- Install a scheduled timer (systemd / launchd / schtasks) for daily digests at
  9am and 5pm

No `sudo` required.

### 2. Install the ntfy app on your phone

- **Android / iOS:** search "ntfy" in your app store, or go to <https://ntfy.sh>
- Open the app → **Subscribe to topic** → paste the topic printed by `setup.sh`
  (also in `$AGENT_VAULT/_misc/cache/ntfy-topic.txt`)

### 3. Install the ntfy CLI (for desktop notifications)

The ntfy CLI runs as a background subscriber and forwards all messages to your
OS notification system. If you skip this step you still get phone notifications;
you just won't get desktop pop-ups.

| Platform    | Install                               |
| ----------- | ------------------------------------- |
| Linux (apt) | `sudo apt install ntfy`               |
| Linux (pip) | `pip install ntfy`                    |
| macOS       | `brew install ntfy`                   |
| WSL         | Install on the Linux side via apt/pip |

Then start the subscriber daemon:

```bash
ntfy subscribe --from-config
```

For it to start automatically on login, add that line to your shell profile or
run `ntfy subscribe --from-config &` in a startup script.

> **WSL note:** Desktop notifications use `New-BurntToastNotification` via
> `pwsh.exe` (PowerShell 7). `setup.sh` auto-detects the absolute path so
> systemd services can find it. Install BurntToast on the Windows side first:
>
> ```powershell
> Install-Module BurntToast -Scope CurrentUser
> ```

### 4. Test it

```bash
source "$OPENCODE_CONFIG_SRC/skills/vault-triage/notify.sh"
notify_triage escalation test/task "Hello from setup" "" "" "default"
```

You should receive a high-priority notification on your phone within a few
seconds.

## Daily usage

### Refresh the dashboard

```bash
bash "$OPENCODE_CONFIG_SRC/skills/vault-triage/triage-dashboard.sh"
```

Opens/refreshes `$AGENT_VAULT/triage-inbox.md`. The scheduled timer does this
automatically and sends a summary notification instead of writing the file
(`--notify-summary` flag).

### Check pending items without opening Obsidian

```bash
bash "$OPENCODE_CONFIG_SRC/skills/vault-triage/triage-dashboard.sh" && \
  grep -A 20 "## Pending" "$AGENT_VAULT/triage-inbox.md"
```

### Send a manual summary notification now

```bash
bash "$OPENCODE_CONFIG_SRC/skills/vault-triage/triage-dashboard.sh" --notify-summary
```

## Environment variables

| Variable      | Required | Description                                                              |
| ------------- | -------- | ------------------------------------------------------------------------ |
| `AGENT_VAULT` | Yes      | Path to the vault (e.g. `~/obsidian/agent.obs`)                          |
| `NTFY_TOPIC`  | No       | ntfy topic name; falls back to `$AGENT_VAULT/_misc/cache/ntfy-topic.txt` |

## Re-running setup

`setup.sh` is idempotent. If your topic file already exists it reuses the
existing topic. Run it again after migrating to a new machine.

## Files

| File                  | Purpose                                                                    |
| --------------------- | -------------------------------------------------------------------------- |
| `setup.sh`            | One-time platform setup (run manually)                                     |
| `triage-dashboard.sh` | Dashboard generator and summary notifier (run on demand or by timer)       |
| `notify.sh`           | `notify_triage` function — sourced by agents, not run directly             |
| `toast-handler.sh`    | Cross-platform toast handler for ntfy subscribe (icon + platform dispatch) |
| `SKILL.md`            | Agent-facing descriptor loaded by the `vault-triage` skill                 |
