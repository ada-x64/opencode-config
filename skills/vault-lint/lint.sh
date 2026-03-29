#!/usr/bin/env bash
# vault-lint/lint.sh — Validate schemas and reviews against format templates.
# Usage: bash lint.sh [--schemas-only] [--reviews-only] [<owner>/<repo>]
#
# Requires: AGENT_VAULT set in environment
set -euo pipefail

lint_schema() {
  local file="$1"
  local errors=()

  # YAML frontmatter present
  head -1 "$file" | grep -qP '^---$' || { errors+=("missing YAML frontmatter"); }

  if [[ ${#errors[@]} -eq 0 ]]; then
    # Extract frontmatter (between first and second ---)
    local fm
    fm="$(sed -n '2,/^---$/p' "$file" | head -n -1)"

    # Required frontmatter fields
    for field in 'repo' 'date'; do
      echo "$fm" | grep -qP "^${field}:" || errors+=("missing '${field}' in frontmatter")
    done

    # Status field with valid value
    local status_val
    status_val="$(echo "$fm" | grep -oP '^status:\s*\K.*' | xargs || true)"
    if [[ -n "$status_val" ]]; then
      case "$status_val" in
        todo|"in progress"|complete) ;;
        *) errors+=("invalid status value: '${status_val}' (expected: todo, in progress, complete)") ;;
      esac
    else
      errors+=("missing 'status' in frontmatter")
    fi

    # Optional but warn: issue field
    echo "$fm" | grep -qP '^issue:' || errors+=("warning: missing 'issue' in frontmatter")
  fi

  # H1 heading (after frontmatter)
  grep -qP '^# ' "$file" || errors+=("missing H1 heading")

  # Required H2 sections
  for section in 'Problem' 'Approach' 'Todos' 'Files changed'; do
    grep -qP "^## ${section}" "$file" || errors+=("missing ## ${section}")
  done

  if [[ ${#errors[@]} -gt 0 ]]; then
    local rel="${file#${AGENT_VAULT}/}"
    for err in "${errors[@]}"; do
      echo "  ${rel}: ${err}"
    done
    return 1
  fi
  return 0
}

lint_review() {
  local file="$1"
  local errors=()

  # YAML frontmatter present
  head -1 "$file" | grep -qP '^---$' || { errors+=("missing YAML frontmatter"); }

  if [[ ${#errors[@]} -eq 0 ]]; then
    local fm
    fm="$(sed -n '2,/^---$/p' "$file" | head -n -1)"

    # Required frontmatter fields
    for field in 'repo' 'date'; do
      echo "$fm" | grep -qP "^${field}:" || errors+=("missing '${field}' in frontmatter")
    done

    # Status field with valid value
    local status_val
    status_val="$(echo "$fm" | grep -oP '^status:\s*\K.*' | xargs || true)"
    if [[ -n "$status_val" ]]; then
      case "$status_val" in
        todo|"in progress"|complete) ;;
        *) errors+=("invalid status value: '${status_val}' (expected: todo, in progress, complete)") ;;
      esac
    else
      errors+=("missing 'status' in frontmatter")
    fi
  fi

  # H1 starts with "Review:"
  grep -qP '^# Review:' "$file" || errors+=("H1 must start with 'Review:'")

  # Verdict section
  grep -qP '^## Verdict:' "$file" || errors+=("missing ## Verdict: section")

  # Issue sections must have severity and category
  local issue_count=0
  while IFS= read -r line; do
    if [[ "$line" =~ ^###\ [0-9]+\. ]]; then
      (( ++issue_count ))
      local issue_block
      issue_block="$(sed -n "/^${line//\//\\/}/,/^###/p" "$file" | head -10)"
      echo "$issue_block" | grep -qP '\*\*Severity:\*\*' || errors+=("issue #${issue_count} missing **Severity:**")
      echo "$issue_block" | grep -qP '\*\*Category:\*\*' || errors+=("issue #${issue_count} missing **Category:**")
    fi
  done < "$file"

  if [[ ${#errors[@]} -gt 0 ]]; then
    local rel="${file#${AGENT_VAULT}/}"
    for err in "${errors[@]}"; do
      echo "  ${rel}: ${err}"
    done
    return 1
  fi
  return 0
}

# Main
vault="${AGENT_VAULT:?AGENT_VAULT is not set}"
exit_code=0

# Parse arguments
schemas=true reviews=true filter=""
for arg in "$@"; do
  case "$arg" in
    --schemas-only) reviews=false ;;
    --reviews-only) schemas=false ;;
    --help|-h)
      echo "Usage: bash lint.sh [--schemas-only] [--reviews-only] [<owner>/<repo>]"
      exit 0
      ;;
    *) filter="$arg" ;;
  esac
done

if $schemas; then
  echo "Linting schemas..."
  while IFS= read -r -d '' file; do
    lint_schema "$file" || exit_code=1
  done < <(find "$vault/tasks" -name "schema.md" -type f ${filter:+-path "*/${filter}/*"} -not -path "*/_fleet/*" -print0)
fi

if $reviews; then
  echo "Linting reviews..."
  while IFS= read -r -d '' file; do
    lint_review "$file" || exit_code=1
  done < <(find "$vault/tasks" -name "review.md" -type f ${filter:+-path "*/${filter}/*"} -print0)
fi

if [[ $exit_code -eq 0 ]]; then
  echo "All files pass validation."
else
  echo ""
  echo "Lint found issues above."
fi
exit $exit_code
