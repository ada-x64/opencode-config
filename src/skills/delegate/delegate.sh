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
  if [[ -n "$branch" && "$tool" != "copilot" ]]; then
    cmd+=(-w "$branch")
    [[ "$new_branch" == "true" ]] && cmd+=(-b)
  fi

  # Opencode gets sandbox; copilot does not
  [[ "$tool" == "opencode" ]] && cmd+=(-s)
  cmd+=(-y)

  # For copilot sessions, create an isolated worktree to avoid index.lock conflicts
  local worktree_path=""
  if [[ "$tool" == "copilot" ]]; then
    local short_id
    short_id=$(cat /proc/sys/kernel/random/uuid 2>/dev/null | grep -oP '^[0-9a-f]{8}' || date +%s%N | sha256sum | head -c 8)
    worktree_path="/tmp/delegate-${short_id}"
    if [[ -n "$branch" ]]; then
      git -C "$repo" worktree add "$worktree_path" "$branch" --detach 2>/dev/null || \
        git -C "$repo" worktree add "$worktree_path" --detach
    else
      git -C "$repo" worktree add "$worktree_path" --detach
    fi
    # Point the aoe session at the isolated worktree instead of the shared repo
    cmd[2]="$worktree_path"
  fi

  # Create session, parse ID from output
  local add_output
  add_output=$("${cmd[@]}" 2>&1)
  local session_id
  session_id=$(echo "$add_output" | grep -oP '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)

  if [[ -z "$session_id" ]]; then
    echo "ERROR: Failed to parse session ID from aoe add output:" >&2
    echo "$add_output" >&2
    # Clean up orphaned worktree before returning
    if [[ -n "$worktree_path" && -d "$worktree_path" ]]; then
      git -C "$repo" worktree remove "$worktree_path" --force 2>/dev/null || true
    fi
    return 1
  fi

  # Start the session
  aoe session start "$session_id"

  if [[ "$tool" == "opencode" ]]; then
    _delegate_opencode "$session_id" "$prompt"
  else
    _delegate_copilot "$session_id" "$prompt" "$title" || true
  fi

  # Clean up temporary copilot worktree after dispatch protocol completes
  # Note: copilot may still be running; worktree is only needed for initial checkout
  if [[ -n "$worktree_path" && -d "$worktree_path" ]]; then
    git -C "$repo" worktree remove "$worktree_path" --force 2>/dev/null || true
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

delegate_fleet() {
  # Usage: delegate_fleet <repo> <group> <json_sessions>
  # json_sessions: [{"title":"...","prompt":"...","branch":"..."},...]
  # Copilot-only. Creates isolated worktrees, batches the confirmation protocol.
  local repo="$1"
  local group="${2:-}"
  local sessions_json="$3"

  local session_count
  session_count=$(echo "$sessions_json" | jq 'length')

  if [[ "$session_count" -eq 0 ]]; then
    echo "ERROR: No sessions provided" >&2
    return 1
  fi

  local session_ids=()
  local worktree_paths=()
  local -A tmux_by_sid
  local json_indices=()  # Track original indices for prompt–session alignment

  # Phase 1: Create worktrees and aoe sessions
  for i in $(seq 0 $((session_count - 1))); do
    local title prompt branch
    {
      read -r title
      read -r branch || true
    } < <(echo "$sessions_json" | jq -r ".[$i] | .title, (.branch // empty)")
    prompt=$(echo "$sessions_json" | jq -r ".[$i].prompt")

    # Create isolated worktree
    local short_id
    short_id=$(cat /proc/sys/kernel/random/uuid 2>/dev/null | grep -oP '^[0-9a-f]{8}' || date +%s%N | sha256sum | head -c 8)
    local wt_path="/tmp/delegate-${short_id}"
    if [[ -n "$branch" ]]; then
      if ! git -C "$repo" worktree add "$wt_path" "$branch" --detach 2>/dev/null && \
         ! git -C "$repo" worktree add "$wt_path" --detach 2>/dev/null; then
        echo "ERROR: Failed to create worktree for $title" >&2
        continue
      fi
    else
      if ! git -C "$repo" worktree add "$wt_path" --detach 2>/dev/null; then
        echo "ERROR: Failed to create worktree for $title" >&2
        continue
      fi
    fi

    # Create aoe session pointing to isolated worktree
    local cmd=(aoe add "$wt_path" -t "$title" -c copilot)
    [[ -n "$group" ]] && cmd+=(-g "$group")
    cmd+=(-y)

    local add_output
    add_output=$("${cmd[@]}" 2>&1)
    local sid
    sid=$(echo "$add_output" | grep -oP '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
    if [[ -z "$sid" ]]; then
      echo "ERROR: Failed to create session for $title: $add_output" >&2
      git -C "$repo" worktree remove "$wt_path" --force 2>/dev/null || true
      continue
    fi
    worktree_paths+=("$wt_path")  # Only track on success
    session_ids+=("$sid")
    json_indices+=("$i")  # Remember which JSON index this session came from
  done

  if [[ ${#session_ids[@]} -eq 0 ]]; then
    echo "ERROR: No sessions were created successfully" >&2
    for wt in "${worktree_paths[@]}"; do
      git -C "$repo" worktree remove "$wt" --force 2>/dev/null || true
    done
    return 1
  fi

  # Phase 2: Start all sessions
  for sid in "${session_ids[@]}"; do
    aoe session start "$sid"
  done

  # Phase 3: Single shared init wait
  sleep 15

  # Phase 4: Send prompts with 1s stagger
  for i in "${!session_ids[@]}"; do
    local sid="${session_ids[$i]}"
    local ji="${json_indices[$i]}"
    local prompt
    prompt=$(echo "$sessions_json" | jq -r ".[$ji].prompt")

    aoe send "$sid" "Read this task. Do NOT execute. Confirm understanding, then I will send /delegate.

$prompt"
    sleep 1
  done

  # Phase 5: Press Enter in each tmux session (paste confirmation)
  for sid in "${session_ids[@]}"; do
    local tmux_sess
    tmux_sess=$(tmux list-sessions -F '#{session_name}' 2>/dev/null | \
      grep "^aoe_.*${sid:0:8}" | head -1)
    if [[ -n "$tmux_sess" ]]; then
      tmux send-keys -t "$tmux_sess" Enter
      tmux_by_sid["$sid"]="$tmux_sess"
    else
      echo "WARNING: Could not find tmux session for $sid" >&2
    fi
  done

  # Phase 6: Shared confirmation poll (up to 90s)
  local confirmed=()
  for _ in "${session_ids[@]}"; do confirmed+=(false); done

  for _ in $(seq 1 18); do
    sleep 5
    local all_done=true
    for i in "${!session_ids[@]}"; do
      if [[ "${confirmed[$i]}" == "true" ]]; then continue; fi
      local capture
      capture=$(aoe session capture "${session_ids[$i]}" --strip-ansi -n 50 2>/dev/null || true)
      if echo "$capture" | grep -qiE '(ready|understood|confirm|will wait)'; then
        confirmed[$i]=true
      else
        all_done=false
      fi
    done
    if [[ "$all_done" == "true" ]]; then break; fi
  done

  # Phase 7: Send /delegate to all
  for sid in "${session_ids[@]}"; do
    aoe send "$sid" "/delegate"
  done

  # Phase 8: Shared dialog wait
  sleep 8

  # Phase 9: Confirm dialog in all sessions
  for sid in "${session_ids[@]}"; do
    if [[ -n "${tmux_by_sid[$sid]:-}" ]]; then
      tmux send-keys -t "${tmux_by_sid[$sid]}" Enter
    fi
  done

  # Phase 10: Clean up worktrees (best-effort, after protocol completes)
  sleep 30
  for wt in "${worktree_paths[@]}"; do
    git -C "$repo" worktree remove "$wt" --force 2>/dev/null || true
  done

  # Return session IDs as JSON array
  printf '['
  for i in "${!session_ids[@]}"; do
    [[ $i -gt 0 ]] && printf ','
    printf '"%s"' "${session_ids[$i]}"
  done
  printf ']\n'
}
