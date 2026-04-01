#!/usr/bin/env bash
# vault-gc/gc.sh — Archive completed tasks.
# A task is complete if its schema status is "complete" OR its linked GitHub issue is closed.
# Usage: bash gc.sh [--dry-run]
#
# Requires: AGENT_VAULT set in environment, gh in PATH
set -euo pipefail

# shellcheck source=../lib/frontmatter.sh
_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${_SCRIPT_DIR}/../lib/frontmatter.sh"

vault="${AGENT_VAULT:?AGENT_VAULT is not set}"
dry_run=false
[[ "${1:-}" == "--dry-run" ]] && dry_run=true

archived=0 skipped=0 no_signal=0

# Helper to safely increment counters under set -e
inc() { eval "$1=\$(( $1 + 1 ))"; }

archive_task() {
	local owner="$1" repo="$2" task="$3" reason="$4"
	local src="$vault/tasks/$owner/$repo/$task"
	local dst="$vault/_misc/archive/tasks/$owner/$repo/$task"
	echo "Archiving: ${owner}/${repo}/${task} (${reason})"
	if $dry_run; then
		echo "  would move: tasks/$owner/$repo/$task/ → _misc/archive/tasks/$owner/$repo/$task/"
	else
		mkdir -p "$(dirname "$dst")"
		mv "$src" "$dst"
		echo "  moved: tasks/$owner/$repo/$task/"
	fi
}

for schematic in "$vault"/tasks/*/*/*/schema.md; do
	[[ -f "$schematic" ]] || continue
	# Skip fleet schemas
	[[ "$schematic" == *"/_fleet/"* ]] && continue

	task_dir="$(dirname "$schematic")"
	task="$(basename "$task_dir")"
	rel="${task_dir#${vault}/tasks/}"
	owner="${rel%%/*}"
	rel_rest="${rel#*/}"
	repo="${rel_rest%%/*}"

	should_archive=false
	reason=""

	# Check 1: Status frontmatter field
	status_val="$(fm_read "$schematic" "status" "")"
	if [[ "$status_val" == "complete" ]]; then
		should_archive=true
		reason="status: complete"
	fi

	# Check 2: Issue link (only if not already marked for archival)
	if ! $should_archive; then
		issue_val="$(fm_read "$schematic" "issue" "")"
		if [[ -n "$issue_val" ]]; then
			issue_num="$(echo "$issue_val" | grep -oP '#\K\d+' || true)"
			issue_owner="$(echo "$issue_val" | grep -oP 'github\.com/\K[^/]+' || true)"
			issue_repo="$(echo "$issue_val" | grep -oP 'github\.com/[^/]+/\K[^/]+' || true)"

			if [[ -n "$issue_num" && -n "$issue_owner" && -n "$issue_repo" ]]; then
				state="$(gh api "repos/${issue_owner}/${issue_repo}/issues/${issue_num}" --jq '.state' 2>/dev/null || echo "unknown")"
				if [[ "$state" == "closed" ]]; then
					should_archive=true
					reason="issue #${issue_num} is closed"
				else
					inc skipped
					continue
				fi
			else
				# Issue field present but not a valid link
				inc no_signal
				continue
			fi
		else
			# No issue link and status is not complete — nothing to signal completion
			inc no_signal
			continue
		fi
	fi

	if $should_archive; then
		archive_task "$owner" "$repo" "$task" "$reason"
		inc archived
	fi
done

echo ""
echo "Summary: ${archived} archived, ${skipped} still open, ${no_signal} without issue or status"
