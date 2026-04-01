#!/usr/bin/env bash
# vault-cache/refresh.sh — Refresh GitHub metadata cache for all repos with vault content.
# Usage: bash refresh.sh [<owner>/<repo>]
#
# Requires: AGENT_VAULT set in environment, gh in PATH, jq in PATH
set -euo pipefail

vault="${AGENT_VAULT:?AGENT_VAULT is not set}"
filter="${1:-}"

# Discover all owner/repo pairs across active vault sections
declare -A repos
for section in tasks repo-notes; do
	local_dir="$vault/$section"
	[[ -d "$local_dir" ]] || continue
	for owner_dir in "$local_dir"/*/; do
		[[ -d "$owner_dir" ]] || continue
		owner="$(basename "$owner_dir")"
		[[ "$owner" == "_fleet" || "$owner" == "_activity" ]] && continue
		for repo_dir in "$owner_dir"/*/; do
			[[ -d "$repo_dir" ]] || continue
			repo="$(basename "$repo_dir")"
			repos["${owner}/${repo}"]=1
		done
	done
done

if [[ -n "$filter" ]]; then
	if [[ -z "${repos[$filter]:-}" ]]; then
		echo "No vault content found for ${filter}" >&2
		exit 1
	fi
	repos=(["$filter"]=1)
fi

echo "Refreshing cache for ${#repos[@]} repo(s)..."
mkdir -p "$vault/_misc/cache"

# Group repos by owner so we fetch project list once per owner
declare -A owners_seen

for key in "${!repos[@]}"; do
	owner="${key%%/*}"
	repo="${key#*/}"
	cache_file="$vault/_misc/cache/${owner}.json"

	echo "  ${owner}/${repo}..."

	# Initialize cache file for this owner if needed
	if [[ ! -f "$cache_file" ]]; then
		echo '{}' >"$cache_file"
	fi

	# Fetch projects for this owner (once per owner)
	if [[ -z "${owners_seen[$owner]:-}" ]]; then
		owners_seen["$owner"]=1
		echo "    fetching projects for ${owner}..."
		projects_json="$(gh project list --owner "$owner" --format json --limit 100 2>/dev/null || echo '{"projects":[]}')"
		# Merge projects into cache file
		jq --argjson projects "$projects_json" '.projects = $projects.projects' "$cache_file" >"${cache_file}.tmp" &&
			mv "${cache_file}.tmp" "$cache_file"
	fi

	# Fetch milestones for this repo
	echo "    fetching milestones for ${owner}/${repo}..."
	milestones_json="$(gh api "repos/${owner}/${repo}/milestones?state=all&per_page=100" 2>/dev/null || echo '[]')"
	jq --arg repo "$repo" --argjson milestones "$milestones_json" \
		'.repos[$repo].milestones = $milestones' "$cache_file" >"${cache_file}.tmp" &&
		mv "${cache_file}.tmp" "$cache_file"

	# Fetch labels for this repo
	echo "    fetching labels for ${owner}/${repo}..."
	labels_json="$(gh api "repos/${owner}/${repo}/labels?per_page=100" 2>/dev/null || echo '[]')"
	jq --arg repo "$repo" --argjson labels "$labels_json" \
		'.repos[$repo].labels = $labels' "$cache_file" >"${cache_file}.tmp" &&
		mv "${cache_file}.tmp" "$cache_file"
done

echo "Done. Cache files at ${vault}/_misc/cache/"
