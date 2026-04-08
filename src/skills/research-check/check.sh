#!/usr/bin/env bash
# skills/research-check/check.sh — Check repo-notes freshness.
# Usage: bash check.sh <owner>/<repo> <repo-path>
#
# Reads provenance frontmatter from all repo-notes for the given repo,
# compares commit SHA against HEAD, checks web-source age, and outputs
# a structured freshness report.

set -euo pipefail

# Inline frontmatter reader — extracts a scalar value from YAML frontmatter.
# Usage: fm_read <file> <key> [default]
fm_read() {
	local file="$1" key="$2" default="${3:-}"
	awk -v key="$key" -v default="$default" '
        NR==1 && /^---$/ { in_fm=1; next }
        in_fm && /^---$/ { exit }
        in_fm && $0 ~ "^" key ":" {
            val = substr($0, length(key)+2)
            gsub(/^[[:space:]]+/, "", val)
            gsub(/^["'"'"']|["'"'"']$/, "", val)
            print val
            found=1
            exit
        }
        END { if (!found) print default }
    ' "$file"
}

owner_repo="${1:?Usage: check.sh <owner/repo> <repo-path>}"
repo_path="${2:?Usage: check.sh <owner/repo> <repo-path>}"

VAULT="${AGENT_VAULT:?AGENT_VAULT must be set}"
notes_dir="$VAULT/notes/$owner_repo"

# Get current HEAD
if [[ -d "$repo_path/.git" ]] || git -C "$repo_path" rev-parse --git-dir &>/dev/null; then
	head_sha="$(git -C "$repo_path" rev-parse HEAD 2>/dev/null)" || {
		echo "ERROR: Could not read HEAD from $repo_path"
		exit 1
	}
else
	echo "ERROR: $repo_path is not a git repository"
	exit 1
fi

today_epoch="$(date +%s)"
seven_days=$((7 * 86400))

# Check if notes directory exists
if [[ ! -d "$notes_dir" ]]; then
	echo "STATUS: missing"
	echo "  No repo-notes directory found at: $notes_dir"
	echo ""
	echo "SUMMARY: 0 notes found, 0 fresh, 0 stale, 1 missing (no notes directory)"
	exit 0
fi

# Find all markdown files
mapfile -t notes < <(find "$notes_dir" -name "*.md" -type f | sort)

if [[ ${#notes[@]} -eq 0 ]]; then
	echo "STATUS: missing"
	echo "  Notes directory exists but contains no .md files: $notes_dir"
	echo ""
	echo "SUMMARY: 0 notes found, 0 fresh, 0 stale, 1 missing (empty directory)"
	exit 0
fi

fresh=0
stale_commit=0
stale_web=0
total=${#notes[@]}

echo "REPO: $owner_repo"
echo "HEAD: $head_sha"
echo "NOTES_DIR: $notes_dir"
echo ""

for note in "${notes[@]}"; do
	name="$(basename "$note")"
	commit="$(fm_read "$note" "commit" "")"
	date_str="$(fm_read "$note" "date" "")"
	# Read sources — extract the list items from the YAML frontmatter
	sources="$(awk '/^---$/{n++; next} n==1{print} n>=2{exit}' "$note" |
		awk '/^sources:/{found=1; next} found && /^  - /{print $2; next} found{exit}')"
	has_web=false
	if echo "$sources" | grep -q "^web$"; then
		has_web=true
	fi

	# Determine freshness
	status="fresh"
	reason=""

	if [[ -z "$commit" ]]; then
		status="stale"
		reason="no commit SHA in frontmatter"
	elif [[ "$commit" != "$head_sha" ]]; then
		status="stale"
		reason="commit-drift (note: ${commit:0:8}… ≠ HEAD: ${head_sha:0:8}…)"
	fi

	if [[ "$has_web" == true && -n "$date_str" ]]; then
		# Parse date to epoch (YYYY-MM-DD format)
		note_epoch="$(date -d "$date_str" +%s 2>/dev/null)" || note_epoch=0
		age=$((today_epoch - note_epoch))
		if ((age > seven_days)); then
			if [[ "$status" == "fresh" ]]; then
				status="stale"
				reason="web-age (${date_str}, $((age / 86400)) days old)"
			else
				reason="$reason + web-age (${date_str}, $((age / 86400)) days old)"
			fi
		fi
	fi

	if [[ "$status" == "fresh" ]]; then
		echo "  FRESH: $name"
		((fresh++))
	else
		echo "  STALE: $name — $reason"
		if [[ "$reason" == *"commit-drift"* ]]; then
			((stale_commit++))
		fi
		if [[ "$reason" == *"web-age"* ]]; then
			((stale_web++))
		fi
	fi
done

echo ""
echo "SUMMARY: $total notes found, $fresh fresh, $((total - fresh)) stale"
if ((stale_commit > 0)); then
	echo "  commit-drift: $stale_commit"
fi
if ((stale_web > 0)); then
	echo "  web-age: $stale_web"
fi
