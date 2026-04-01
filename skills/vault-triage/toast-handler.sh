#!/usr/bin/env bash
# vault-triage/toast-handler.sh — Cross-platform toast notification handler.
# Called by ntfy subscribe as the command for incoming notifications.
# Receives ntfy environment variables: NTFY_TOPIC, NTFY_TITLE, NTFY_MESSAGE,
# NTFY_PRIORITY, NTFY_TAGS, NTFY_RAW (full JSON payload).
#
# Extracts icon URL from the JSON payload, maps to a local icon file,
# and dispatches to the platform-appropriate notification mechanism.
#
# Usage: toast-handler.sh (called by ntfy subscribe, not directly)
set -euo pipefail

title="${NTFY_TITLE:-Notification}"
message="${NTFY_MESSAGE:-}"
raw="${NTFY_RAW:-}"

# ── Extract icon URL from JSON payload ──────────────────────────────
icon_url=""
icon_local=""
if [[ -n "$raw" ]]; then
	if command -v jq &>/dev/null; then
		icon_url="$(echo "$raw" | jq -r '.icon // empty' 2>/dev/null || true)"
	else
		# Fallback: grep for icon field in JSON — use sed for POSIX portability (macOS lacks -P)
		icon_url="$(echo "$raw" | sed -n 's/.*"icon"\s*:\s*"\([^"]*\)".*/\1/p' 2>/dev/null || true)"
	fi
fi

# ── Map icon URL to local file ──────────────────────────────────────
config_dir="${HOME}/.config/opencode"
if [[ -n "$icon_url" ]]; then
	icon_filename="${icon_url##*/}" # e.g. "planner.png"
	# Allowlist: only accept the 9 known icon filenames to prevent path traversal
	case "$icon_filename" in
	implementor.png | auditor.png | reviewer.png | planner.png | designer.png | \
		project-manager.png | build.png | plan.png | default.png)
		icon_local="${config_dir}/images/${icon_filename}"
		if [[ ! -f "$icon_local" ]]; then
			icon_local="" # File not found — proceed without icon
		fi
		;;
	*)
		icon_local="" # Unknown filename — proceed without icon
		;;
	esac
fi

# ── Platform detection ──────────────────────────────────────────────
detect_platform() {
	if [[ "$(uname -s)" == "Darwin" ]]; then
		echo "macos"
	elif [[ -f /proc/version ]] && grep -qi "microsoft" /proc/version; then
		echo "wsl"
	else
		echo "linux"
	fi
}

platform="$(detect_platform)"

# ── Dispatch to platform notification ───────────────────────────────
case "$platform" in
wsl)
	# Find PowerShell
	if pwsh_path="$(command -v pwsh.exe 2>/dev/null)"; then
		:
	elif pwsh_path="$(command -v powershell.exe 2>/dev/null)"; then
		:
	else
		pwsh_path="/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
	fi
	# Escape single quotes in title and message for PowerShell
	# Strip newlines and carriage returns to prevent single-quoted string boundary injection
	ps_title="${title//\'/\'\'}"
	ps_title="${ps_title//$'\n'/ }"
	ps_title="${ps_title//$'\r'/ }"
	ps_message="${message//\'/\'\'}"
	ps_message="${ps_message//$'\n'/ }"
	ps_message="${ps_message//$'\r'/ }"
	if [[ -n "$icon_local" ]]; then
		# Convert WSL path to Windows path for BurntToast
		win_path="$(wslpath -w "$icon_local" 2>/dev/null || true)"
		if [[ -n "$win_path" ]]; then
			ps_path="${win_path//\'/\'\'}"
			"$pwsh_path" -Command "New-BurntToastNotification -Text '${ps_title}', '${ps_message}' -AppLogo '${ps_path}'" 2>/dev/null || true
		else
			# wslpath failed — toast without icon
			"$pwsh_path" -Command "New-BurntToastNotification -Text '${ps_title}', '${ps_message}'" 2>/dev/null || true
		fi
	else
		# No icon — basic toast
		"$pwsh_path" -Command "New-BurntToastNotification -Text '${ps_title}', '${ps_message}'" 2>/dev/null || true
	fi
	;;

linux)
	if [[ -n "$icon_local" ]]; then
		notify-send --icon="$icon_local" "$title" "$message" 2>/dev/null || true
	else
		notify-send "$title" "$message" 2>/dev/null || true
	fi
	;;

macos)
	# osascript display notification does not support custom icons.
	# Escape backslashes and double-quotes to prevent AppleScript injection.
	safe_title="${title//\\/\\\\}"
	safe_title="${safe_title//\"/\\\"}"
	safe_message="${message//\\/\\\\}"
	safe_message="${safe_message//\"/\\\"}"
	osascript -e "display notification \"${safe_message}\" with title \"${safe_title}\"" 2>/dev/null || true
	;;
esac
