#!/usr/bin/env bash
# vault-init/init.sh — Idempotent vault initialization.
# Creates all directories and copies templates without overwriting existing files.
# Usage: bash init.sh [vault-path]
#
# If no path is given, uses $AGENT_VAULT.
set -euo pipefail

vault="${1:-${AGENT_VAULT:-}}"
if [[ -z "$vault" ]]; then
  echo "Error: No vault path provided and AGENT_VAULT is not set." >&2
  echo "Usage: bash init.sh <vault-path>" >&2
  exit 1
fi

skill_dir="$(cd "$(dirname "$0")" && pwd)"
created=0

# Helper: create directory if missing
ensure_dir() {
  if [[ ! -d "$1" ]]; then
    mkdir -p "$1"
    echo "  created: $1"
    (( created++ )) || true
  fi
}

# Helper: copy file if missing (no overwrite)
ensure_file() {
  local src="$1" dst="$2"
  if [[ ! -f "$dst" ]]; then
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    echo "  created: $dst"
    (( created++ )) || true
  fi
}

echo "Initializing vault at: $vault"
echo ""

# Create directory structure
ensure_dir "$vault/tasks"
ensure_dir "$vault/archive/tasks"
ensure_dir "$vault/cache"
ensure_dir "$vault/design"
ensure_dir "$vault/draft"
ensure_dir "$vault/repo-notes"
ensure_dir "$vault/templates"

# Copy templates (only if missing)
if [[ -d "$skill_dir/templates" ]]; then
  for tmpl in "$skill_dir/templates"/*.md; do
    [[ -f "$tmpl" ]] || continue
    ensure_file "$tmpl" "$vault/templates/$(basename "$tmpl")"
  done
fi

# Write AGENTS.md (only if missing)
if [[ ! -f "$vault/AGENTS.md" ]]; then
  cat > "$vault/AGENTS.md" << 'AGENTS_EOF'
# Agent Vault

## What This Repository Is

This is a **git-tracked Obsidian vault** serving as a knowledge base. It contains
reference documentation, implementation schemas, code reviews, and triage
entries — not source code. There are no build systems, tests, or linters.

## Vault Structure

### `tasks/<owner>/<repo>/<task>/` — Implementation tasks

Each task directory contains up to three files:
- `schema.md` — Actionable implementation spec that an AI agent can execute step-by-step.
- `review.md` — Structured code review for work done against the schema.
- `triage.md` — Escalation notes, design questions, and run summaries.

### `repo-notes/<owner>/<repo>/` — Repository reference documentation

Reference summaries of repository internals (build systems, architecture,
scripts). A future agent session should be able to understand a subsystem
by reading one file.

### `design/` — Design documents

High-level thinking: architecture explorations, trade-off analyses, roadmaps,
and cross-cutting concerns.

### `draft/` — Work-in-progress documents

Staging area for notes and specs under active development.

### `archive/` — Completed work

Mirrors the active directories for work that has been completed:
- `archive/tasks/` — Completed task directories (schema + review + triage).

When asked to archive tasks, move them from the active directory into the
corresponding `archive/` subdirectory.

### `cache/` — GitHub metadata cache

Cached project board, milestone, and label data for repositories.

### Other

- `.obsidian/` — Obsidian configuration (do not modify).
- `AGENTS.md` — This file.
- `templates/` — Format templates for schemas, reviews, triage, and issues.

## Conventions

- Documents are Markdown, authored for Obsidian (may use wiki-links, callouts).
- Do not hard-wrap prose — Obsidian soft-wraps paragraphs.
- `repo-notes/` docs should be comprehensive standalone references.
- Task schemas should be actionable implementation specs.
- Task reviews store full code reviews.
- Path convention: `tasks/<owner>/<repo>/` mirrors the local checkout
  path convention `~/repos/<owner>/<repo>`.
AGENTS_EOF
  echo "  created: $vault/AGENTS.md"
  (( created++ )) || true
fi

echo ""
if (( created > 0 )); then
  echo "Done: $created items created."
else
  echo "Done: vault already fully initialized."
fi
echo "Vault path: $vault"
