# agent-config

opencode configuration: models, modes, agents, prompts, skills, and permissions.

## Structure

```
opencode.json        # Model, mode prompts, and global bash permissions
agents/              # Subagent definitions (dispatched via Task tool)
prompts/             # Mode system prompts (build, plan, audit)
skills/              # Loadable skill instructions and scripts
images/              # Notification icons (64x64 PNG, served via raw.githubusercontent.com)
```

## Modes

Three modes, each with its own system prompt:

| Mode      | Prompt             | Description                                                         |
| --------- | ------------------ | ------------------------------------------------------------------- |
| **build** | `prompts/build.md` | Full tool access — file edits, commands, subagent dispatch          |
| **plan**  | `prompts/plan.md`  | Read-only exploration and schema authoring                          |
| **audit** | `prompts/audit.md` | Read-only quality analysis — tool dispatch and report orchestration |

Switch modes with the Tab key in the opencode TUI.

## Agents

Subagents dispatched via the Task tool. Each is defined in `agents/`:

| Agent               | File                         | Role                                                                                  |
| ------------------- | ---------------------------- | ------------------------------------------------------------------------------------- |
| `@planner`          | `agents/planner.md`          | Explores codebase, writes schemas, creates GitHub issues                              |
| `@project-manager`  | `agents/project-manager.md`  | GitHub issue lifecycle, project board ops, milestone management, vault project status |
| `@implementor`      | `agents/implementor.md`      | Executes schemas step-by-step with manual approval gates                              |
| `@auto-implementor` | `agents/auto-implementor.md` | Executes schemas autonomously with a bounded review loop                              |
| `@reviewer`         | `agents/reviewer.md`         | Structured code review; writes findings to the vault                                  |
| `@auto-auditor`     | `agents/auto-auditor.md`     | Headless audit agent — static analysis, coverage, vault report                        |

## Skills

Skills are loadable instruction sets injected into context on demand. Each lives
in `skills/<name>/` with a `SKILL.md` descriptor and optional scripts.

| Skill           | Purpose                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| `archive`       | Find and read archived schemas and reviews from the vault                   |
| `fleet-schemas` | Find and read cross-repo (fleet) schemas                                    |
| `local-ci`      | Run and debug GitHub Actions workflows locally via `gh act`                 |
| `repo-notes`    | Find and read repository reference notes                                    |
| `reviews`       | Find and read code review files                                             |
| `schemas`       | Find and read implementation schemas                                        |
| `vault`         | Cross-section vault search and repo lookup                                  |
| `vault-cache`   | Refresh GitHub metadata cache (projects, milestones, labels)                |
| `vault-gc`      | Archive completed schemas and reviews                                       |
| `vault-init`    | Initialize or verify the vault directory structure                          |
| `vault-lint`    | Validate schemas and reviews against format templates                       |
| `vault-triage`  | Generate triage dashboard; send push notifications for agent triage entries |

See `skills/vault-triage/README.md` for first-time notification setup.

## Vault

Agent work (schemas, reviews, triage, repo notes, design docs) lives in a
separate git-tracked Obsidian vault, path set via `$AGENT_VAULT`. See the
vault's `AGENTS.md` for conventions.

## Environment variables

| Variable | Description |
|----------|-------------|
| `OPENCODE_CONFIG_SRC` | Path to the opencode config source directory (defaults to `~/.config/opencode`) |
| `AGENT_VAULT` | Path to the agent vault (e.g. `~/obsidian/agent.obs`) |
| `AGENT_REPOS` | Path to local repository checkouts (e.g. `~/repos`) |
| `NTFY_TOPIC` | ntfy.sh topic for push notifications (optional; falls back to `$AGENT_VAULT/_misc/cache/ntfy-topic.txt`) |

## Installation

Use `install.sh` to deploy config files from a repo checkout to the opencode config directory:

```bash
# Clone the repo somewhere outside ~/.config/opencode
git clone https://github.com/ada-x64/opencode-config.git ~/repos/ada-x64/opencode-config

# Deploy using the host profile (targets ~/.config/opencode by default)
bash ~/repos/ada-x64/opencode-config/install.sh --profile host

# Deploy to a custom directory
bash ~/repos/ada-x64/opencode-config/install.sh --profile host --config-dir /path/to/config
```

The install script:
1. Copies repo files to the target config directory (rsync, excluding `.git/`, `profiles/`, `install.sh`)
2. Resolves `{{CONFIG_DIR}}` placeholders in agent bash permission patterns
3. Runs `build.sh` in the target directory for model + `external_directory` stamping

Profiles are in `profiles/`:
- `host.env` — standard Linux/WSL workstation (`CONFIG_DIR="$HOME/.config/opencode"`)
- `docker.env` — Docker containers (`CONFIG_DIR="/root/.config/opencode"`)

Set `OPENCODE_CONFIG_SRC` to the repo checkout path so agents can reference skill scripts at runtime:

```bash
export OPENCODE_CONFIG_SRC="$HOME/repos/ada-x64/opencode-config"
```

## Docker Sandbox

Agent sessions run in isolated Docker containers via [Agent of Empires](https://github.com/njbrake/agent-of-empires) (AoE). The `docker/` directory contains the sandbox configuration:

```
docker/
├── Dockerfile           # Custom Ubuntu 24.04 image with opencode + agent toolchain
├── .dockerignore        # Build context filter
└── aoe-config.toml      # AoE config template (deploy to ~/.config/aoe/config.toml)
```

### Building the image

```bash
docker build -t opencode-sandbox:latest "$OPENCODE_CONFIG_SRC/docker/"
```

### AoE config

`docker/aoe-config.toml` is a versioned template. Deploy it to the AoE config directory:

```bash
# Copy (one-time):
cp "$OPENCODE_CONFIG_SRC/docker/aoe-config.toml" ~/.config/aoe/config.toml

# Or symlink (auto-updates on pull):
ln -sf "$OPENCODE_CONFIG_SRC/docker/aoe-config.toml" ~/.config/aoe/config.toml
```

The config sets up: sandbox-by-default, custom image, vault bind-mount (RW), credential passthrough (`GH_TOKEN`, `GIT_CONFIG_COUNT`), and resource limits (4 CPU / 8 GB RAM).

Requires host env vars:

| Variable | Setup |
|----------|-------|
| `GH_TOKEN` | `export GH_TOKEN=$(gh auth token 2>/dev/null)` |
| `NTFY_TOPIC` | ntfy.sh topic for push notifications |
