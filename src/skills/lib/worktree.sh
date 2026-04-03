#!/usr/bin/env bash
# skills/lib/worktree.sh — Helpers for bare-repo / worktree detection and branching.
# Source this file to get wt_detect, wt_owner_repo, wt_switch_branch, wt_cleanup.
#
# Usage:
#   source ~/.config/opencode/skills/lib/worktree.sh
#   wt_detect         <path>                # Print repo type: clone | worktree | bare | unknown
#   wt_owner_repo     <path>                # Print <owner>/<repo> (2 components after $AGENT_REPOS)
#   wt_switch_branch  <repo_path> <branch>  # Switch/create branch; print the working path
#   wt_cleanup        <worktree_path>       # Remove a worktree (best-effort, never fails)
#
# Requires: git, AGENT_REPOS environment variable (for wt_owner_repo).

# wt_detect <path>
# Prints the repo type: "clone", "worktree", "bare", or "unknown".
# - clone:    .git/ is a directory (traditional git clone)
# - worktree: .git is a file (gitdir pointer — part of a bare repo + worktree setup)
# - bare:     path itself is a bare repo (has HEAD but no .git entry)
# - unknown:  not a recognisable git repository
wt_detect() {
	local path="$1"
	if [[ -z "$path" ]]; then
		echo "unknown"
		return 1
	fi
	if [[ -d "$path/.git" ]]; then
		echo "clone"
	elif [[ -f "$path/.git" ]]; then
		echo "worktree"
	elif [[ -f "$path/HEAD" && -d "$path/refs" ]]; then
		echo "bare"
	else
		echo "unknown"
		return 1
	fi
}

