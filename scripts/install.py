#!/usr/bin/env python3
"""install.py — deploy opencode-config to the target config directory

Usage:
  python3 scripts/install.py [--profile <name>] [--config-dir <path>] [--help]

Options:
  --profile <name>     Profile to use (default: host). Loads src/profiles/<name>.env.
  --config-dir <path>  Override CONFIG_DIR from the profile.
  --help               Show this help message and exit.

What it does:
  1. Loads the selected profile to set CONFIG_DIR and OPENCODE_CONFIG_SRC.
  2. Refuses to run if source == CONFIG_DIR (move the repo first).
  3. rsyncs src/ contents to CONFIG_DIR (excluding profiles/).
  4. Resolves {{CONFIG_DIR}} placeholders in target agent files.
  5. Runs scripts/build.py in the target directory for model + external_directory stamping.
  6. Prints a deployment summary.

Separation of concerns:
  - install.py: {{CONFIG_DIR}} resolution (destructive, target copies only)
  - build.py:   model + external_directory stamping (idempotent, structured YAML)
  - Source files in the repo are NEVER modified by this script.
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# .env parser
# ---------------------------------------------------------------------------


def parse_env_file(env_path: Path) -> dict[str, str]:
    """Parse a shell-style KEY=value env file into a dict.

    Handles:
    - Comment lines (starting with #) and blank lines — skipped.
    - ``export KEY=value`` — ``export`` prefix is stripped.
    - Single- and double-quoted values — outer quotes are removed.
    - $VAR / ${VAR} references — expanded via os.path.expandvars().
    - ~ prefix — expanded via os.path.expanduser().
    """
    result: dict[str, str] = {}

    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()

        if not line or line.startswith("#"):
            continue

        if line.startswith("export "):
            line = line[len("export ") :]

        if "=" not in line:
            continue

        key, _, raw_value = line.partition("=")
        key = key.strip()

        value = raw_value.strip()
        if (value.startswith('"') and value.endswith('"')) or (
            value.startswith("'") and value.endswith("'")
        ):
            value = value[1:-1]

        value = os.path.expandvars(value)
        value = os.path.expanduser(value)

        result[key] = value

    return result


# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="install.py",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
        add_help=True,
    )
    _ = parser.add_argument(
        "--profile",
        default="host",
        metavar="<name>",
        help="Profile to use (default: host). Loads src/profiles/<name>.env.",
    )
    _ = parser.add_argument(
        "--config-dir",
        default="",
        metavar="<path>",
        dest="config_dir_override",
        help="Override CONFIG_DIR from the profile.",
    )
    return parser


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = build_arg_parser()
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent
    src_dir = repo_root / "src"

    profile: str = str(args.profile)
    config_dir_override: str = str(args.config_dir_override)

    # --- Load profile ---
    profile_file = src_dir / "profiles" / f"{profile}.env"
    if not profile_file.is_file():
        print(f"Error: profile file not found: {profile_file}", file=sys.stderr)
        print("Available profiles:", file=sys.stderr)
        profiles_dir = src_dir / "profiles"
        for p in sorted(profiles_dir.glob("*.env")):
            print(f"  {p.stem}", file=sys.stderr)
        sys.exit(1)

    env_vars = parse_env_file(profile_file)

    config_dir_str: str = env_vars.get("CONFIG_DIR", "")
    opencode_config_src: str = env_vars.get("OPENCODE_CONFIG_SRC", "")
    agent_vault: str = env_vars.get("AGENT_VAULT", os.environ.get("AGENT_VAULT", ""))

    if not config_dir_str:
        print("Error: CONFIG_DIR not set in profile.", file=sys.stderr)
        sys.exit(1)

    if not opencode_config_src:
        print("Error: OPENCODE_CONFIG_SRC not set in profile.", file=sys.stderr)
        sys.exit(1)

    # --- Apply --config-dir override ---
    if config_dir_override:
        config_dir_str = config_dir_override

    # --- Expand ~ ---
    config_dir = Path(os.path.expanduser(config_dir_str)).resolve()
    opencode_config_src = os.path.expanduser(opencode_config_src)

    # --- In-place detection ---
    resolved_script_dir = script_dir
    try:
        resolved_config_dir = Path(config_dir_str).expanduser().resolve()
    except Exception:
        resolved_config_dir = Path(config_dir_str).expanduser()

    if resolved_script_dir == resolved_config_dir:
        print("Error: source directory equals target CONFIG_DIR.", file=sys.stderr)
        print("", file=sys.stderr)
        print(f"  Source: {resolved_script_dir}", file=sys.stderr)
        print(f"  Target: {resolved_config_dir}", file=sys.stderr)
        print("", file=sys.stderr)
        print(
            "Running install.py in-place would resolve {{CONFIG_DIR}} placeholders",
            file=sys.stderr,
        )
        print(
            "in the source agent files, destroying them permanently.", file=sys.stderr
        )
        print("", file=sys.stderr)
        print(
            "Move the repo first, then run install.py from the new location:",
            file=sys.stderr,
        )
        print(
            "  mv ~/.config/opencode $AGENT_REPOS/ada-x64/opencode-config",
            file=sys.stderr,
        )
        print(
            "  python3 $AGENT_REPOS/ada-x64/opencode-config/scripts/install.py",
            file=sys.stderr,
        )
        sys.exit(1)

    # --- Rsync src/ to CONFIG_DIR ---
    print(f"Deploying to: {config_dir}")
    print(f"Profile:      {profile} ({profile_file})")
    print()

    config_dir.mkdir(parents=True, exist_ok=True)

    rsync_cmd = [
        "rsync",
        "-a",
        "--delete",
        "--exclude=profiles/",
        f"{src_dir}/",
        f"{config_dir}/",
    ]
    _ = subprocess.run(rsync_cmd, check=True)
    print("Rsync complete.")

    # --- Deploy AoE config ---
    aoe_src = src_dir / "aoe-config.toml"
    aoe_dest = Path.home() / ".config" / "aoe" / "config.toml"
    if aoe_src.is_file():
        if agent_vault:
            aoe_dest.parent.mkdir(parents=True, exist_ok=True)
            content = aoe_src.read_text()
            content = content.replace("{{AGENT_VAULT}}", agent_vault)
            content = content.replace("{{OPENCODE_CONFIG_SRC}}", opencode_config_src)
            aoe_dest.write_text(content)
            print(f"AoE config deployed to: {aoe_dest}")
        else:
            print(
                "Warning: AGENT_VAULT not set — skipping AoE config deployment.",
                file=sys.stderr,
            )

    # --- Step 4: Resolve {{CONFIG_DIR}} in target agent files ---
    print(
        f"Resolving {{{{CONFIG_DIR}}}} \u2192 {opencode_config_src} in agent files..."
    )
    resolved_count = 0
    agents_dir = config_dir / "agents"
    for f in sorted(agents_dir.glob("*.md")):
        if not f.is_file():
            continue
        text = f.read_text()
        if "{{CONFIG_DIR}}" in text:
            _ = f.write_text(text.replace("{{CONFIG_DIR}}", opencode_config_src))
            print(f"  resolved: {f.name}")
            resolved_count += 1
    print(f"  {resolved_count} agent file(s) updated.")
    print()

    # --- Step 5: Run build.py ---
    build_py = script_dir / "build.py"
    if build_py.is_file():
        print("Running build.py for model + external_directory stamping...")
        build_env = os.environ.copy()
        build_env["OPENCODE_CONFIG_SRC"] = opencode_config_src
        _ = subprocess.run(
            [sys.executable, str(build_py)],
            check=True,
            env=build_env,
        )
        print()
    else:
        print(
            f"Warning: build.py not found at {build_py} — skipping model stamping.",
            file=sys.stderr,
        )

    # --- Step 6: Summary ---
    print("Done.")
    print()
    print(f"  Profile:             {profile}")
    print(f"  Target directory:    {config_dir}")
    print(f"  OPENCODE_CONFIG_SRC: {opencode_config_src}")
    print()
    print("To use this config, ensure OPENCODE_CONFIG_SRC is set in your environment:")
    print(f'  export OPENCODE_CONFIG_SRC="{opencode_config_src}"')


if __name__ == "__main__":
    main()
