# vault-triage

Surfaces agent triage output (escalations, design questions, run summaries)
via push notifications.

## What it does

When agents run autonomously overnight they write `triage.md` files deep inside
`$AGENT_VAULT/tasks/`. This skill gives you push notifications to find them:

- **Push notifications** — agents call `notify_triage` after writing a triage
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
- Generate a random ntfy topic and save it to `$AGENT_VAULT/_misc/ntfy-topic.txt`
- Write an ntfy client config to `~/.config/ntfy/client.yml`
- Install a scheduled timer (systemd / launchd / schtasks) for daily digests at
  9am and 5pm

No `sudo` required.

### 2. Install the ntfy app on your phone

- **Android / iOS:** search "ntfy" in your app store, or go to <https://ntfy.sh>
- Open the app → **Subscribe to topic** → paste the topic printed by `setup.sh`
  (also in `$AGENT_VAULT/_misc/ntfy-topic.txt`)

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

Use the `notify_triage` tool in an agent session, or run the script directly:

```bash
bash "$OPENCODE_CONFIG_SRC/tools/notify.sh" escalation test/task "Hello from setup" "" "" "default"
```

You should receive a high-priority notification on your phone within a few
seconds.

## Daily usage

### Check pending items

Use the `vault-triage` skill in Report Mode, or use `vault_find({ section: "triage" })`
to locate and read triage entries directly.

## Environment variables

| Variable      | Required | Description                                                        |
| ------------- | -------- | ------------------------------------------------------------------ |
| `AGENT_VAULT` | Yes      | Path to the vault (e.g. `~/obsidian/agent.obs`)                    |
| `NTFY_TOPIC`  | No       | ntfy topic name; falls back to `$AGENT_VAULT/_misc/ntfy-topic.txt` |

## Re-running setup

`setup.sh` is idempotent. If your topic file already exists it reuses the
existing topic. Run it again after migrating to a new machine.

## Files

| File                                         | Purpose                                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| `setup.sh`                                   | One-time platform setup (run manually)                                     |
| `toast-handler.sh`                           | Cross-platform toast handler for ntfy subscribe (icon + platform dispatch) |
| `SKILL.md`                                   | Agent-facing descriptor loaded by the `vault-triage` skill                 |
| `$OPENCODE_CONFIG_SRC/tools/notify.sh`       | `notify_triage` function — used by agents via the `notify_triage` tool     |
| `$OPENCODE_CONFIG_SRC/tools/triage-write.sh` | Triage entry writer — used by agents via the `triage_write` tool           |
