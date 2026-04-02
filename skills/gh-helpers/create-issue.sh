#!/bin/bash
# create-issue.sh — Create a GitHub issue from a schema Markdown file.
#
# Usage: create-issue.sh <schema.md> <owner/repo>
#
# The script extracts the first H1 heading as the issue title and wraps the
# full file content in a <details> block per the schema-issue template.
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

tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT

cat >"$tmpfile" <<EOF
<details>
<summary>Full schema</summary>

${content}

</details>
EOF

gh issue create -R "$repo_slug" --title "$title" --body-file "$tmpfile"
