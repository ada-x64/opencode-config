#!/usr/bin/env python3
"""
build.py — build stamped config from src/ templates into out/host/ and out/sandbox/.

Copies src/ → out/host/ and out/sandbox/ (excluding profiles/ and permissions/),
then applies all stamps:
  - model field in opencode.json
  - model + external_directory in agent frontmatter
  - {{BASH_PERMISSIONS}} placeholder resolved per-variant from src/permissions/
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
from collections.abc import Callable
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
        "sandbox_config_dir": "/root/.config/opencode",
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
# Build: copy src/ → out/<variant>/ then stamp
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Mode-conditional resolution
# ---------------------------------------------------------------------------


def _agent_mode(stem: str) -> str | None:
    """Return the build mode for an agent stem, or None if not mode-aware."""
    if stem == "implementor":
        return "manual"
    if stem == "auto-implementor":
        return "autonomous"
    return None


def _resolve_mode_str(content: str, mode: str) -> str:
    """Resolve {{#if MODE=...}}...{{/if}} blocks in a string.

    For blocks matching the given mode: removes the markers but keeps content.
    For blocks not matching: removes the entire block (markers + content).
    """
    pattern = re.compile(
        r"^{{#if MODE=(\w+)}}\n(.*?)^{{/if}}\n?", re.MULTILINE | re.DOTALL
    )

    def replacer(m: re.Match[str]) -> str:
        block_mode = m.group(1)
        block_content = m.group(2)
        if block_mode == mode:
            return block_content  # Keep content, remove markers
        return ""  # Remove entire block

    return pattern.sub(replacer, content)


def duplicate_implementor(agents_dir: Path) -> None:
    """Copy implementor.md → auto-implementor.md in out/ agents dir for mode stamping.

    Only copies if implementor.md exists and auto-implementor.md does not yet exist.
    """
    impl = agents_dir / "implementor.md"
    auto = agents_dir / "auto-implementor.md"
    if impl.is_file() and not auto.is_file():
        shutil.copy2(impl, auto)
        print(f"Duplicated {impl.name} → {auto.name} for mode stamping")


def resolve_mode_conditionals(agents_dir: Path) -> None:
    """Apply mode-conditional resolution to all mode-aware agent files in the directory."""
    for agent_file in sorted(agents_dir.glob("*.md")):
        mode = _agent_mode(agent_file.stem)
        if mode is None:
            continue
        content = agent_file.read_text(encoding="utf-8")
        if "{{#if MODE=" not in content:
            continue
        new_content = _resolve_mode_str(content, mode)
        agent_file.write_text(new_content, encoding="utf-8")
        print(f"{agent_file.name}: resolved mode conditionals (mode={mode})")


def copy_src_to_out(src_dir: Path, out_dir: Path) -> None:
    """Copy src/ tree to out/<variant>/, excluding profiles/ and permissions/."""
    if out_dir.exists():
        shutil.rmtree(out_dir)
    _ = shutil.copytree(
        src_dir,
        out_dir,
        ignore=shutil.ignore_patterns("profiles", "permissions"),
    )
    print(f"Copied {src_dir}/ → {out_dir}/ (excluding profiles/, permissions/)")


def resolve_includes(out_dir: Path, src_dir: Path) -> None:
    """Replace {{include:<path>}} placeholders with file contents.

    Scans all .md files under out_dir. Each {{include:<path>}} is replaced
    with the contents of src_dir/<path>. The placeholder must be on its own
    line (optionally with leading whitespace, which is preserved as indent).
    Path traversal (e.g. ../../etc/passwd) is blocked — includes must resolve
    within src_dir.
    """
    pattern = re.compile(r"^(\s*)\{\{include:(.+?)\}\}\s*$", re.MULTILINE)

    for md_file in sorted(out_dir.rglob("*.md")):
        content = md_file.read_text(encoding="utf-8")
        if "{{include:" not in content:
            continue

        def make_replacer(
            current_file: Path,
        ) -> "Callable[[re.Match[str]], str]":
            def replacer(m: re.Match[str]) -> str:
                indent = m.group(1)
                rel_path = m.group(2).strip()
                include_path = (src_dir / rel_path).resolve()
                # Guard against path traversal outside src_dir
                try:
                    include_path.relative_to(src_dir.resolve())
                except ValueError:
                    print(
                        f"Warning: include path escapes src_dir "
                        f"(in {current_file.name}): {rel_path}",
                        file=sys.stderr,
                    )
                    return m.group(0)
                if not include_path.is_file():
                    print(
                        f"Warning: include not found "
                        f"(in {current_file.name}): {include_path}",
                        file=sys.stderr,
                    )
                    return m.group(0)  # Leave placeholder intact
                included = include_path.read_text(encoding="utf-8").rstrip("\n") + "\n"
                if indent:
                    included = "\n".join(
                        indent + line if line else line
                        for line in included.splitlines()
                    )
                return included

            return replacer

        new_content = pattern.sub(make_replacer(md_file), content)
        if new_content != content:
            _ = md_file.write_text(new_content, encoding="utf-8")
            print(f"{md_file.name}: resolved includes")


def resolve_agent_vars(out_dir: Path) -> None:
    """Resolve {{TRIAGE_ICON}} and {{TRIAGE_EVENTS}} from HTML comment blocks.

    Looks for <!-- triage_icon: <value> --> and <!-- triage_events:\\n...\\n-->
    comment blocks in each .md file, extracts the values, substitutes them into
    {{TRIAGE_ICON}} and {{TRIAGE_EVENTS}} placeholders, then removes the comment
    blocks from the output.

    Skips files inside _shared/ directories — those are include fragments that
    intentionally contain unresolved placeholders.
    """
    icon_pat = re.compile(r"<!--\s*triage_icon:\s*(.+?)\s*-->")
    events_pat = re.compile(r"<!--\s*triage_events:\s*\n(.*?)-->", re.DOTALL)

    for md_file in sorted(out_dir.rglob("*.md")):
        if "_shared" in md_file.parts:
            continue  # Skip include fragments — placeholders are intentional
        content = md_file.read_text(encoding="utf-8")
        if "{{TRIAGE_ICON}}" not in content and "{{TRIAGE_EVENTS}}" not in content:
            continue

        icon_match = icon_pat.search(content)
        events_match = events_pat.search(content)

        changed = False

        if "{{TRIAGE_ICON}}" in content:
            if icon_match:
                icon_val = icon_match.group(1).strip()
                content = content.replace("{{TRIAGE_ICON}}", icon_val)
                content = re.sub(
                    re.escape(icon_match.group(0)) + r"\n?", "", content, count=1
                )
                changed = True
            else:
                print(
                    f"Warning: {md_file.name} has {{{{TRIAGE_ICON}}}} placeholder "
                    "but no <!-- triage_icon: … --> comment found",
                    file=sys.stderr,
                )

        if "{{TRIAGE_EVENTS}}" in content:
            if events_match:
                events_val = events_match.group(1).rstrip()
                content = content.replace("{{TRIAGE_EVENTS}}", events_val)
                content = re.sub(
                    re.escape(events_match.group(0)) + r"\n?", "", content, count=1
                )
                changed = True
            else:
                print(
                    f"Warning: {md_file.name} has {{{{TRIAGE_EVENTS}}}} placeholder "
                    "but no <!-- triage_events: … --> comment found",
                    file=sys.stderr,
                )

        if not changed:
            continue

        _ = md_file.write_text(content, encoding="utf-8")
        print(f"{md_file.name}: resolved triage variables")


def stamp_opencode_json(out_dir: Path, global_model: str) -> None:
    """Stamp the model field in out/<variant>/opencode.json."""
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


def stamp_bash_permissions(
    agents_dir: Path,
    permissions_dir: Path,
    variant: str,
) -> None:
    """Stamp {{BASH_PERMISSIONS}} in agent files.

    For variant="host": reads src/permissions/host/<agent_stem>.yaml and injects
    the bash: block content (indented 2 spaces for the key, 4 for entries).

    For variant="sandbox": reads src/permissions/sandbox.yaml and stamps ALL
    agents with the same content.
    """
    if variant == "sandbox":
        sandbox_perm_file = permissions_dir / "sandbox.yaml"
        if not sandbox_perm_file.is_file():
            print(
                f"Warning: sandbox.yaml not found at {sandbox_perm_file}, "
                "skipping bash permission stamp",
                file=sys.stderr,
            )
            return
        sandbox_block = _build_bash_block(sandbox_perm_file)

    for agent_file in sorted(agents_dir.glob("*.md")):
        agent_name = agent_file.stem
        content = agent_file.read_text(encoding="utf-8")

        if "{{BASH_PERMISSIONS}}" not in content:
            print(f"{agent_name}: no {{{{BASH_PERMISSIONS}}}} placeholder, skipping")
            continue

        if variant == "host":
            host_perm_file = permissions_dir / "host" / f"{agent_name}.yaml"
            if not host_perm_file.is_file():
                print(
                    f"Warning: {host_perm_file} not found, "
                    f"skipping bash permissions for {agent_name}",
                    file=sys.stderr,
                )
                continue
            baseline_file = permissions_dir / "host" / "_baseline.yaml"
            bash_block = _build_bash_block(host_perm_file, baseline_file=baseline_file)
        else:
            bash_block = sandbox_block  # type: ignore[possibly-undefined]

        # Find the placeholder line to detect its leading whitespace
        lines = content.splitlines(keepends=True)
        new_lines: list[str] = []
        for line in lines:
            stripped = line.rstrip("\n")
            if "{{BASH_PERMISSIONS}}" in stripped:
                # Inject the bash block in place of the placeholder
                new_lines.append(bash_block + "\n")
            else:
                new_lines.append(line)

        new_content = "".join(new_lines)
        _ = agent_file.write_text(new_content, encoding="utf-8")
        print(f"{agent_name}: stamped bash permissions ({variant})")


def _build_bash_block(perm_file: Path, baseline_file: Path | None = None) -> str:
    """Read a permissions YAML file and return the indented block for frontmatter.

    The permissions file has `bash:` at root level (no indent). When injected
    into agent frontmatter (under `permission:`), the `bash:` key is indented
    2 spaces and all entries are indented 4 spaces.

    If baseline_file is provided and exists, its bash: entries are prepended
    before the agent-specific entries from perm_file.
    """

    def _extract_bash_entries(path: Path) -> list[str]:
        raw = path.read_text(encoding="utf-8")
        lines = raw.splitlines()
        entries: list[str] = []
        in_bash = False
        for line in lines:
            if line.startswith("bash:"):
                in_bash = True
                continue
            if in_bash:
                if line == "" or line.startswith(" ") or line.startswith("\t"):
                    # Entry line — add 2 more spaces of indent (4 total)
                    entries.append("  " + line)
                else:
                    # New top-level key — stop
                    break
        return entries

    result_lines: list[str] = ["  bash:"]

    if baseline_file is not None:
        if not baseline_file.is_file():
            print(
                f"Warning: baseline permission file not found: {baseline_file}. "
                "Agents will be missing the read-only baseline (no '\"*\": deny').",
                file=sys.stderr,
            )
        else:
            result_lines.extend(_extract_bash_entries(baseline_file))

    result_lines.extend(_extract_bash_entries(perm_file))

    return "\n".join(result_lines)


def stamp_external_dirs(agents_dir: Path, ext_dirs: list[str], variant: str) -> None:
    """Stamp the external_directory block in all agent frontmatter.

    For variant="host": existing behavior (stamp from build.json).
    For variant="sandbox": remove the external_directory block entirely.
    """
    if variant == "host":
        canonical: list[str] = ["  external_directory:"]
        for d in ext_dirs:
            canonical.append(f'    "{d}": allow')
    else:
        canonical = []  # sandbox: no external_directory restrictions

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

        if not found and variant == "host":
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


def convert_ask_to_allow(agents_dir: Path) -> None:
    """Convert ': ask' to ': allow' in sandbox agent frontmatter.

    This removes any interactive prompts that might appear in frontmatter
    (e.g., from planner's 'ask' rules being copied into sandbox build).
    """
    count = 0
    for agent_file in sorted(agents_dir.glob("*.md")):
        content = agent_file.read_text(encoding="utf-8")
        parsed = extract_frontmatter(content)
        if parsed is None:
            continue
        fm_str, rest = parsed
        if ": ask" not in fm_str:
            continue
        # Only replace within frontmatter
        new_fm_str = fm_str.replace(": ask", ": allow")
        new_content = rebuild_content(new_fm_str.splitlines(), rest)
        _ = agent_file.write_text(new_content, encoding="utf-8")
        print(f"  {agent_file.name}: converted 'ask' → 'allow'")
        count += 1
    if count:
        print(f"  {count} agent file(s) converted ask→allow.")
    else:
        print("  No 'ask' rules found in sandbox agents.")


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


def build(
    config: dict[str, Any],
    config_dir_value: str = "",
    sandbox_config_dir_value: str | None = None,
) -> Path:
    """Full build: copy src/ → out/host/ and out/sandbox/, apply all stamps.

    Returns the out/ root directory path.

    Args:
        config: Loaded build.json dict.
        config_dir_value: Value to substitute for {{CONFIG_DIR}} in host agent
                          files. If empty, uses OPENCODE_CONFIG_SRC env var,
                          falling back to the default ~/.config/opencode.
        sandbox_config_dir_value: Value to substitute for {{CONFIG_DIR}} in
                                  sandbox agent files. If None, falls back to
                                  build.json global.sandbox_config_dir, then
                                  /root/.config/opencode (container path).
    """
    import os

    if not config_dir_value:
        config_dir_value = os.environ.get(
            "OPENCODE_CONFIG_SRC", str(Path.home() / ".config" / "opencode")
        )

    # Allow override from build.json global.sandbox_config_dir
    global_section = dict(config["global"])
    global_model: str = str(global_section["model"])
    ext_dirs: list[str] = list(global_section["external_directory"])
    if sandbox_config_dir_value is None:
        sandbox_config_dir_value = str(
            global_section.get("sandbox_config_dir", "/root/.config/opencode")
        )

    permissions_dir = SRC_DIR / "permissions"

    # Remove old out/ root if it exists (flat/legacy layout)
    old_out = REPO_ROOT / "out"
    # We'll build into out/host/ and out/sandbox/
    out_host = old_out / "host"
    out_sandbox = old_out / "sandbox"

    # --- Build host variant ---
    print("=" * 60)
    print("Building host variant → out/host/")
    print("=" * 60)

    copy_src_to_out(SRC_DIR, out_host)
    agents_dir_host = out_host / "agents"
    duplicate_implementor(agents_dir_host)
    resolve_mode_conditionals(agents_dir_host)
    resolve_includes(out_host, SRC_DIR)
    resolve_agent_vars(out_host)

    stamp_opencode_json(out_host, global_model)
    _ = stamp_agent_models(agents_dir_host, config)

    print("Stamping {{BASH_PERMISSIONS}} (host)...")
    stamp_bash_permissions(agents_dir_host, permissions_dir, "host")

    print("Stamping external_directory (host)...")
    stamp_external_dirs(agents_dir_host, ext_dirs, "host")

    print(f"Resolving {{{{CONFIG_DIR}}}} → {config_dir_value} in host agent files...")
    resolve_config_dir(agents_dir_host, config_dir_value)

    print()
    print("=" * 60)
    print("Building sandbox variant → out/sandbox/")
    print("=" * 60)

    copy_src_to_out(SRC_DIR, out_sandbox)
    agents_dir_sandbox = out_sandbox / "agents"
    duplicate_implementor(agents_dir_sandbox)
    resolve_mode_conditionals(agents_dir_sandbox)
    resolve_includes(out_sandbox, SRC_DIR)
    resolve_agent_vars(out_sandbox)

    stamp_opencode_json(out_sandbox, global_model)
    _ = stamp_agent_models(agents_dir_sandbox, config)

    print("Stamping {{BASH_PERMISSIONS}} (sandbox)...")
    stamp_bash_permissions(agents_dir_sandbox, permissions_dir, "sandbox")

    print("Removing external_directory restrictions (sandbox)...")
    stamp_external_dirs(agents_dir_sandbox, ext_dirs, "sandbox")

    print("Converting 'ask' → 'allow' in sandbox agents...")
    convert_ask_to_allow(agents_dir_sandbox)

    print(
        f"Resolving {{{{CONFIG_DIR}}}} → {sandbox_config_dir_value}"
        " in sandbox agent files..."
    )
    resolve_config_dir(agents_dir_sandbox, sandbox_config_dir_value)

    print()
    print(f"Done. Build output in {old_out}/")
    print(f"  Host:    {out_host}/")
    print(f"  Sandbox: {out_sandbox}/")
    return old_out


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build stamped config from src/ templates into out/host/ and out/sandbox/."
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
            "Value to substitute for {{CONFIG_DIR}} in host agent files."
            " Defaults to $OPENCODE_CONFIG_SRC or ~/.config/opencode."
        ),
    )
    _ = parser.add_argument(
        "--sandbox-config-dir",
        default=None,
        metavar="<path>",
        dest="sandbox_config_dir_value",
        help=(
            "Value to substitute for {{CONFIG_DIR}} in sandbox agent files."
            " Defaults to /root/.config/opencode."
        ),
    )
    args = parser.parse_args()

    config = ensure_config(reconfigure=bool(args.reconfigure))
    _ = build(
        config,
        config_dir_value=str(args.config_dir_value),
        sandbox_config_dir_value=args.sandbox_config_dir_value,
    )


if __name__ == "__main__":
    main()
