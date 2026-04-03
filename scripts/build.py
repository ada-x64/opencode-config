#!/usr/bin/env python3
"""
build.py — build stamped config from src/ templates into out/.

Copies src/ → out/ (excluding profiles/), then applies all stamps:
  - model field in opencode.json
  - model + external_directory in agent frontmatter
  - {{CONFIG_DIR}} placeholder resolution in agent files

Source files in src/ are NEVER modified.

On first run (build.json absent), prompts for model config interactively
and writes build.json to the repo root (gitignored — not checked in).

Usage:
  python3 scripts/build.py                # build using existing build.json
  python3 scripts/build.py --reconfigure  # re-prompt for model config
"""

import argparse
import json
import re
import shutil
import sys
from pathlib import Path
from typing import IO, Any

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
SRC_DIR = REPO_ROOT / "src"
OUT_DIR = REPO_ROOT / "out"
CONFIG_PATH = REPO_ROOT / "build.json"

# Default config written on first run
DEFAULT_CONFIG: dict[str, Any] = {
    "global": {
        "model": "github-copilot/claude-opus-4.6",
        "external_directory": [
            "{env:AGENT_REPOS}/**",
            "{env:AGENT_VAULT}/**",
            "{env:OPENCODE_CONFIG_SRC}/**",
            "/tmp/**",
        ],
    },
    "tiers": {
        "design": {"model": None},
        "execute": {"model": "github-copilot/claude-sonnet-4.6"},
    },
}


# ---------------------------------------------------------------------------
# TTY prompt helpers
# ---------------------------------------------------------------------------


def open_tty() -> IO[str] | None:
    """Return a file object for /dev/tty, or None if unavailable."""
    try:
        return open("/dev/tty")
    except OSError:
        return None


def tty_prompt(tty: IO[str], message: str) -> str:
    """Write prompt to stdout and read a line from tty."""
    print(message, end="", flush=True)
    return tty.readline().rstrip("\n")


# ---------------------------------------------------------------------------
# First-run / reconfigure: generate build.json interactively
# ---------------------------------------------------------------------------


def prompt_config(tty: IO[str]) -> dict[str, Any]:
    """Prompt the user for model configuration and return a build config dict."""
    config: dict[str, Any] = json.loads(json.dumps(DEFAULT_CONFIG))

    default_global = str(DEFAULT_CONFIG["global"]["model"])
    val = tty_prompt(tty, f"Global model [{default_global}]: ")
    if val:
        config["global"]["model"] = val

    default_execute = str(DEFAULT_CONFIG["tiers"]["execute"]["model"])
    val = tty_prompt(tty, f"Execute-tier model [{default_execute}]: ")
    if val:
        config["tiers"]["execute"]["model"] = val

    print("Design tier inherits global model (no override). Edit build.json to change.")

    return config


def ensure_config(reconfigure: bool = False) -> dict[str, Any]:
    """Load or create build.json. Prompts interactively on first run or --reconfigure."""
    if CONFIG_PATH.is_file() and not reconfigure:
        return dict(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))

    # Need interactive prompts
    tty = open_tty()
    if tty is None:
        if CONFIG_PATH.is_file():
            print("No TTY available, using existing build.json.", file=sys.stderr)
            return dict(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))
        # No config and no TTY — write defaults
        print("No TTY available, writing default build.json.", file=sys.stderr)
        config = json.loads(json.dumps(DEFAULT_CONFIG))
        _ = CONFIG_PATH.write_text(
            json.dumps(config, indent=2) + "\n", encoding="utf-8"
        )
        return dict(config)

    try:
        if reconfigure:
            print("Reconfiguring build.json...")
        else:
            print("No build.json found — running first-time setup.")
        print()
        config = prompt_config(tty)
    finally:
        tty.close()

    _ = CONFIG_PATH.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    print(f"\nWrote {CONFIG_PATH}")
    return config


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def read_model_from_jsonc(text: str) -> str:
    """Extract the top-level "model" value from JSONC text."""
    m = re.search(r'"model"\s*:\s*"([^"]*)"', text)
    return m.group(1) if m else ""


def write_model_to_jsonc(text: str, new_model: str) -> str:
    """Replace the top-level "model" value in JSONC text, preserving everything else."""
    return re.sub(
        r'("model"\s*:\s*)"[^"]*"',
        lambda _: f'"model": "{new_model}"',
        text,
        count=1,
    )


