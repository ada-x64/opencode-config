#!/usr/bin/env bash
# delegate.sh — spawn AoE sessions for parallel agent work
set -euo pipefail

delegate_session() {
  local repo="$1"
  local prompt="$2"
  local title="$3"
  local tool="${4:-opencode}"
  local branch="${5:-}"
  local new_branch="${6:-true}"
  local group="${7:-}"

  # Build aoe add command
  local cmd=(aoe add "$repo" -t "$title" -c "$tool")
  [[ -n "$group" ]] && cmd+=(-g "$group")
  [[ -n "$branch" ]] && cmd+=(-w "$branch")
  [[ "$new_branch" == "true" && -n "$branch" ]] && cmd+=(-b)

  # Opencode gets sandbox; copilot does not
  [[ "$tool" == "opencode" ]] && cmd+=(-s)
  cmd+=(-y)

  # Create session, parse ID from output
  local add_output
  add_output=$("${cmd[@]}" 2>&1)
  local session_id
  session_id=$(echo "$add_output" | grep -oP '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)

  if [[ -z "$session_id" ]]; then
    echo "ERROR: Failed to parse session ID from aoe add output:" >&2
    echo "$add_output" >&2
    return 1
  fi

  # Start the session
  aoe session start "$session_id"

  if [[ "$tool" == "opencode" ]]; then
    _delegate_opencode "$session_id" "$prompt"
  else
    _delegate_copilot "$session_id" "$prompt" "$title"
  fi

  echo "$session_id"
}

_delegate_opencode() {
  local session_id="$1"
  local prompt="$2"

  sleep 5 # wait for opencode init
  aoe send "$session_id" "$prompt"
}

_delegate_copilot() {
  local session_id="$1"
  local prompt="$2"
  local title="$3"

  sleep 8 # copilot init is slower

  # Step 1: Send prompt with confirmation request
  aoe send "$session_id" "Read this task. Do NOT execute. Confirm understanding, then I will send /delegate.

$prompt"
  sleep 2

  # Find tmux session and press Enter (aoe send uses tmux paste)
  local tmux_session
  tmux_session=$(tmux list-sessions -F '#{session_name}' |
    grep "^aoe_.*${session_id:0:8}" | head -1)
  if [[ -z "$tmux_session" ]]; then
    echo "WARNING: Could not find tmux session for $session_id" >&2
    return 1
  fi
  tmux send-keys -t "$tmux_session" Enter

  # Step 2: Poll for confirmation (up to 90s, check every 5s)
  local confirmed=false
  for _ in $(seq 1 18); do
    sleep 5
    local capture
    capture=$(aoe session capture "$session_id" --strip-ansi -n 50 2>/dev/null || true)
    if echo "$capture" | grep -qiE '(ready|understood|confirm|will wait)'; then
      confirmed=true
      break
    fi
  done

  if [[ "$confirmed" != "true" ]]; then
    echo "WARNING: Copilot did not confirm within 90s" >&2
  fi

  # Step 3: Send /delegate
  aoe send "$session_id" "/delegate"
  sleep 5

  # Step 4: Confirm "Send to GitHub?" dialog
  tmux send-keys -t "$tmux_session" Enter
}
