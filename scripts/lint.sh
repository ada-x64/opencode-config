#!/usr/bin/env bash
# lint.sh -- run the same checks as CI (.github/workflows/lint.yml)
# Exit codes: 0 = all passed, 1 = one or more checks failed
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

failed=()

header() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }

# -- shfmt -------------------------------------------------------------------
header "shfmt"
mapfile -t sh_files < <(find . -name '*.sh' -not -path '*/node_modules/*')
if [[ ${#sh_files[@]} -gt 0 ]]; then
	if ! shfmt -d "${sh_files[@]}"; then
		failed+=(shfmt)
	fi
else
	echo "(no .sh files found)"
fi

# -- shellcheck ---------------------------------------------------------------
header "shellcheck"
if [[ ${#sh_files[@]} -gt 0 ]]; then
	if ! shellcheck "${sh_files[@]}"; then
		failed+=(shellcheck)
	fi
else
	echo "(no .sh files found)"
fi

# -- bun (required) -----------------------------------------------------------
if ! command -v bunx &>/dev/null; then
	echo "ERROR: bun is required but not found. Install from https://bun.sh"
	exit 1
fi

# -- prettier -----------------------------------------------------------------
header "prettier"
if ! bunx prettier --check .; then
	failed+=(prettier)
fi

# -- oxlint -------------------------------------------------------------------
header "oxlint"
mapfile -t ts_files < <(find . -name '*.ts' -not -path '*/node_modules/*' -not -path '*/out/*')
if [[ ${#ts_files[@]} -gt 0 ]]; then
	if ! bunx oxlint "${ts_files[@]}"; then
		failed+=(oxlint)
	fi
else
	echo "(no .ts files found)"
fi

# -- bun test -----------------------------------------------------------------
header "bun test"
if ! OPENCODE_CONFIG_SRC="$(pwd)/src" bun test; then
	failed+=(bun-test)
fi

# -- ruff format --------------------------------------------------------------
header "ruff format"
if ! uvx ruff format --check scripts/; then
	failed+=(ruff-format)
fi

# -- ruff check ---------------------------------------------------------------
header "ruff check"
if ! uvx ruff check scripts/; then
	failed+=(ruff-check)
fi

# -- basedpyright -------------------------------------------------------------
# pyproject.toml lives at the repo root; include = ["scripts"]
header "basedpyright"
if ! uvx basedpyright; then
	failed+=(basedpyright)
fi

# -- summary ------------------------------------------------------------------
echo
if [[ ${#failed[@]} -gt 0 ]]; then
	printf '\033[1;31mFailed: %s\033[0m\n' "${failed[*]}"
	exit 1
else
	printf '\033[1;32mAll checks passed.\033[0m\n'
fi
