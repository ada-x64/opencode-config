#!/usr/bin/env bash
# vault-triage/triage-resolve.sh — Mark a triage entry as addressed or dismissed.
# Usage: bash triage-resolve.sh <file> [addressed|dismissed]
#
# Updates the 'status' field in the triage entry's YAML frontmatter.
# Defaults to 'addressed' if no status is given.
#
# Examples:
#   bash triage-resolve.sh "$AGENT_VAULT/_misc/triage/2026-04-01T14-30-00.md"
#   bash triage-resolve.sh "$AGENT_VAULT/_misc/triage/2026-04-01T14-30-00.md" dismissed
#
# After resolving, regenerate the dashboard:
#   bash triage-dashboard.sh
#
# Requires: AGENT_VAULT set in environment (for path validation)
set -euo pipefail

# shellcheck source=../lib/frontmatter.sh
_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${_SCRIPT_DIR}/../lib/frontmatter.sh"

file="${1:?Usage: triage-resolve.sh <file> [addressed|dismissed]}"
new_status="${2:-addressed}"

# Validate status
case "$new_status" in
addressed | dismissed) ;;
*)
	echo "Error: status must be 'addressed' or 'dismissed', got '$new_status'" >&2
	exit 1
	;;
esac

# Validate file exists
if [[ ! -f "$file" ]]; then
	echo "Error: file not found: $file" >&2
	exit 1
fi

# Read current status
current="$(fm_read "$file" "status" "unknown")"
if [[ "$current" == "$new_status" ]]; then
	echo "Already $new_status: $file"
	exit 0
fi

# Update status
fm_write "$file" "status" "$new_status"
echo "$current -> $new_status: $file"
