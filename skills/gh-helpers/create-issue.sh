#!/bin/bash
# create-issue.sh — Create a GitHub issue from a schema Markdown file.
#
# Usage: create-issue.sh <schema.md> <owner/repo>
#
# The script extracts the first H1 heading as the issue title. The issue body
# contains the "## Problem" section (if present) as a visible summary, followed
# by the full schema content wrapped in a <details> block. If no "## Problem"
# section is found, the body is just the <details> block.
#
# Post-creation steps (project board, milestone, labels, frontmatter update)
# are handled by the caller separately.

set -euo pipefail

schema_file="${1:?Usage: create-issue.sh <schema.md> <owner/repo>}"
repo_slug="${2:?Usage: create-issue.sh <schema.md> <owner/repo>}"

[[ -f "$schema_file" ]] || {
	echo "Error: file not found: $schema_file" >&2
	exit 1
}

title=$(grep -m1 '^# ' "$schema_file" | sed 's/^# //')
[[ -n "$title" ]] || {
	echo "Error: no H1 heading found in $schema_file" >&2
	exit 1
}

content=$(<"$schema_file")

# Extract the "## Problem" section: everything from "## Problem" up to the
# next H2 heading (or end of file). Trim leading/trailing blank lines.
problem=""
if grep -qn '^## Problem' "$schema_file"; then
	problem=$(awk '
		/^## Problem/ { found=1; next }
		found && /^## / { exit }
		found { print }
	' "$schema_file" | sed -e '/./,$!d' -e :a -e '/^\n*$/{$d;N;ba;}')
fi

tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT

{
	if [[ -n "$problem" ]]; then
		printf '%s\n\n' "$problem"
	fi
	cat <<EOF
<details>
<summary>Full schema</summary>

${content}

</details>
EOF
} >"$tmpfile"

gh issue create -R "$repo_slug" --title "$title" --body-file "$tmpfile"