def extract_frontmatter(content: str) -> tuple[str, str] | None:
    """
    Extract raw frontmatter text and the rest of the markdown content.
    Returns (fm_str, rest) or None if no frontmatter found.
    """
    m = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    if not m:
        return None
    return m.group(1), content[m.end() :]


def fm_get(fm_str: str, key: str) -> str | None:
    """Extract a simple key: value from frontmatter text. Returns None if absent."""
    m = re.search(rf"^{re.escape(key)}:\s*(.+)$", fm_str, re.MULTILINE)
    return m.group(1).strip() if m else None


def rebuild_content(fm_lines: list[str], rest: str) -> str:
    """Reconstruct markdown content from a list of frontmatter lines and the body."""
    return "---\n" + "\n".join(fm_lines) + "\n---" + rest


# ---------------------------------------------------------------------------
# Build: copy src/ → out/ then stamp
# ---------------------------------------------------------------------------


def copy_src_to_out(src_dir: Path, out_dir: Path) -> None:
    """Copy src/ tree to out/, excluding profiles/."""
    if out_dir.exists():
        shutil.rmtree(out_dir)
    _ = shutil.copytree(
        src_dir,
        out_dir,
        ignore=shutil.ignore_patterns("profiles"),
    )
    print(f"Copied {src_dir}/ → {out_dir}/ (excluding profiles/)")


def stamp_opencode_json(out_dir: Path, global_model: str) -> None:
    """Stamp the model field in out/opencode.json."""
    oc_path = out_dir / "opencode.json"
    oc_text = oc_path.read_text(encoding="utf-8")
    current_model = read_model_from_jsonc(oc_text)

    if current_model != global_model:
        new_text = write_model_to_jsonc(oc_text, global_model)
        _ = oc_path.write_text(new_text, encoding="utf-8")
        print(f"opencode.json: model {current_model} → {global_model}")
    else:
        print(f"opencode.json: model already {global_model} (no change)")


def stamp_agent_models(agents_dir: Path, config: dict[str, Any]) -> dict[Path, str]:
    """Stamp model fields in agent frontmatter. Returns {path: updated content}."""
    tiers_config = dict(config.get("tiers", {}))

    for agent_file in sorted(agents_dir.glob("*.md")):
        agent_name = agent_file.stem
        content = agent_file.read_text(encoding="utf-8")

        parsed = extract_frontmatter(content)
        if parsed is None:
            print(f"{agent_name}: no frontmatter, skipping model")
            continue

        fm_str, rest = parsed
        fm_lines = fm_str.splitlines()
        tier = fm_get(fm_str, "tier")

        if not tier:
            print(f"{agent_name}: no tier set, skipping model")
            continue

        tier_entry = tiers_config.get(tier)
        tier_config = dict(tier_entry) if tier_entry else {}
        tier_model: str | None = tier_config.get("model")
        current_model = fm_get(fm_str, "model")

        if tier_model is None:
            # Tier inherits global — remove model line if present
            if current_model is not None:
                fm_lines = [line for line in fm_lines if not line.startswith("model:")]
                _ = agent_file.write_text(
                    rebuild_content(fm_lines, rest), encoding="utf-8"
                )
                print(
                    f"{agent_name} (tier: {tier}): removed model override"
                    + " (inherits global)"
                )
            else:
                print(f"{agent_name} (tier: {tier}): no model override (no change)")
        elif current_model != tier_model:
            has_model = any(line.startswith("model:") for line in fm_lines)
            if has_model:
                fm_lines = [
                    f"model: {tier_model}" if line.startswith("model:") else line
                    for line in fm_lines
                ]
            else:
                inserted: list[str] = []
                for line in fm_lines:
                    inserted.append(line)
                    if line.startswith("tier:"):
                        inserted.append(f"model: {tier_model}")
                fm_lines = inserted
            _ = agent_file.write_text(rebuild_content(fm_lines, rest), encoding="utf-8")
            print(f"{agent_name} (tier: {tier}): model → {tier_model}")
        else:
            print(
                f"{agent_name} (tier: {tier}): model already"
                + f" {tier_model} (no change)"
            )

    return {}


