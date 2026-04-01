#!/usr/bin/env bash
# vault-triage/notify.sh — Notification helper for agents.
# Source this file to get the notify_triage function.
# Usage: source ~/.config/opencode/skills/vault-triage/notify.sh
#        notify_triage <type> <task> <headline> [body] [file] [icon] [emoji]
#
# Parameters:
#   type     — triage type (activity, escalation, design-question, handoff, run-summary)
#   task     — owner/repo/task path (task name extracted for notification title)
#   headline — short action phrase for the notification title (e.g. "Commit Group 1 Finished")
#   body     — optional bullet-point detail text for the notification body
#   file     — vault-relative path to the triage file (default: tasks/<task>/triage.md)
#              used to compute the Obsidian click URL
#   icon     — icon name without extension (optional; e.g. "planner", "reviewer")
#              maps to https://raw.githubusercontent.com/ada-x64/opencode-config/main/images/<icon>.png
#              if omitted, defaults to "default"
#   emoji    — optional emoji prefix for notification title (e.g. "⚙️📋", "🔴")
#              if omitted, derived from triage type (❗ escalation, ❓ design-question, 📋 others)
#              agents pass combined emojis for variants: "⚙️📋" (auto activity), "⚙️🟢" (auto clean audit)
#
# Requires: AGENT_VAULT (for topic file fallback and Obsidian URI)
# Optional: NTFY_TOPIC env var or $AGENT_VAULT/_misc/cache/ntfy-topic.txt

notify_triage() {
	local type="${1:-}" task="${2:-}" headline="${3:-}" body="${4:-}" file="${5:-}" icon="${6:-}" emoji="${7:-}"
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

	# Icon URL construction
	local icon_base_url="https://raw.githubusercontent.com/ada-x64/opencode-config/main/images"
	if [[ -z "$icon" ]]; then
		icon="default"
	fi
	local icon_url="${icon_base_url}/${icon}.png"

	# Emoji + title construction
	local emoji_prefix="$emoji"
	if [[ -z "$emoji_prefix" ]]; then
		case "$type" in
		escalation) emoji_prefix="❗" ;;
		design-question) emoji_prefix="❓" ;;
		*) emoji_prefix="📋" ;;
		esac
	fi
	local task_name="${task##*/}"
	local full_title="${emoji_prefix} [${task_name}]${headline:+ ${headline}}"

	# Sanitize values to prevent HTTP header injection via curl
	full_title="${full_title//$'\n'/ }"
	icon_url="${icon_url//$'\n'/ }"

	# Backward compat: if body is empty (old callers pass nothing for $4),
	# use headline as the notification body so the message body isn't blank.
	local notify_body="${body:-$headline}"

	# Resolve topic
	local topic="${NTFY_TOPIC:-}"
	if [[ -z "$topic" && -n "${AGENT_VAULT:-}" && -f "${AGENT_VAULT}/_misc/cache/ntfy-topic.txt" ]]; then
		topic="$(cat "${AGENT_VAULT}/_misc/cache/ntfy-topic.txt")"
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
		ntfy publish --priority="$priority" --title="$full_title" --tags="$tag" \
			--icon="$icon_url" "${ntfy_click[@]}" "$topic" "$notify_body" 2>/dev/null || true
	elif command -v curl &>/dev/null; then
		curl -sL \
			-H "Title: $full_title" \
			-H "Priority: $priority" \
			-H "Tags: $tag" \
			-H "Icon: $icon_url" \
			"${curl_click[@]}" \
			-d "$notify_body" \
			"https://ntfy.sh/$topic" >/dev/null 2>&1 || true
	fi
	# If neither ntfy nor curl is available, silently do nothing
	return 0
}
