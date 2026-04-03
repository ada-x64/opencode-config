#!/usr/bin/env python3
"""setup.py — standalone installer for opencode-config

Bootstrapper entry point. Prompts for environment paths, downloads the
release tarball to a staging directory, runs build.py to produce stamped
output, then rsyncs out/ to ~/.config/opencode and writes shell env vars.

Usage:
  # Recommended — via uv (no install required):
  uvx cubething-occonf

  # Or via pipx:
  pipx run cubething-occonf

  # Directly from a GitHub release (no PyPI needed):
  uvx --from https://github.com/ada-x64/opencode-config/releases/latest/download/opencode-config.tar.gz cubething-occonf

  # Pipe from curl (classic):
  curl -fsSL https://github.com/ada-x64/opencode-config/releases/latest/download/setup.py | python3

  # Or run the downloaded script directly:
  python3 setup.py
"""

import os
import shutil
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
    print("  cubething-occonf setup")
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

    # --- Download tarball to staging directory ---
    info("Downloading opencode-config...")
    staging = Path(tempfile.mkdtemp(prefix="opencode-config-"))
    try:
        tarball_path = staging / "opencode-config.tar.gz"
        _, _ = urllib.request.urlretrieve(TARBALL_URL, tarball_path)

        info("Extracting...")
        with tarfile.open(tarball_path, "r:gz") as tf:
            tf.extractall(staging)

        # The tarball may contain a top-level directory — find the repo root
        # (look for scripts/build.py to identify it)
        repo_root = staging
        for candidate in staging.iterdir():
            if candidate.is_dir() and (candidate / "scripts" / "build.py").is_file():
                repo_root = candidate
                break

        # --- Set up environment for child processes ---
        env = os.environ.copy()
        env["OPENCODE_CONFIG_SRC"] = str(CONFIG_DIR)
        env["AGENT_VAULT"] = agent_vault
        env["AGENT_REPOS"] = agent_repos
        if ntfy_topic:
            env["NTFY_TOPIC"] = ntfy_topic

        # --- Run build.py (generates build.json, copies src/ → out/, stamps everything) ---
        info("Running build.py...")
        build_py = repo_root / "scripts" / "build.py"
        _ = subprocess.run(
            [sys.executable, str(build_py), "--config-dir", str(CONFIG_DIR)],
            check=True,
            env=env,
            cwd=str(repo_root),
        )

        # --- Run install.py (rsyncs out/ → CONFIG_DIR, deploys AoE config) ---
        info("Running install.py...")
        install_py = repo_root / "scripts" / "install.py"
        _ = subprocess.run(
            [sys.executable, str(install_py), "--config-dir", str(CONFIG_DIR)],
            check=True,
            env=env,
            cwd=str(repo_root),
        )

    finally:
        # Clean up staging directory
        shutil.rmtree(staging, ignore_errors=True)

    # --- Write environment variables to shell profile ---
    profile = find_shell_profile()
    try:
        existing = profile.read_text() if profile.exists() else ""
    except OSError:
        existing = ""

    if "OPENCODE_CONFIG_SRC" in existing:
        warn(
            "Shell profile already contains OPENCODE_CONFIG_SRC — skipping env block."
            + f" Update {profile} manually if needed."
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
