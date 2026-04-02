#!/usr/bin/env bash
# setup.sh — standalone curl | bash installer for opencode-config
#
# Usage:
#   curl -fsSL https://github.com/ada-x64/opencode-config/releases/latest/download/setup.sh | bash
#
set -euo pipefail

# --- Temp dir with cleanup ---
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

# --- Config ---
CONFIG_DIR="$HOME/.config/opencode"
REPO="ada-x64/opencode-config"
TARBALL_URL="https://github.com/${REPO}/releases/latest/download/opencode-config.tar.gz"

# --- Color helpers ---
info() {
	printf '\033[1;32m==>\033[0m \033[1m%s\033[0m\n' "$*"
}

warn() {
	printf '\033[1;33mWarning:\033[0m %s\n' "$*" >&2
}

# --- Banner ---
echo ""
echo "  opencode-config setup"
echo "  ====================="
echo ""

# --- Interactive prompts ---

# AGENT_VAULT: auto-detect WSL path, then standard path
_vault_default=""
if [[ -d "$HOME/winhome/obsidian/agent.obs" ]]; then
	_vault_default="$HOME/winhome/obsidian/agent.obs"
elif [[ -d "$HOME/obsidian/agent.obs" ]]; then
	_vault_default="$HOME/obsidian/agent.obs"
fi

if [[ -n "$_vault_default" ]]; then
	printf 'Where is your agent vault? [%s]: ' "$_vault_default"
else
	printf 'Where is your agent vault? (required): '
fi
read -r _vault_input
AGENT_VAULT="${_vault_input:-$_vault_default}"

if [[ -z "$AGENT_VAULT" ]]; then
	warn "AGENT_VAULT is required." >&2
	exit 1
fi

# AGENT_REPOS
_repos_default="${AGENT_REPOS:-$HOME/repos}"
printf 'Where do you keep repos? [%s]: ' "$_repos_default"
read -r _repos_input
AGENT_REPOS="${_repos_input:-$_repos_default}"

# NTFY_TOPIC
printf 'ntfy.sh topic for push notifications (optional, Enter to skip): '
read -r NTFY_TOPIC

echo ""

# --- Download tarball ---
info "Downloading opencode-config..."
curl -fsSL "$TARBALL_URL" -o "$TMPDIR/opencode-config.tar.gz"

# --- Extract to CONFIG_DIR ---
info "Installing to $CONFIG_DIR..."
mkdir -p "$CONFIG_DIR"
tar -xzf "$TMPDIR/opencode-config.tar.gz" -C "$CONFIG_DIR"

# --- Resolve {{CONFIG_DIR}} in agent bash permissions ---
info "Resolving agent permission paths..."
for f in "$CONFIG_DIR/agents/"*.md; do
	[[ -f "$f" ]] || continue
	sed -i "s|{{CONFIG_DIR}}|${CONFIG_DIR}|g" "$f"
done

# --- Deploy aoe-config.toml with placeholder resolution ---
AOE_SRC="$CONFIG_DIR/docker/aoe-config.toml"
AOE_DEST="${HOME}/.config/aoe/config.toml"
if [[ -f "$AOE_SRC" ]]; then
	mkdir -p "$(dirname "$AOE_DEST")"
	sed -e "s|{{AGENT_VAULT}}|${AGENT_VAULT}|g" \
		-e "s|{{OPENCODE_CONFIG_SRC}}|${CONFIG_DIR}|g" \
		"$AOE_SRC" >"$AOE_DEST"
fi

# --- Run build.sh for model + external_directory stamping ---
info "Running build.sh..."
OPENCODE_CONFIG_SRC="$CONFIG_DIR" bash "$CONFIG_DIR/build.sh"

# --- Write environment variables to shell profile ---
if [[ -n "${ZDOTDIR:-}" ]]; then
	_profile="$ZDOTDIR/.zshrc"
elif [[ -f "$HOME/.zshrc" ]]; then
	_profile="$HOME/.zshrc"
elif [[ -f "$HOME/.bashrc" ]]; then
	_profile="$HOME/.bashrc"
else
	_profile="$HOME/.bashrc"
fi

if grep -q 'OPENCODE_CONFIG_SRC' "$_profile" 2>/dev/null; then
	warn "Shell profile already contains OPENCODE_CONFIG_SRC — skipping env block. Update $_profile manually if needed."
else
	{
		printf '\n# opencode-config\n'
		printf 'export OPENCODE_CONFIG_SRC="%s"\n' "$HOME/.config/opencode"
		printf 'export AGENT_VAULT="%s"\n' "$AGENT_VAULT"
		printf 'export AGENT_REPOS="%s"\n' "$AGENT_REPOS"
		if [[ -n "$NTFY_TOPIC" ]]; then
			printf 'export NTFY_TOPIC="%s"\n' "$NTFY_TOPIC"
		fi
	} >>"$_profile"
	info "Environment variables written to $_profile"
fi

# --- Summary ---
echo ""
info "Setup complete!"
echo ""
echo "  Config:    ~/.config/opencode"
echo "  AoE:       ~/.config/aoe/config.toml"
echo "  Vault:     $AGENT_VAULT"
echo "  Repos:     $AGENT_REPOS"
echo ""
_shell_profile_basename="$(basename "$_profile")"
echo "Restart your shell or run: source ~/${_shell_profile_basename}"
echo ""
