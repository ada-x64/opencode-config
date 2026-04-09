#!/usr/bin/env bash
# vault-sync.sh — PR merge detection cron script
#
# Scans $AGENT_VAULT for tasks with status "🔍 in-review", checks if their
# linked PRs have been merged, and if so: marks complete, archives, closes
# the GitHub issue, and sends a notification.
#
# Usage:
#   vault-sync.sh              # normal run
#   vault-sync.sh --dry-run    # print what would happen without making changes
#
# Environment:
#   AGENT_VAULT   — path to the agent vault (required)
#   NTFY_TOPIC    — ntfy topic for notifications (optional; falls back to
#                   $AGENT_VAULT/_misc/ntfy-topic.txt)
#
# Designed to run from cron every 15 minutes:
#   */15 * * * * ~/.local/bin/vault-sync >> ~/.local/log/vault-sync.log 2>&1

set -euo pipefail

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

# --- Preflight ---

if [[ -z "${AGENT_VAULT:-}" ]]; then
  echo "ERROR: AGENT_VAULT is not set" >&2
  exit 1
fi

if [[ ! -d "$AGENT_VAULT" ]]; then
  echo "ERROR: AGENT_VAULT directory does not exist: $AGENT_VAULT" >&2
  exit 1
fi

if ! command -v gh &>/dev/null; then
  echo "WARN: gh CLI not found — skipping PR checks" >&2
  exit 0
fi

if ! gh auth status &>/dev/null 2>&1; then
  echo "WARN: gh CLI not authenticated — skipping PR checks" >&2
  exit 0
fi

log() { echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] $*"; }

# --- Resolve ntfy topic ---

NTFY_TOPIC="${NTFY_TOPIC:-}"
if [[ -z "$NTFY_TOPIC" && -f "$AGENT_VAULT/_misc/ntfy-topic.txt" ]]; then
  NTFY_TOPIC="$(tr -d '[:space:]' < "$AGENT_VAULT/_misc/ntfy-topic.txt")"
fi

notify() {
  local msg="$1"
  if [[ -n "$NTFY_TOPIC" ]]; then
    curl -s -o /dev/null \
      -H "Title: vault-sync" \
      -H "Priority: default" \
      -d "$msg" \
      "https://ntfy.sh/$NTFY_TOPIC" 2>/dev/null || true
  fi
}

# --- Read frontmatter field ---
# Simple POSIX-compatible frontmatter reader. Reads the value of a key from
# YAML frontmatter delimited by --- lines.

fm_get() {
  local file="$1" key="$2"
  awk -v key="$key" '
    BEGIN { in_fm = 0; found = 0 }
    /^---\s*$/ {
      if (in_fm) exit
      in_fm = 1
      next
    }
    in_fm && $0 ~ "^" key ":" {
      sub("^" key ":[[:space:]]*", "")
      # Strip surrounding quotes if present
      gsub(/^["'\'']|["'\'']$/, "")
      print
      found = 1
      exit
    }
    END { if (!found) print "" }
  ' "$file" 2>/dev/null
}

# --- Set frontmatter field ---
# Replaces the value of an existing key in YAML frontmatter.

fm_set() {
  local file="$1" key="$2" value="$3"
  if $DRY_RUN; then
    log "  [dry-run] Would set $key: $value in $file"
    return
  fi
  # Use a temp file for atomic replacement
  local tmp="${file}.tmp.$$"
  awk -v key="$key" -v val="$value" '
    BEGIN { in_fm = 0; replaced = 0 }
    /^---\s*$/ {
      if (in_fm) { in_fm = 0 }
      else { in_fm = 1 }
      print
      next
    }
    in_fm && $0 ~ "^" key ":" {
      print key ": " val
      replaced = 1
      next
    }
    { print }
  ' "$file" > "$tmp" && mv "$tmp" "$file"
}

# --- Common regex for GitHub URLs ---
GH_URL_RE='github\.com/([^/]+)/([^/]+)/(pull|issues)/([0-9]+)'

# --- Extract PR URL from issue field ---
# Handles both formats:
#   issue: https://github.com/owner/repo/pull/123
#   issue: "[owner/repo#123](https://github.com/owner/repo/pull/123)"
#   issue: [#123](https://github.com/owner/repo/pull/123)

extract_pr_url() {
  local issue_val="$1"
  # Extract URL from markdown link if present
  local url
  local md_link_re='\(([^)]+)\)'
  if [[ "$issue_val" =~ $md_link_re ]]; then
    url="${BASH_REMATCH[1]}"
  else
    url="$issue_val"
  fi
  # Only return if it looks like a GitHub PR or issue URL
  if [[ "$url" =~ $GH_URL_RE ]]; then
    echo "$url"
  fi
}

# --- Extract owner/repo and number from a GitHub URL ---

parse_github_url() {
  local url="$1"
  if [[ "$url" =~ $GH_URL_RE ]]; then
    echo "${BASH_REMATCH[1]}/${BASH_REMATCH[2]}" "${BASH_REMATCH[4]}" "${BASH_REMATCH[3]}"
  fi
}

