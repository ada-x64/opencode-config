#!/usr/bin/env python3
"""install.py — deploy built config from out/ to the target config directory

Usage:
  python3 scripts/install.py [--profile <name>] [--config-dir <path>] [--help]

Options:
  --profile <name>     Profile to use (default: host). Loads src/profiles/<name>.env.
  --config-dir <path>  Override CONFIG_DIR from the profile.
  --help               Show this help message and exit.

Prerequisites:
  Run build.py first to produce the out/ directory:
    python3 scripts/build.py [--config-dir <path>]

What it does:
  1. Loads the selected profile to set CONFIG_DIR and OPENCODE_CONFIG_SRC.
  2. Verifies out/ exists (must run build.py first).
  3. Refuses to run if out/ == CONFIG_DIR (would be a no-op or destructive).
  4. rsyncs out/ contents to CONFIG_DIR.
  5. Deploys AoE config (resolving {{AGENT_VAULT}} and {{OPENCODE_CONFIG_SRC}})
     from src/aoe-config.toml.
  6. Prints a deployment summary.

Separation of concerns:
  - build.py:   src/ → out/ copy + all stamping (model, external_directory, {{CONFIG_DIR}})
  - install.py: out/ → CONFIG_DIR rsync + AoE config deployment
  - Source files in src/ are NEVER modified.
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
    out_dir = repo_root / "out"

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

    # --- Check out/ exists ---
    if not out_dir.is_dir():
        print("Error: out/ directory not found.", file=sys.stderr)
        print("Run build.py first to produce the build output:", file=sys.stderr)
        print(f"  python3 {script_dir / 'build.py'}", file=sys.stderr)
        sys.exit(1)

    # --- Safety: refuse if out/ == CONFIG_DIR ---
    try:
        resolved_out = out_dir.resolve()
        resolved_config = config_dir.resolve()
    except Exception:
        resolved_out = out_dir
        resolved_config = config_dir

    if resolved_out == resolved_config:
        print("Error: out/ directory equals target CONFIG_DIR.", file=sys.stderr)
        print("", file=sys.stderr)
        print(f"  out/:       {resolved_out}", file=sys.stderr)
        print(f"  CONFIG_DIR: {resolved_config}", file=sys.stderr)
        print("", file=sys.stderr)
        print(
            "Rsyncing out/ onto itself would be destructive. Check your profile.",
            file=sys.stderr,
        )
        sys.exit(1)

    # --- Rsync out/ to CONFIG_DIR ---
    print(f"Deploying to: {config_dir}")
    print(f"Profile:      {profile} ({profile_file})")
    print(f"Source:       {out_dir}")
    print()

    config_dir.mkdir(parents=True, exist_ok=True)

    rsync_cmd = [
        "rsync",
        "-a",
        "--delete",
        f"{out_dir}/",
        f"{config_dir}/",
    ]
    _ = subprocess.run(rsync_cmd, check=True)
    print("Rsync complete.")

    # --- Deploy AoE config ---
    aoe_src = src_dir / "aoe-config.toml"
    aoe_dest = Path.home() / ".config" / "agent-of-empires" / "config.toml"
    if aoe_src.is_file():
        if agent_vault:
            aoe_dest.parent.mkdir(parents=True, exist_ok=True)
            content = aoe_src.read_text()
            content = content.replace("{{AGENT_VAULT}}", agent_vault)
            content = content.replace("{{OPENCODE_CONFIG_SRC}}", opencode_config_src)
            _ = aoe_dest.write_text(content)
            print(f"AoE config deployed to: {aoe_dest}")
        else:
            print(
                "Warning: AGENT_VAULT not set — skipping AoE config deployment.",
                file=sys.stderr,
            )

    # --- Summary ---
    print()
    print("Done.")
    print()
    print(f"  Profile:             {profile}")
    print(f"  Source:              {out_dir}")
    print(f"  Target directory:    {config_dir}")
    print(f"  OPENCODE_CONFIG_SRC: {opencode_config_src}")
    print()
    print("To use this config, ensure OPENCODE_CONFIG_SRC is set in your environment:")
    print(f'  export OPENCODE_CONFIG_SRC="{opencode_config_src}"')


if __name__ == "__main__":
    main()
