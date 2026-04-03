#!/bin/bash
# create-pr.sh — Create a GitHub pull request with body generated from commit
# history, diff stats, and an optional agent-supplied summary.
#
# Usage: create-pr.sh <owner/repo> [base-branch] [head-branch] [title] [summary]
#
# Arguments:
#   $1  owner/repo slug (required)
#   $2  base branch (default: main)
#   $3  head branch (default: current branch from git)
#   $4  PR title (optional — derived from branch name if omitted)
#   $5  Summary text (optional — agent-generated description of the work done;
#       placed in a ## Summary section at the top of the PR body)
#
# The script does NOT auto-merge, add reviewers, or set labels.
# Post-creation steps are handled by the caller separately.

set -euo pipefail

repo_slug="${1:?Usage: create-pr.sh <owner/repo> [base-branch] [head-branch] [title] [summary]}"
base="${2:-main}"
head="${3:-$(git branch --show-current)}"

if [[ -n "${4:-}" ]]; then
	title="$4"
else
	# Derive title from branch name: replace hyphens with spaces, capitalize
	# first word. Uses portable parameter expansion rather than \u escape.
	branch_words="${head//-/ }"
	first_word="${branch_words%% *}"
	rest_words="${branch_words#* }"
	if [[ "$first_word" == "$branch_words" ]]; then
		# Single-word branch name
		title="$(tr '[:lower:]' '[:upper:]' <<<"${first_word:0:1}")${first_word:1}"
	else
		capitalized="$(tr '[:lower:]' '[:upper:]' <<<"${first_word:0:1}")${first_word:1}"
		title="${capitalized} ${rest_words}"
	fi
fi

summary="${5:-}"

tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT

commits=$(git log --oneline "${base}".."${head}" 2>/dev/null || echo "(no commits ahead of ${base})")
diffstat=$(git diff --stat "${base}"..."${head}" 2>/dev/null || echo "(no diff)")

{
	if [[ -n "$summary" ]]; then
		cat <<EOF
## Summary

${summary}

EOF
	fi

	cat <<EOF
## Commits

\`\`\`
${commits}
\`\`\`

## Diff summary

\`\`\`
${diffstat}
\`\`\`
EOF
} >"$tmpfile"

gh pr create -R "$repo_slug" --base "$base" --head "$head" --title "$title" --body-file "$tmpfile"
