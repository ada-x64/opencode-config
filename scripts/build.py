#!/usr/bin/env python3
"""
build.py — apply model + external_directory config from build.yaml to agent files.
Run from anywhere; paths are resolved relative to this script's directory.
"""

import json
import re
from pathlib import Path
from typing import Any

import yaml

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
SRC_DIR = REPO_ROOT / "src"
CONFIG_PATH = SRC_DIR / "build.yaml"
OPENCODE_JSON_PATH = SRC_DIR / "opencode.json"
AGENTS_DIR = SRC_DIR / "agents"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def parse_jsonc(text: str) -> dict[str, Any]:
    """Parse JSONC by stripping single-line // comments, then using json.loads."""
    stripped = re.sub(r"(?m)^\s*//[^\n]*\n", "\n", text)
    stripped = re.sub(r"\s*//[^\n]*", "", stripped)
    return dict(json.loads(stripped))


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


def parse_frontmatter(content: str) -> tuple[dict[str, Any], str, str] | None:
    """
    Parse YAML frontmatter from markdown content.
    Returns (fm_dict, fm_str, rest) or None if no frontmatter.
    fm_str is the raw text between the --- markers.
    rest is everything after the closing ---.
    """
    m = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    if not m:
        return None
    fm_str: str = m.group(1)
    fm_dict: dict[str, Any] = dict(yaml.safe_load(fm_str) or {})
    rest: str = content[m.end() :]
    return fm_dict, fm_str, rest


def rebuild_content(fm_lines: list[str], rest: str) -> str:
    """Reconstruct markdown content from a list of frontmatter lines and the body."""
    return "---\n" + "\n".join(fm_lines) + "\n---" + rest


# ---------------------------------------------------------------------------
# Step 1: Read global config from build.yaml
# ---------------------------------------------------------------------------

config = dict(yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8")))
global_section = dict(config["global"])
global_model: str = str(global_section["model"])
ext_dirs: list[str] = list(global_section["external_directory"])

# ---------------------------------------------------------------------------
# Step 2: Patch opencode.json
# ---------------------------------------------------------------------------

oc_text = OPENCODE_JSON_PATH.read_text(encoding="utf-8")
current_model = read_model_from_jsonc(oc_text)

if current_model != global_model:
    new_oc_text = write_model_to_jsonc(oc_text, global_model)
    tmp_path = OPENCODE_JSON_PATH.with_suffix(".json.tmp")
    tmp_path.write_text(new_oc_text, encoding="utf-8")
    _ = tmp_path.replace(OPENCODE_JSON_PATH)
    print(f"opencode.json: model {current_model} → {global_model}")
else:
    print(f"opencode.json: model already {global_model} (no change)")

# ---------------------------------------------------------------------------
# Step 3 + 4: Process each agent file
# ---------------------------------------------------------------------------

for agent_file in sorted(AGENTS_DIR.glob("*.md")):
    agent_name = agent_file.stem
    content = agent_file.read_text(encoding="utf-8")

    parsed = parse_frontmatter(content)
    if parsed is None:
        fm_dict: dict[str, Any] = {}
        fm_str: str = ""
        rest: str = content
    else:
        fm_dict, fm_str, rest = parsed

    fm_lines: list[str] = fm_str.splitlines() if fm_str else []

    # --- 4a: Model assignment (requires tier) ---
    tier: str | None = fm_dict.get("tier")

    if not tier:
        print(f"{agent_name}: no tier set, skipping model")
    else:
        tiers_config = dict(config.get("tiers", {}))
        tier_entry = tiers_config.get(tier)
        tier_config = dict(tier_entry) if tier_entry else {}
        tier_model: str | None = tier_config.get("model")

        current_agent_model: str | None = fm_dict.get("model")

        if tier_model is None:
            # Tier inherits global — remove model from frontmatter if present
            if current_agent_model is not None:
                fm_lines = [line for line in fm_lines if not line.startswith("model:")]
                new_content = rebuild_content(fm_lines, rest)
                agent_file.write_text(new_content, encoding="utf-8")
                content = new_content
                print(
                    f"{agent_name} (tier: {tier}): removed model override (inherits global)"
                )
            else:
                print(f"{agent_name} (tier: {tier}): no model override (no change)")
        else:
            # Tier has an explicit model — set it in frontmatter
            if current_agent_model != tier_model:
                has_model = any(line.startswith("model:") for line in fm_lines)
                if has_model:
                    fm_lines = [
                        f"model: {tier_model}" if line.startswith("model:") else line
                        for line in fm_lines
                    ]
                else:
                    # Insert model line immediately after the tier: line
                    new_lines: list[str] = []
                    for line in fm_lines:
                        new_lines.append(line)
                        if line.startswith("tier:"):
                            new_lines.append(f"model: {tier_model}")
                    fm_lines = new_lines
                new_content = rebuild_content(fm_lines, rest)
                agent_file.write_text(new_content, encoding="utf-8")
                content = new_content
                print(f"{agent_name} (tier: {tier}): model → {tier_model}")
            else:
                print(
                    f"{agent_name} (tier: {tier}): model already {tier_model} (no change)"
                )

    # --- 4b: Stamp external_directory (all agents, regardless of tier) ---
    # Re-parse in case 4a modified the file
    parsed = parse_frontmatter(content)
    if parsed is None:
        print(f"{agent_name}: external_directory no frontmatter")
        continue

    fm_dict, fm_str, rest = parsed
    fm_lines = fm_str.splitlines()

    # Build canonical external_directory block
    canonical: list[str] = ["  external_directory:"]
    for d in ext_dirs:
        canonical.append(f'    "{d}": allow')

    # Find and replace the external_directory block in fm_lines
    new_lines = []
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
        # Insert before task: if present, otherwise at end
        insert_idx = len(new_lines)
        for i, line in enumerate(new_lines):
            if re.match(r"^  task:", line):
                insert_idx = i
                break
        new_lines = new_lines[:insert_idx] + canonical + new_lines[insert_idx:]

    new_fm = "\n".join(new_lines)
    new_content = "---\n" + new_fm + "\n---" + rest

    if new_content != content:
        agent_file.write_text(new_content, encoding="utf-8")
        result = "updated"
    else:
        result = "no change"

    print(f"{agent_name}: external_directory {result}")

print()
print("Done. Model + external_directory config applied from build.yaml.")
