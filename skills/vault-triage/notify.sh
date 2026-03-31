#!/usr/bin/env bash
# vault-triage/notify.sh — Notification helper for agents.
# Source this file to get the notify_triage function.
# Usage: source ~/.config/opencode/skills/vault-triage/notify.sh
#        notify_triage <type> <task> <body> [file]
#
# Parameters:
#   type  — triage type (activity, escalation, design-question, handoff, run-summary)
#   task  — owner/repo/task path (used in notification title and click URL)
#   body  — notification body text
#   file  — vault-relative path to the triage file (default: tasks/<task>/triage.md)
#           used to compute the Obsidian click URL
#
# Requires: AGENT_VAULT (for topic file fallback and Obsidian URI)
# Optional: NTFY_TOPIC env var or $AGENT_VAULT/cache/ntfy-topic.txt

notify_triage() {
	local type="${1:-}" task="${2:-}" body="${3:-}" file="${4:-}"
	local priority="default"
	local tag="information_source"

	# Default file path when not provided.
	# NOTE: agents writing triage-2.md, triage-3.md etc. must pass the file arg
	# explicitly for the click URL to point to the correct file.
	[[ -z "$file" ]] && file="tasks/${task}/triage.md"

	case "$type" in
	escalation)
		priority="high"
		tag="rotating_light"
		;;
	design-question)
		priority="high"
		tag="question"
		;;
	activity)
		priority="default"
		tag="hammer_and_wrench"
		;;
	handoff)
		priority="default"
		tag="handshake"
		;;
	run-summary)
		priority="low"
		tag="memo"
		;;
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

	# Compute Obsidian click URL (vault-relative file path without .md extension)
	local vault_name click_url
	vault_name="$(basename "${AGENT_VAULT:-}")"
	click_url=""
	if [[ -n "$vault_name" ]]; then
		local file_no_ext="${file%.md}"
		click_url="obsidian://open?vault=${vault_name}&file=${file_no_ext}"
	fi

	# Send notification — fail silently, never block agent work
	local -a ntfy_click=() curl_click=()
	if [[ -n "$click_url" ]]; then
		ntfy_click=(--click="$click_url")
		curl_click=(-H "Click: $click_url")
	fi

	if command -v ntfy &>/dev/null; then
		ntfy publish --priority="$priority" --title="[$type] $task" --tags="$tag" \
			"${ntfy_click[@]}" "$topic" "$body" 2>/dev/null || true
	elif command -v curl &>/dev/null; then
		curl -sL \
			-H "Title: [$type] $task" \
			-H "Priority: $priority" \
			-H "Tags: $tag" \
			"${curl_click[@]}" \
			-d "$body" \
			"https://ntfy.sh/$topic" >/dev/null 2>&1 || true
	fi
	# If neither ntfy nor curl is available, silently do nothing
	return 0
}