def stamp_external_dirs(agents_dir: Path, ext_dirs: list[str]) -> None:
    """Stamp the external_directory block in all agent frontmatter."""
    canonical: list[str] = ["  external_directory:"]
    for d in ext_dirs:
        canonical.append(f'    "{d}": allow')

    for agent_file in sorted(agents_dir.glob("*.md")):
        agent_name = agent_file.stem
        content = agent_file.read_text(encoding="utf-8")

        parsed = extract_frontmatter(content)
        if parsed is None:
            print(f"{agent_name}: external_directory no frontmatter")
            continue

        fm_str, rest = parsed
        fm_lines = fm_str.splitlines()

        new_lines: list[str] = []
        skip = False
        found = False

        for line in fm_lines:
            if re.match(r"^  external_directory:\s*$", line):
                found = True
                skip = True
                new_lines.extend(canonical)
                continue
            if skip:
                if re.match(r"^    ", line):
                    continue
                else:
                    skip = False
            new_lines.append(line)

        if not found:
            insert_idx = len(new_lines)
            for i, line in enumerate(new_lines):
                if re.match(r"^  task:", line):
                    insert_idx = i
                    break
            new_lines = new_lines[:insert_idx] + canonical + new_lines[insert_idx:]

        new_content = rebuild_content(new_lines, rest)

        if new_content != content:
            _ = agent_file.write_text(new_content, encoding="utf-8")
            result = "updated"
        else:
            result = "no change"

        print(f"{agent_name}: external_directory {result}")


def resolve_config_dir(agents_dir: Path, config_dir_value: str) -> None:
    """Resolve {{CONFIG_DIR}} placeholders in all agent files."""
    count = 0
    for f in sorted(agents_dir.glob("*.md")):
        text = f.read_text(encoding="utf-8")
        if "{{CONFIG_DIR}}" in text:
            _ = f.write_text(
                text.replace("{{CONFIG_DIR}}", config_dir_value), encoding="utf-8"
            )
            print(f"  resolved: {f.name}")
            count += 1
    print(f"  {count} agent file(s) updated.")


def build(config: dict[str, Any], config_dir_value: str = "") -> Path:
    """Full build: copy src/ → out/, apply all stamps. Returns out_dir path.

    Args:
        config: Loaded build.json dict.
        config_dir_value: Value to substitute for {{CONFIG_DIR}} in agent files.
                          If empty, uses OPENCODE_CONFIG_SRC env var, falling
                          back to the default ~/.config/opencode.
    """
    if not config_dir_value:
        import os

        config_dir_value = os.environ.get(
            "OPENCODE_CONFIG_SRC", str(Path.home() / ".config" / "opencode")
        )

    global_section = dict(config["global"])
    global_model: str = str(global_section["model"])
    ext_dirs: list[str] = list(global_section["external_directory"])

    # Step 1: Copy
    copy_src_to_out(SRC_DIR, OUT_DIR)

    agents_dir = OUT_DIR / "agents"

    # Step 2: Stamp opencode.json model
    stamp_opencode_json(OUT_DIR, global_model)

    # Step 3: Stamp agent models
    _ = stamp_agent_models(agents_dir, config)

    # Step 4: Stamp agent external_directory
    stamp_external_dirs(agents_dir, ext_dirs)

    # Step 5: Resolve {{CONFIG_DIR}} placeholders
    print(f"Resolving {{{{CONFIG_DIR}}}} → {config_dir_value} in agent files...")
    resolve_config_dir(agents_dir, config_dir_value)

    print()
    print(f"Done. Build output in {OUT_DIR}/")
    return OUT_DIR


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build stamped config from src/ templates into out/."
    )
    _ = parser.add_argument(
        "--reconfigure",
        action="store_true",
        help="Re-prompt for model configuration even if build.json exists.",
    )
    _ = parser.add_argument(
        "--config-dir",
        default="",
        metavar="<path>",
        dest="config_dir_value",
        help=(
            "Value to substitute for {{CONFIG_DIR}} in agent files."
            " Defaults to $OPENCODE_CONFIG_SRC or ~/.config/opencode."
        ),
    )
    args = parser.parse_args()

    config = ensure_config(reconfigure=bool(args.reconfigure))
    _ = build(config, config_dir_value=str(args.config_dir_value))


if __name__ == "__main__":
    main()
