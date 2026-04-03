#!/usr/bin/env python3
"""setup.py — standalone installer for opencode-config

Usage:
  # Recommended — via uv (no install required):
  uvx opencode-config

  # Or via pipx:
  pipx run opencode-config

  # Directly from a GitHub release (no PyPI needed):
  uvx --from https://github.com/ada-x64/opencode-config/releases/latest/download/opencode-config.tar.gz opencode-config

  # Pipe from curl (classic):
  curl -fsSL https://github.com/ada-x64/opencode-config/releases/latest/download/setup.py | python3

  # Or run the downloaded script directly:
  python3 setup.py
"""

import os
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path
from typing import IO

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

CONFIG_DIR = Path.home() / ".config" / "opencode"
REPO = "ada-x64/opencode-config"
TARBALL_URL = (
    f"https://github.com/{REPO}/releases/latest/download/opencode-config.tar.gz"
)

# ---------------------------------------------------------------------------
# Color helpers
# ---------------------------------------------------------------------------


def info(msg: str) -> None:
    print(f"\033[1;32m==>\033[0m \033[1m{msg}\033[0m")


def warn(msg: str) -> None:
    print(f"\033[1;33mWarning:\033[0m {msg}", file=sys.stderr)


# ---------------------------------------------------------------------------
# Interactive prompts
# When piped via curl | python3, stdin is the script, not the terminal.
# Open /dev/tty explicitly so input() can interact with the user.
# ---------------------------------------------------------------------------


def open_tty() -> IO[str] | None:
    """Return a file object for /dev/tty, or None if unavailable."""
    try:
        return open("/dev/tty")
    except OSError:
        return None


def prompt(tty: IO[str], message: str) -> str:
    """Write prompt to stdout and read a line from tty."""
    print(message, end="", flush=True)
    return tty.readline().rstrip("\n")


def prompt_required(tty: IO[str], label: str, env_key: str) -> str:
    """Prompt for a required value, looping until non-empty. Honours env default."""
    default = os.environ.get(env_key, "")
    while True:
        if default:
            value = prompt(tty, f"{label} [{default}]: ")
        else:
            value = prompt(tty, f"{label} (required): ")
        result = value or default
        if result:
            return result
        warn(f"{env_key} is required.")


def prompt_optional(tty: IO[str], label: str) -> str:
    """Prompt for an optional value. Returns empty string if skipped."""
    return prompt(tty, f"{label} (optional, Enter to skip): ")


# ---------------------------------------------------------------------------
# Shell profile helpers
# ---------------------------------------------------------------------------


def find_shell_profile() -> Path:
    zdotdir = os.environ.get("ZDOTDIR", "")
    if zdotdir:
        return Path(zdotdir) / ".zshrc"
    zshrc = Path.home() / ".zshrc"
    if zshrc.exists():
        return zshrc
    return Path.home() / ".bashrc"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    print()
    print("  opencode-config setup")
    print("  =====================")
    print()

    # --- Open /dev/tty for interactive prompts ---
    tty = open_tty()
    if tty is None:
        warn("No interactive terminal available.")
        warn(
            "Set AGENT_VAULT and AGENT_REPOS in your environment and re-run setup.py directly:"
        )
        warn("  AGENT_VAULT=~/obsidian/agent.obs python3 setup.py")
        sys.exit(1)

    try:
        agent_vault = prompt_required(tty, "Where is your agent vault?", "AGENT_VAULT")
        agent_repos = prompt_required(tty, "Where do you keep repos?", "AGENT_REPOS")
        ntfy_topic = prompt_optional(tty, "ntfy.sh topic for push notifications")
    finally:
        tty.close()

    print()

    # --- Download tarball ---
    info("Downloading opencode-config...")
    with tempfile.TemporaryDirectory() as tmpdir:
        tarball_path = Path(tmpdir) / "opencode-config.tar.gz"
        _, _ = urllib.request.urlretrieve(TARBALL_URL, tarball_path)

        # --- Extract to CONFIG_DIR ---
        info(f"Installing to {CONFIG_DIR}...")
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        with tarfile.open(tarball_path, "r:gz") as tf:
            tf.extractall(CONFIG_DIR)

    # --- Resolve {{CONFIG_DIR}} in agent files ---
    info("Resolving agent permission paths...")
    agents_dir = CONFIG_DIR / "src" / "agents"
    for f in sorted(agents_dir.glob("*.md")):
        text = f.read_text()
        if "{{CONFIG_DIR}}" in text:
            _ = f.write_text(text.replace("{{CONFIG_DIR}}", str(CONFIG_DIR)))

    # --- Deploy aoe-config.toml with placeholder resolution ---
    aoe_src = CONFIG_DIR / "src" / "aoe-config.toml"
    aoe_dest = Path.home() / ".config" / "aoe" / "config.toml"
    if aoe_src.is_file():
        aoe_dest.parent.mkdir(parents=True, exist_ok=True)
        content = aoe_src.read_text()
        content = content.replace("{{AGENT_VAULT}}", agent_vault)
        content = content.replace("{{OPENCODE_CONFIG_SRC}}", str(CONFIG_DIR))
        _ = aoe_dest.write_text(content)

    # --- Run build.py ---
    info("Running build.py...")
    build_py = CONFIG_DIR / "scripts" / "build.py"
    env = os.environ.copy()
    env["OPENCODE_CONFIG_SRC"] = str(CONFIG_DIR)
    _ = subprocess.run([sys.executable, str(build_py)], check=True, env=env)

    # --- Write environment variables to shell profile ---
    profile = find_shell_profile()
    try:
        existing = profile.read_text() if profile.exists() else ""
    except OSError:
        existing = ""

    if "OPENCODE_CONFIG_SRC" in existing:
        warn(
            f"Shell profile already contains OPENCODE_CONFIG_SRC — skipping env block."
            f" Update {profile} manually if needed."
        )
    else:
        with profile.open("a") as fh:
            _ = fh.write("\n# opencode-config\n")
            _ = fh.write(f'export OPENCODE_CONFIG_SRC="{CONFIG_DIR}"\n')
            _ = fh.write(f'export AGENT_VAULT="{agent_vault}"\n')
            _ = fh.write(f'export AGENT_REPOS="{agent_repos}"\n')
            if ntfy_topic:
                _ = fh.write(f'export NTFY_TOPIC="{ntfy_topic}"\n')
        info(f"Environment variables written to {profile}")

    # --- Summary ---
    print()
    info("Setup complete!")
    print()
    print(f"  Config:    {CONFIG_DIR}")
    print("  AoE:       ~/.config/aoe/config.toml")
    print(f"  Vault:     {agent_vault}")
    print(f"  Repos:     {agent_repos}")
    print()
    print(f"Restart your shell or run: source ~/{profile.name}")
    print()


if __name__ == "__main__":
    main()
