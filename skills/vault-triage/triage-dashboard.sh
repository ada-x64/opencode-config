#!/usr/bin/env bash
# vault-triage/triage-dashboard.sh — Generate triage inbox dashboard or send summary notification.
# Usage: bash triage-dashboard.sh [--notify-summary]
#
# Requires: AGENT_VAULT set in environment
# Optional: NTFY_TOPIC or $AGENT_VAULT/cache/ntfy-topic.txt (for --notify-summary)
set -euo pipefail

vault="${AGENT_VAULT:?AGENT_VAULT is not set}"
output="$vault/triage-inbox.md"
notify_summary=false
[[ "${1:-}" == "--notify-summary" ]] && notify_summary=true

# Collect triage data
pending=() addressed=() dismissed=()
pending_count=0 addressed_count=0 dismissed_count=0
escalation_count=0

for triage in "$vault"/tasks/*/*/*/triage.md; do
  [[ -f "$triage" ]] || continue
  [[ "$triage" == *"/_fleet/"* ]] && continue

  rel="${triage#"$vault"/}"
  status="$(obsidian property:read vault=agent.obs path="$rel" name=status 2>/dev/null || echo "unknown")"
  type="$(obsidian property:read vault=agent.obs path="$rel" name=type 2>/dev/null || echo "unknown")"
  agent="$(obsidian property:read vault=agent.obs path="$rel" name=agent 2>/dev/null || echo "unknown")"
  date="$(obsidian property:read vault=agent.obs path="$rel" name=date 2>/dev/null || echo "unknown")"

  link="[[${rel%.md}]]"
  row="| $link | $type | $agent | $date |"

  case "$status" in
    pending)
      pending+=("$row")
      (( ++pending_count ))
      [[ "$type" == "escalation" ]] && (( ++escalation_count ))
      ;;
    addressed)
      addressed+=("$row")
      (( ++addressed_count ))
      ;;
    dismissed)
      dismissed+=("$row")
      (( ++dismissed_count ))
      ;;
    *)
      pending+=("$row")
      (( ++pending_count ))
      ;;
  esac
done

# --notify-summary mode: send counts via ntfy, then exit
if $notify_summary; then
  topic="${NTFY_TOPIC:-}"
  if [[ -z "$topic" && -f "$vault/cache/ntfy-topic.txt" ]]; then
    topic="$(cat "$vault/cache/ntfy-topic.txt")"
  fi
  if [[ -z "$topic" ]]; then
    echo "No NTFY_TOPIC set and no $vault/cache/ntfy-topic.txt found. Skipping notification." >&2
    exit 0
  fi

  summary="${pending_count} pending"
  [[ $escalation_count -gt 0 ]] && summary="$summary ($escalation_count escalation(s))"
  summary="$summary, ${addressed_count} addressed, ${dismissed_count} dismissed"

  priority="default"
  [[ $escalation_count -gt 0 ]] && priority="high"

  if command -v ntfy &>/dev/null; then
    ntfy publish --priority="$priority" --title="Triage Summary" --tags="clipboard" "$topic" "$summary" 2>/dev/null || true
  elif command -v curl &>/dev/null; then
    curl -sL -H "Title: Triage Summary" -H "Priority: $priority" -H "Tags: clipboard" \
      -d "$summary" "https://ntfy.sh/$topic" >/dev/null 2>&1 || true
  else
    echo "Neither ntfy nor curl found. Cannot send notification." >&2
  fi
  exit 0
fi

# Dashboard generation mode
{
  echo "# Triage Inbox"
  echo ""
  echo "_Generated: $(date -u '+%Y-%m-%d %H:%M UTC')_"
  echo ""
  echo "## Pending"
  echo ""
  if [[ ${#pending[@]} -gt 0 ]]; then
    echo "| Task | Type | Agent | Date |"
    echo "|------|------|-------|------|"
    printf '%s\n' "${pending[@]}"
  else
    echo "_No pending triage items._"
  fi
  echo ""
  echo "## Addressed"
  echo ""
  if [[ ${#addressed[@]} -gt 0 ]]; then
    echo "| Task | Type | Agent | Date |"
    echo "|------|------|-------|------|"
    printf '%s\n' "${addressed[@]}"
  else
    echo "_None._"
  fi
  echo ""
  echo "## Dismissed"
  echo ""
  if [[ ${#dismissed[@]} -gt 0 ]]; then
    echo "| Task | Type | Agent | Date |"
    echo "|------|------|-------|------|"
    printf '%s\n' "${dismissed[@]}"
  else
    echo "_None._"
  fi
} > "$output"

echo "Dashboard written to $output"
echo "  ${pending_count} pending, ${addressed_count} addressed, ${dismissed_count} dismissed"
