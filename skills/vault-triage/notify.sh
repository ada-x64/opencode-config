#!/usr/bin/env bash
# vault-triage/notify.sh — Notification helper for agents.
# Source this file to get the notify_triage function.
# Usage: source ~/.config/opencode/skills/vault-triage/notify.sh
#        notify_triage <type> <task> <body>
#
# Requires: AGENT_VAULT (for topic file fallback)
# Optional: NTFY_TOPIC env var or $AGENT_VAULT/cache/ntfy-topic.txt

notify_triage() {
  local type="${1:-}" task="${2:-}" body="${3:-}"
  local priority="default"
  local tag="information_source"

  case "$type" in
    escalation)      priority="high";    tag="rotating_light" ;;
    design-question) priority="high";    tag="question" ;;
    handoff)         priority="default"; tag="handshake" ;;
    run-summary)     priority="low";     tag="memo" ;;
  esac

  # Allow caller to override priority (e.g. implementor uses "low" for all)
  if [[ -n "${NOTIFY_TRIAGE_PRIORITY:-}" ]]; then
    priority="$NOTIFY_TRIAGE_PRIORITY"
  fi

  # Resolve topic
  local topic="${NTFY_TOPIC:-}"
  if [[ -z "$topic" && -n "${AGENT_VAULT:-}" && -f "${AGENT_VAULT}/cache/ntfy-topic.txt" ]]; then
    topic="$(cat "${AGENT_VAULT}/cache/ntfy-topic.txt")"
  fi

  # No topic = silently skip
  [[ -z "$topic" ]] && return 0

  # Send notification — fail silently, never block agent work
  if command -v ntfy &>/dev/null; then
    ntfy publish --priority="$priority" --title="[$type] $task" --tags="$tag" \
      "$topic" "$body" 2>/dev/null || true
  elif command -v curl &>/dev/null; then
    curl -s \
      -H "Title: [$type] $task" \
      -H "Priority: $priority" \
      -H "Tags: $tag" \
      -d "$body" \
      "ntfy.sh/$topic" >/dev/null 2>&1 || true
  fi
  # If neither ntfy nor curl is available, silently do nothing
  return 0
}