# --- Main scan ---

log "Starting vault-sync scan"
$DRY_RUN && log "(dry-run mode)"

processed=0
merged=0

# Find all schema.md files under tasks/
while IFS= read -r schema_file; do
  # Check if status is "🔍 in-review"
  status="$(fm_get "$schema_file" "status")"
  if [[ "$status" != *"in-review"* ]]; then
    continue
  fi

  task_dir="$(dirname "$schema_file")"
  task_name="$(basename "$task_dir")"

  log "Found in-review task: $task_name ($schema_file)"
  ((processed++)) || true

  # Get the issue/PR link
  issue_val="$(fm_get "$schema_file" "issue")"
  if [[ -z "$issue_val" ]]; then
    log "  No issue field — skipping"
    continue
  fi

  pr_url="$(extract_pr_url "$issue_val")"
  if [[ -z "$pr_url" ]]; then
    log "  Could not extract PR URL from issue field: $issue_val — skipping"
    continue
  fi

  read -r repo_slug pr_number url_type <<< "$(parse_github_url "$pr_url")"
  if [[ -z "$repo_slug" || -z "$pr_number" ]]; then
    log "  Could not parse GitHub URL: $pr_url — skipping"
    continue
  fi

  log "  Checking $repo_slug#$pr_number ($url_type)..."

  # Check merge state via gh API
  is_merged=false
  if [[ "$url_type" == "pull" ]]; then
    if gh api "repos/$repo_slug/pulls/$pr_number" --jq '.merged' 2>/dev/null | grep -q 'true'; then
      is_merged=true
    fi
  else
    # For issue URLs, check if linked PR is merged
    state="$(gh api "repos/$repo_slug/issues/$pr_number" --jq '.state' 2>/dev/null || echo "")"
    if [[ "$state" == "closed" ]]; then
      # Check if closed by a merged PR
      is_merged=true
    fi
  fi

  if ! $is_merged; then
    log "  Not merged yet — skipping"
    continue
  fi

  log "  PR is merged! Processing..."
  ((merged++)) || true

  # 1. Set status to complete
  fm_set "$schema_file" "status" "✅ complete"
  log "  Set status to ✅ complete"

  # Read fields we'll need after archive (fm_get won't work once file is moved)
  repo_field="$(fm_get "$schema_file" "repo" 2>/dev/null || echo "")"
  issue_field="$(fm_get "$schema_file" "issue" 2>/dev/null || echo "")"

  # 2. Archive the task directory
  # Determine archive path preserving structure
  tasks_root="$AGENT_VAULT/tasks"
  archive_root="$AGENT_VAULT/_misc/archive/tasks"
  rel_path="${task_dir#"$tasks_root"/}"

  if $DRY_RUN; then
    log "  [dry-run] Would move $task_dir → $archive_root/$rel_path"
  else
    mkdir -p "$(dirname "$archive_root/$rel_path")"
    mv "$task_dir" "$archive_root/$rel_path"
    log "  Archived to $archive_root/$rel_path"
  fi

  # 3. Close the linked GitHub issue if still open
  if [[ "$url_type" == "issues" ]]; then
    issue_state="$(gh api "repos/$repo_slug/issues/$pr_number" --jq '.state' 2>/dev/null || echo "")"
    if [[ "$issue_state" == "open" ]]; then
      if $DRY_RUN; then
        log "  [dry-run] Would close issue $repo_slug#$pr_number"
      else
        gh issue close "$pr_number" -R "$repo_slug" 2>/dev/null || true
        log "  Closed issue $repo_slug#$pr_number"
      fi
    fi
  elif [[ "$url_type" == "pull" ]]; then
    # Check if there's a linked issue to close (fields read before archive)
    # Try to find issue number from the issue field (might differ from PR number)
    issue_re='issues/([0-9]+)'
    if [[ "$issue_field" =~ $issue_re ]]; then
      issue_num="${BASH_REMATCH[1]}"
      issue_repo="${repo_field:-$repo_slug}"
      issue_state="$(gh api "repos/$issue_repo/issues/$issue_num" --jq '.state' 2>/dev/null || echo "")"
      if [[ "$issue_state" == "open" ]]; then
        if $DRY_RUN; then
          log "  [dry-run] Would close issue $issue_repo#$issue_num"
        else
          gh issue close "$issue_num" -R "$issue_repo" 2>/dev/null || true
          log "  Closed issue $issue_repo#$issue_num"
        fi
      fi
    fi
  fi

  # 4. Send notification
  if $DRY_RUN; then
    log "  [dry-run] Would notify: Task $task_name completed — PR merged"
  else
    notify "Task $task_name completed — PR merged ($repo_slug#$pr_number)"
    log "  Notification sent"
  fi

done < <(find "$AGENT_VAULT/tasks" -name "schema.md" -type f 2>/dev/null)

log "Scan complete: $processed in-review tasks found, $merged merged"
