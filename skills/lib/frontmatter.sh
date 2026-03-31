#!/usr/bin/env bash
# skills/lib/frontmatter.sh — Pure awk/sed/grep helpers for YAML frontmatter.
# Source this file to get fm_read and fm_write.
# No dependency on yq or any external YAML parser.
#
# Usage:
#   source ~/.config/opencode/skills/lib/frontmatter.sh
#   fm_read  <file> <key> [default]   # Read a frontmatter value
#   fm_write <file> <key> <value>     # Set a frontmatter value (key must exist)
#
# Note: fm_write uses GNU sed 0,/pattern/ addressing — Linux/GNU sed only.

# fm_read <file> <key> [default]
# Returns the value of <key> from the YAML frontmatter of <file>,
# or <default> (empty string if omitted) when the key is absent.
fm_read() {
	local file="$1" key="$2" default="${3:-}"
	local value
	value="$(awk '/^---$/{n++; next} n==1{print} n>=2{exit}' "$file" |
		grep "^${key}:" |
		head -1 |
		sed "s/^${key}:[[:space:]]*//")"
	# Strip surrounding quotes (single or double)
	value="$(echo "$value" | sed "s/^\([\"']\)\(.*\)\1$/\2/")"
	if [ -z "$value" ]; then
		echo "$default"
	else
		echo "$value"
	fi
}

# fm_write <file> <key> <value>
# Replaces the first occurrence of <key>: ... in <file> with <key>: <value>.
# Only modifies the frontmatter (first match = inside the --- block).
# If the key does not exist, this is a silent no-op.
fm_write() {
	local file="$1" key="$2" value="$3"
	# Replace only the first occurrence (inside frontmatter, before body)
	sed -i "0,/^${key}:.*$/s/^${key}:.*$/${key}: ${value}/" "$file"
}

# Self-test: run with `bash frontmatter.sh`
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
	tmp="$(mktemp)"
	cat >"$tmp" <<'TESTDOC'
---
status: todo
repo: owner/repo
issue: "[#1](https://github.com/owner/repo/issues/1)"
date: 2026-03-31
---

# Title
Body text with status: not-this
TESTDOC

	# Test fm_read
	assert_eq() { [[ "$1" == "$2" ]] || {
		echo "FAIL: expected '$2', got '$1'"
		exit 1
	}; }
	assert_eq "$(fm_read "$tmp" "status")" "todo"
	assert_eq "$(fm_read "$tmp" "repo")" "owner/repo"
	assert_eq "$(fm_read "$tmp" "issue")" "[#1](https://github.com/owner/repo/issues/1)"
	assert_eq "$(fm_read "$tmp" "missing" "fallback")" "fallback"

	# Test fm_write
	fm_write "$tmp" "status" "in progress"
	assert_eq "$(fm_read "$tmp" "status")" "in progress"

	# Verify body not corrupted
	grep -q "^Body text with status: not-this$" "$tmp" || {
		echo "FAIL: body corrupted"
		exit 1
	}

	rm "$tmp"
	echo "All tests passed."
fi
