#!/usr/bin/env bash
# install.sh — deploy opencode-config to the target config directory
#
# Usage:
#   bash install.sh [--profile <name>] [--config-dir <path>] [--help]
#
# Options:
#   --profile <name>     Profile to use (default: host). Loads profiles/<name>.env.
#   --config-dir <path>  Override CONFIG_DIR from the profile.
#   --help               Show this help message and exit.
#
# What it does:
#   1. Loads the selected profile to set CONFIG_DIR and OPENCODE_CONFIG_SRC.
#   2. Refuses to run if source == CONFIG_DIR (move the repo first).
#   3. rsyncs repo contents to CONFIG_DIR (excluding .git/, profiles/, install.sh, etc.).
#   4. Resolves {{CONFIG_DIR}} placeholders in target agent files.
#   5. Runs build.sh in the target directory for model + external_directory stamping.
#   6. Prints a deployment summary.
#
# Separation of concerns:
#   - install.sh: {{CONFIG_DIR}} resolution (destructive, target copies only)
#   - build.sh:   model + external_directory stamping (idempotent, structured YAML)
#   - Source files in the repo are NEVER modified by this script.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- Argument parsing ---
PROFILE="host"
CONFIG_DIR_OVERRIDE=""

while [[ $# -gt 0 ]]; do
	case "$1" in
	--profile)
		PROFILE="$2"
		shift 2
		;;
	--config-dir)
		CONFIG_DIR_OVERRIDE="$2"
		shift 2
		;;
	--help | -h)
		sed -n '2,/^set -/{ /^set -/d; s/^# //; s/^#$//; p }' "$0"
		exit 0
		;;
	*)
		echo "Error: unknown option: $1" >&2
		echo "Run: $0 --help" >&2
		exit 1
		;;
	esac
done

# --- Load profile ---
PROFILE_FILE="$SCRIPT_DIR/profiles/${PROFILE}.env"
if [[ ! -f "$PROFILE_FILE" ]]; then
	echo "Error: profile file not found: $PROFILE_FILE" >&2
	echo "Available profiles:" >&2
	ls "$SCRIPT_DIR/profiles/"*.env 2>/dev/null | sed 's|.*/||; s|\.env$||' | sed 's/^/  /' >&2
	exit 1
fi

# shellcheck source=/dev/null
source "$PROFILE_FILE"

# --- Apply --config-dir override ---
if [[ -n "$CONFIG_DIR_OVERRIDE" ]]; then
	CONFIG_DIR="$CONFIG_DIR_OVERRIDE"
fi

# --- Expand ~ in CONFIG_DIR ---
CONFIG_DIR="${CONFIG_DIR/#\~/$HOME}"
OPENCODE_CONFIG_SRC="${OPENCODE_CONFIG_SRC/#\~/$HOME}"

# --- In-place detection ---
RESOLVED_SCRIPT_DIR="$(realpath "$SCRIPT_DIR")"
RESOLVED_CONFIG_DIR="$(realpath "$CONFIG_DIR" 2>/dev/null || echo "$CONFIG_DIR")"

if [[ "$RESOLVED_SCRIPT_DIR" == "$RESOLVED_CONFIG_DIR" ]]; then
	echo "Error: source directory equals target CONFIG_DIR." >&2
	echo "" >&2
	echo "  Source: $RESOLVED_SCRIPT_DIR" >&2
	echo "  Target: $RESOLVED_CONFIG_DIR" >&2
	echo "" >&2
	echo "Running install.sh in-place would resolve {{CONFIG_DIR}} placeholders" >&2
	echo "in the source agent files, destroying them permanently." >&2
	echo "" >&2
	echo "Move the repo first, then run install.sh from the new location:" >&2
	echo "  mv ~/.config/opencode \$AGENT_REPOS/ada-x64/opencode-config" >&2
	echo "  bash \$AGENT_REPOS/ada-x64/opencode-config/install.sh" >&2
	exit 1
fi

# --- Rsync source to CONFIG_DIR ---
echo "Deploying to: $CONFIG_DIR"
echo "Profile:      $PROFILE (${PROFILE_FILE})"
echo ""

mkdir -p "$CONFIG_DIR"

rsync -a --delete \
	--exclude='.git/' \
	--exclude='profiles/' \
	--exclude='install.sh' \
	--exclude='docker/' \
	--exclude='README.md' \
	--exclude='.gitignore' \
	"$SCRIPT_DIR/" "$CONFIG_DIR/"

echo "Rsync complete."

# --- Step 4: Resolve {{CONFIG_DIR}} in target agent files ---
echo "Resolving {{CONFIG_DIR}} → $OPENCODE_CONFIG_SRC in agent files..."
resolved_count=0
for f in "$CONFIG_DIR/agents/"*.md; do
	[[ -f "$f" ]] || continue
	if grep -q '{{CONFIG_DIR}}' "$f" 2>/dev/null; then
		sed -i "s|{{CONFIG_DIR}}|${OPENCODE_CONFIG_SRC}|g" "$f"
		echo "  resolved: $(basename "$f")"
		resolved_count=$((resolved_count + 1))
	fi
done
echo "  $resolved_count agent file(s) updated."
echo ""

# --- Step 5: Run build.sh ---
BUILD_SH="$CONFIG_DIR/build.sh"
if [[ -f "$BUILD_SH" ]]; then
	echo "Running build.sh for model + external_directory stamping..."
	OPENCODE_CONFIG_SRC="$OPENCODE_CONFIG_SRC" bash "$BUILD_SH"
	echo ""
else
	echo "Warning: build.sh not found at $BUILD_SH — skipping model stamping." >&2
fi

# --- Step 6: Summary ---
echo "Done."
echo ""
echo "  Profile:            $PROFILE"
echo "  Target directory:   $CONFIG_DIR"
echo "  OPENCODE_CONFIG_SRC: $OPENCODE_CONFIG_SRC"
echo ""
echo "To use this config, ensure OPENCODE_CONFIG_SRC is set in your environment:"
echo "  export OPENCODE_CONFIG_SRC=\"$OPENCODE_CONFIG_SRC\""