# wt_owner_repo <path>
# Prints <owner>/<repo> by taking the first two path components after
# $AGENT_REPOS. Works correctly for both traditional clones and worktrees:
#   $AGENT_REPOS/ada-x64/opencode-config           -> ada-x64/opencode-config
#   $AGENT_REPOS/ada-x64/opencode-config/main      -> ada-x64/opencode-config
#   $AGENT_REPOS/ada-x64/opencode-config/feat/foo  -> ada-x64/opencode-config
wt_owner_repo() {
	local path="$1"
	local repos="${AGENT_REPOS:?AGENT_REPOS must be set}"

	# Resolve to absolute (allow missing trailing components for worktree paths
	# that may not exist yet), strip $AGENT_REPOS prefix and leading slash
	local rel
	rel="$(realpath -m "$path" | sed "s|^${repos}/*||")"

	# Take only the first two components: <owner>/<repo>
	local owner repo
	owner="$(echo "$rel" | cut -d/ -f1)"
	repo="$(echo "$rel" | cut -d/ -f2)"

	if [[ -z "$owner" || -z "$repo" ]]; then
		echo "wt_owner_repo: cannot derive owner/repo from '$path'" >&2
		return 1
	fi
	echo "${owner}/${repo}"
}

# _wt_bare_root <worktree_path>
# Internal helper. Given a worktree path, prints the bare repo root directory.
# The bare repo root is the parent of the .bare/ directory.
_wt_bare_root() {
	local wt_path="$1"
	local common_dir
	common_dir="$(git -C "$wt_path" rev-parse --git-common-dir 2>/dev/null)"
	if [[ -z "$common_dir" ]]; then
		echo "_wt_bare_root: cannot determine bare root for '$wt_path'" >&2
		return 1
	fi
	# common_dir is absolute or relative; resolve it, then strip /.bare suffix
	local abs_common
	abs_common="$(cd "$wt_path" && realpath "$common_dir")"
	# The common dir IS the .bare directory; its parent is the repo root
	dirname "$abs_common"
}

# wt_switch_branch <repo_path> <branch>
# Switches to <branch> in a repo-type-aware way and prints the working directory
# path that should be used for all subsequent operations.
#
# - clone:    runs `git switch -c <branch>` (or switch if it exists); prints <repo_path>
# - worktree: creates a new worktree at <bare_root>/<branch>; prints the new worktree path
#
# Caller should reassign: repo_path="$(wt_switch_branch "$repo_path" "$branch")"
wt_switch_branch() {
	local repo_path="$1"
	local branch="$2"
	local repo_type
	repo_type="$(wt_detect "$repo_path")"

	case "$repo_type" in
	worktree | bare)
		local current_branch
		current_branch="$(git -C "$repo_path" branch --show-current 2>/dev/null)"

		# Already on the right branch — just print the current path
		if [[ "$current_branch" == "$branch" ]]; then
			echo "$repo_path"
			return 0
		fi

		local bare_root
		bare_root="$(_wt_bare_root "$repo_path")"
		if [[ -z "$bare_root" ]]; then
			echo "wt_switch_branch: cannot find bare root" >&2
			return 1
		fi

		local new_wt="$bare_root/$branch"

		# If the worktree already exists, just print its path
		if [[ -d "$new_wt" ]]; then
			echo "$new_wt"
			return 0
		fi

		# Create the worktree — try creating the branch first, fall back to existing
		if git -C "$repo_path" worktree add "$new_wt" -b "$branch" >/dev/null 2>&1; then
			echo "$new_wt"
		elif git -C "$repo_path" worktree add "$new_wt" "$branch" >/dev/null 2>&1; then
			echo "$new_wt"
		else
			echo "wt_switch_branch: failed to create worktree at '$new_wt' for branch '$branch'" >&2
			return 1
		fi
		;;
	clone)
		# Traditional clone — use git switch
		git -C "$repo_path" switch -c "$branch" 2>/dev/null ||
			git -C "$repo_path" switch "$branch" ||
			{
				echo "wt_switch_branch: failed to switch to branch '$branch'" >&2
				return 1
			}
		echo "$repo_path"
		;;
	*)
		echo "wt_switch_branch: '$repo_path' is not a recognised git repository" >&2
		return 1
		;;
	esac
}

# wt_cleanup <worktree_path>
# Removes a worktree. Best-effort — never fails the caller's workflow.
# Only operates on actual worktrees (not clones or bare roots).
wt_cleanup() {
	local wt_path="$1"
	local repo_type
	repo_type="$(wt_detect "$wt_path")"

	if [[ "$repo_type" != "worktree" ]]; then
		echo "wt_cleanup: '$wt_path' is not a worktree (type: $repo_type) — skipping" >&2
		return 0
	fi

	git -C "$wt_path" worktree remove "$wt_path" 2>/dev/null || {
		echo "wt_cleanup: could not remove worktree at '$wt_path' — manual cleanup may be needed" >&2
	}
	return 0
}

# ---------------------------------------------------------------------------
# Self-test: run with `bash worktree.sh`
# ---------------------------------------------------------------------------
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
	set -euo pipefail

	assert_eq() {
		if [[ "$1" != "$2" ]]; then
			echo "FAIL: expected '$2', got '$1'" >&2
			exit 1
		fi
	}

	tmpdir="$(mktemp -d)"
	trap 'rm -rf "$tmpdir"' EXIT

	echo "--- Test: wt_detect on traditional clone ---"
	git init "$tmpdir/clone-repo" >/dev/null 2>&1
	(cd "$tmpdir/clone-repo" && git commit --allow-empty -m "init" >/dev/null 2>&1)
	assert_eq "$(wt_detect "$tmpdir/clone-repo")" "clone"

	echo "--- Test: wt_detect on bare repo ---"
	git init --bare "$tmpdir/bare-test.git" >/dev/null 2>&1
	assert_eq "$(wt_detect "$tmpdir/bare-test.git")" "bare"

	echo "--- Test: wt_detect on unknown path ---"
	mkdir -p "$tmpdir/not-a-repo"
	assert_eq "$(wt_detect "$tmpdir/not-a-repo")" "unknown"

	echo "--- Test: wt_owner_repo ---"
	export AGENT_REPOS="$tmpdir/repos"
	mkdir -p "$tmpdir/repos/owner/repo/main"
	assert_eq "$(wt_owner_repo "$tmpdir/repos/owner/repo")" "owner/repo"
	assert_eq "$(wt_owner_repo "$tmpdir/repos/owner/repo/main")" "owner/repo"
	assert_eq "$(wt_owner_repo "$tmpdir/repos/owner/repo/feat/foo")" "owner/repo"

	echo "--- Test: wt_detect on worktree ---"
	# Set up a bare repo with worktrees, mimicking the real layout:
	#   testrepo/.bare/   (bare git repo)
	#   testrepo/.git     (file: "gitdir: .bare")
	#   testrepo/main/    (worktree checked out to main)
	bare_dir="$tmpdir/repos/testowner/testrepo"
	mkdir -p "$bare_dir"
	git init --bare "$bare_dir/.bare" >/dev/null 2>&1
	echo "gitdir: .bare" >"$bare_dir/.git"

	# Seed an initial commit so we can create worktrees
	seed_dir="$(mktemp -d)"
	git clone "$bare_dir/.bare" "$seed_dir" >/dev/null 2>&1
	(cd "$seed_dir" && git commit --allow-empty -m "init" >/dev/null 2>&1 && git push >/dev/null 2>&1)
	rm -rf "$seed_dir"

	# Rename default branch to main if needed
	git -C "$bare_dir/.bare" branch -m main 2>/dev/null || true

	# Create the main worktree
	git -C "$bare_dir/.bare" worktree add "$bare_dir/main" main >/dev/null 2>&1
	assert_eq "$(wt_detect "$bare_dir/main")" "worktree"
	assert_eq "$(wt_detect "$bare_dir/.bare")" "bare"

	echo "--- Test: wt_owner_repo on worktree ---"
	assert_eq "$(wt_owner_repo "$bare_dir/main")" "testowner/testrepo"
	assert_eq "$(wt_owner_repo "$bare_dir")" "testowner/testrepo"

	echo "--- Test: wt_switch_branch on clone ---"
	clone_path="$tmpdir/clone-repo"
	result="$(wt_switch_branch "$clone_path" "test-branch")"
	assert_eq "$result" "$clone_path"
	current="$(git -C "$clone_path" branch --show-current)"
	assert_eq "$current" "test-branch"

	echo "--- Test: wt_switch_branch on worktree (same branch) ---"
	current_br="$(git -C "$bare_dir/main" branch --show-current)"
	result="$(wt_switch_branch "$bare_dir/main" "$current_br")"
	assert_eq "$result" "$bare_dir/main"

	echo "--- Test: wt_switch_branch on worktree (new branch) ---"
	result="$(wt_switch_branch "$bare_dir/main" "feat-test")"
	assert_eq "$result" "$bare_dir/feat-test"
	assert_eq "$(wt_detect "$bare_dir/feat-test")" "worktree"
	assert_eq "$(git -C "$bare_dir/feat-test" branch --show-current)" "feat-test"

	echo "--- Test: wt_switch_branch on worktree (existing worktree) ---"
	result="$(wt_switch_branch "$bare_dir/main" "feat-test")"
	assert_eq "$result" "$bare_dir/feat-test"

	echo "--- Test: wt_cleanup ---"
	wt_cleanup "$bare_dir/feat-test"
	[[ ! -d "$bare_dir/feat-test" ]] || {
		echo "FAIL: worktree not removed" >&2
		exit 1
	}

	echo "--- Test: wt_cleanup on non-worktree (no-op) ---"
	wt_cleanup "$clone_path" 2>/dev/null
	[[ -d "$clone_path" ]] || {
		echo "FAIL: clone was incorrectly removed" >&2
		exit 1
	}

	echo "All tests passed."
fi
