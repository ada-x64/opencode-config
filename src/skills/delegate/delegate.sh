#!/usr/bin/env bash
# delegate.sh — spawn AoE sessions for parallel agent work
set -euo pipefail

# --- Copilot protocol primitives ---

_copilot_send_prompt() {
  local sid="$1"
  local prompt="$2"
  aoe send "$sid" "Read this task. Do NOT execute. Confirm understanding, then I will send /delegate.

$prompt"
}

_copilot_find_tmux() {
  local sid="$1"
  tmux list-sessions -F '#{session_name}' 2>/dev/null |
    grep "^aoe_.*${sid:0:8}" | head -1
}

_copilot_check_confirmed() {
  local sid="$1"
  local capture
  capture=$(aoe session capture "$sid" --strip-ansi -n 50 2>/dev/null || true)
  echo "$capture" | grep -qiE '(ready|understood|confirm|will wait)'
}

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
    worktree_path=$(mktemp -u /tmp/delegate-XXXXXXXX)
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

  _copilot_send_prompt "$session_id" "$prompt"
  sleep 2

  local tmux_session
  tmux_session=$(_copilot_find_tmux "$session_id")
  if [[ -z "$tmux_session" ]]; then
    echo "WARNING: Could not find tmux session for $session_id" >&2
    return 1
  fi
  tmux send-keys -t "$tmux_session" Enter

  # Poll for confirmation (up to 90s, check every 5s)
  local confirmed=false
  for _ in $(seq 1 18); do
    sleep 5
    if _copilot_check_confirmed "$session_id"; then
      confirmed=true
      break
    fi
  done

  if [[ "$confirmed" != "true" ]]; then
    echo "WARNING: Copilot did not confirm within 90s" >&2
  fi

  aoe send "$session_id" "/delegate"
  sleep 5
  tmux send-keys -t "$tmux_session" Enter
}

# --- Fleet helpers ---

_fleet_create_sessions() {
	local repo="$1"
	local group="$2"
	local sessions_json="$3"
	local -n _sids=$4        # nameref to session_ids array
	local -n _wtpaths=$5     # nameref to worktree_paths array
	local -n _jindices=$6    # nameref to json_indices array

	local session_count
	session_count=$(echo "$sessions_json" | jq 'length')

	for i in $(seq 0 $((session_count - 1))); do
		local title branch
		{
			read -r title
			read -r branch || true
		} < <(echo "$sessions_json" | jq -r ".[$i] | .title, (.branch // empty)")

		# Create isolated worktree
		local wt_path
		wt_path=$(mktemp -u /tmp/delegate-XXXXXXXX)
		if [[ -n "$branch" ]]; then
			if ! git -C "$repo" worktree add "$wt_path" "$branch" --detach 2>/dev/null &&
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

		local cmd=(aoe add "$wt_path" -t "$title" -c copilot)
		[[ -n "$group" ]] && cmd+=(-g "$group")
		cmd+=(-y)

		local add_output sid
		add_output=$("${cmd[@]}" 2>&1)
		sid=$(echo "$add_output" | grep -oP '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
		if [[ -z "$sid" ]]; then
			echo "ERROR: Failed to create session for $title: $add_output" >&2
			git -C "$repo" worktree remove "$wt_path" --force 2>/dev/null || true
			continue
		fi
		_wtpaths+=("$wt_path")
		_sids+=("$sid")
		_jindices+=("$i")
	done
}

_fleet_run_protocol() {
	local sessions_json="$1"
	shift
	local -a session_ids=()
	local -a json_indices=()

	# Parse session_ids and json_indices from remaining args
	# Format: sid1 sid2 ... -- ji1 ji2 ...
	local parsing_sids=true
	for arg in "$@"; do
		if [[ "$arg" == "--" ]]; then
			parsing_sids=false
			continue
		fi
		if [[ "$parsing_sids" == "true" ]]; then
			session_ids+=("$arg")
		else
			json_indices+=("$arg")
		fi
	done

	local -A tmux_by_sid

	# Start all sessions
	for sid in "${session_ids[@]}"; do
		aoe session start "$sid"
	done

	# Shared init wait
	sleep 15

	# Send prompts with 1s stagger
	for i in "${!session_ids[@]}"; do
		local sid="${session_ids[$i]}"
		local ji="${json_indices[$i]}"
		local prompt
		prompt=$(echo "$sessions_json" | jq -r ".[$ji].prompt")
		_copilot_send_prompt "$sid" "$prompt"
		sleep 1
	done

	# Press Enter in each tmux session
	for sid in "${session_ids[@]}"; do
		local tmux_sess
		tmux_sess=$(_copilot_find_tmux "$sid")
		if [[ -n "$tmux_sess" ]]; then
			tmux send-keys -t "$tmux_sess" Enter
			tmux_by_sid["$sid"]="$tmux_sess"
		else
			echo "WARNING: Could not find tmux session for $sid" >&2
		fi
	done

	# Shared confirmation poll (up to 90s)
	local confirmed=()
	for _ in "${session_ids[@]}"; do confirmed+=(false); done

	local all_done
	for _ in $(seq 1 18); do
		sleep 5
		all_done=true
		for i in "${!session_ids[@]}"; do
			if [[ "${confirmed[$i]}" == "true" ]]; then continue; fi
			if _copilot_check_confirmed "${session_ids[$i]}"; then
				confirmed[$i]=true
			else
				all_done=false
			fi
		done
		if [[ "$all_done" == "true" ]]; then break; fi
	done

	# Send /delegate to all
	for sid in "${session_ids[@]}"; do
		aoe send "$sid" "/delegate"
	done

	# Shared dialog wait
	sleep 8

	# Confirm dialog in all sessions
	for sid in "${session_ids[@]}"; do
		if [[ -n "${tmux_by_sid[$sid]:-}" ]]; then
			tmux send-keys -t "${tmux_by_sid[$sid]}" Enter
		fi
	done
}

_fleet_cleanup() {
	local repo="$1"
	shift
	local -a worktree_paths=("$@")

	sleep 30  # Allow time for copilot post-handoff git operations
	for wt in "${worktree_paths[@]}"; do
		git -C "$repo" worktree remove "$wt" --force 2>/dev/null || true
	done
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

	local -a session_ids=()
	local -a worktree_paths=()
	local -a json_indices=()

	_fleet_create_sessions "$repo" "$group" "$sessions_json" \
		session_ids worktree_paths json_indices

	if [[ ${#session_ids[@]} -eq 0 ]]; then
		echo "ERROR: No sessions were created successfully" >&2
		for wt in "${worktree_paths[@]}"; do
			git -C "$repo" worktree remove "$wt" --force 2>/dev/null || true
		done
		return 1
	fi

	_fleet_run_protocol "$sessions_json" \
		"${session_ids[@]}" -- "${json_indices[@]}"

	_fleet_cleanup "$repo" "${worktree_paths[@]}"

	# Return session IDs as JSON array
	printf '['
	for i in "${!session_ids[@]}"; do
		[[ $i -gt 0 ]] && printf ','
		printf '"%s"' "${session_ids[$i]}"
	done
	printf ']\n'
}
