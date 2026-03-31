#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$SCRIPT_DIR/build.yaml"
OPENCODE_JSON="$SCRIPT_DIR/opencode.json"
AGENTS_DIR="$SCRIPT_DIR/agents"

# --- Step 1: Read global model from build.yaml ---
global_model=$(yq -r '.global.model' "$CONFIG")

# --- Step 2: Patch opencode.json ---
# Read current model from opencode.json
current_model=$(jq -r '.model' "$OPENCODE_JSON")
if [[ "$current_model" != "$global_model" ]]; then
	# Use jq to set .model, write to temp then move (atomic replace)
	jq --arg m "$global_model" '.model = $m' "$OPENCODE_JSON" >"$OPENCODE_JSON.tmp"
	mv "$OPENCODE_JSON.tmp" "$OPENCODE_JSON"
	echo "opencode.json: model $current_model → $global_model"
else
	echo "opencode.json: model already $global_model (no change)"
fi

# --- Step 3: Read external_directory paths from build.yaml ---
ext_dirs_json=$(yq -r '.global.external_directory | @json' "$CONFIG")

# --- Step 4: Process each agent file (model + external_directory) ---
for agent_file in "$AGENTS_DIR"/*.md; do
	agent_name=$(basename "$agent_file" .md)

	# Read the tier from frontmatter using Python (handles YAML front matter in Markdown)
	tier=$(
		python3 - "$agent_file" <<'EOF'
import sys, re
content = open(sys.argv[1]).read()
m = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
if not m:
    print("null")
    sys.exit(0)
import yaml
fm = yaml.safe_load(m.group(1))
print(fm.get("tier") or "null")
EOF
	)

	# --- 4a: Model assignment (requires tier) ---
	if [[ "$tier" == "null" || -z "$tier" ]]; then
		echo "$agent_name: no tier set, skipping model"
	else
		# Look up tier config in build.yaml
		tier_model=$(yq -r ".tiers.${tier}.model" "$CONFIG")

		# Get current model from agent frontmatter (may be "null" if not set)
		current_agent_model=$(
			python3 - "$agent_file" <<'EOF'
import sys, re
content = open(sys.argv[1]).read()
m = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
if not m:
    print("null")
    sys.exit(0)
import yaml
fm = yaml.safe_load(m.group(1))
val = fm.get("model")
print(val if val is not None else "null")
EOF
		)

		if [[ "$tier_model" == "null" ]]; then
			# Tier inherits global — remove model from frontmatter if present
			if [[ "$current_agent_model" != "null" ]]; then
				python3 - "$agent_file" <<EOF
import sys, re
path = "$agent_file"
content = open(path).read()
m = re.match(r'^(---\n)(.*?)(\n---)', content, re.DOTALL)
if not m:
    sys.exit(0)
import yaml
fm_str = m.group(2)
fm = yaml.safe_load(fm_str)
fm.pop("model", None)
import io
buf = io.StringIO()
# Reconstruct frontmatter preserving key order as best we can
lines = fm_str.splitlines()
new_lines = [l for l in lines if not l.startswith("model:")]
new_fm = "\n".join(new_lines)
new_content = "---\n" + new_fm + "\n---" + content[m.end():]
open(path, "w").write(new_content)
EOF
				echo "$agent_name (tier: $tier): removed model override (inherits global)"
			else
				echo "$agent_name (tier: $tier): no model override (no change)"
			fi
		else
			# Tier has an explicit model — set it in frontmatter
			if [[ "$current_agent_model" != "$tier_model" ]]; then
				python3 - "$agent_file" "$tier_model" <<'EOF'
import sys, re
path = sys.argv[1]
tier_model = sys.argv[2]
content = open(path).read()
m = re.match(r'^(---\n)(.*?)(\n---)', content, re.DOTALL)
if not m:
    sys.exit(0)
fm_str = m.group(2)
lines = fm_str.splitlines()
# Check if model line already exists
has_model = any(l.startswith("model:") for l in lines)
if has_model:
    new_lines = [("model: " + tier_model) if l.startswith("model:") else l for l in lines]
else:
    # Insert model after tier line
    new_lines = []
    for l in lines:
        new_lines.append(l)
        if l.startswith("tier:"):
            new_lines.append("model: " + tier_model)
new_fm = "\n".join(new_lines)
new_content = "---\n" + new_fm + "\n---" + content[m.end():]
open(path, "w").write(new_content)
EOF
				echo "$agent_name (tier: $tier): model → $tier_model"
			else
				echo "$agent_name (tier: $tier): model already $tier_model (no change)"
			fi
		fi
	fi

	# --- 4b: Stamp external_directory (all agents, regardless of tier) ---
	result=$(
		python3 - "$agent_file" "$ext_dirs_json" <<'PYEOF'
import sys, re, json

path = sys.argv[1]
ext_dirs = json.loads(sys.argv[2])

content = open(path).read()
m = re.match(r'^(---\n)(.*?)(\n---)', content, re.DOTALL)
if not m:
    print("no frontmatter")
    sys.exit(0)

fm_str = m.group(2)
lines = fm_str.splitlines()

# Build the canonical external_directory block
canonical = ["  external_directory:"]
for d in ext_dirs:
    canonical.append(f'    "{d}": allow')

# Find and replace the external_directory block
new_lines = []
skip = False
found = False

for line in lines:
    # Detect the external_directory key (2-space indent under permission:)
    if re.match(r'^  external_directory:\s*$', line):
        found = True
        skip = True
        new_lines.extend(canonical)
        continue
    # Skip child lines (4+ space indent) belonging to external_directory
    if skip:
        if re.match(r'^    ', line):
            continue
        else:
            skip = False
    new_lines.append(line)

if not found:
    # Insert before task: if present, otherwise at end of permission block
    insert_idx = len(new_lines)
    for i, line in enumerate(new_lines):
        if re.match(r'^  task:', line):
            insert_idx = i
            break
    new_lines = new_lines[:insert_idx] + canonical + new_lines[insert_idx:]

new_fm = "\n".join(new_lines)
new_content = "---\n" + new_fm + "\n---" + content[m.end():]

if new_content != content:
    open(path, "w").write(new_content)
    print("updated")
else:
    print("no change")
PYEOF
	)
	echo "$agent_name: external_directory $result"
done

echo ""
echo "Done. Model + external_directory config applied from build.yaml."
