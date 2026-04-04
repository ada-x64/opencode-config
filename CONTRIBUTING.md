# Contributing to opencode-config

This guide covers the build system, CI pipeline, Docker sandbox, and
contributor conventions for this repository. For agent and vault concepts
(modes, agents, skills, worktree conventions, environment variables), see
[AGENTS.md](AGENTS.md).

---

## Build System

The build system uses a **src/ → out/ → install** pipeline. Source templates
in `src/` are never modified. All stamping happens on the copies in `out/`.

### Pipeline overview

```
src/ ──build.py──► out/host/    ──install.py──► ~/.config/opencode
                                                  (or custom CONFIG_DIR)
               ├─► out/sandbox/ ──install.py──► ~/.config/opencode-sandbox
                     ▲                            (or SANDBOX_CONFIG_DIR)
               build.json
            (model tiers, external_directory)
            src/permissions/
            (bash permission blocks, per-variant)
```

### `build.json` (gitignored, per-machine)

Defines the global model, external directory allowlist, and two model tiers:

| Tier      | Model                              | Inherits global?                               |
| --------- | ---------------------------------- | ---------------------------------------------- |
| `design`  | _(null — inherits global)_         | Yes (no `model` override in agent frontmatter) |
| `execute` | `github-copilot/claude-sonnet-4.6` | No (explicit `model` override)                 |

Each agent declares its tier via a `tier:` field in its YAML frontmatter.

On first run, if `build.json` does not exist, `build.py` prompts interactively
for model configuration and writes the file. Use `--reconfigure` to re-prompt.

### Tier assignments

| Agent               | Tier      |
| ------------------- | --------- |
| `@planner`          | `design`  |
| `@designer`         | `design`  |
| `@auto-auditor`     | `design`  |
| `@implementor`      | `execute` |
| `@auto-implementor` | `execute` |
| `@reviewer`         | `execute` |

### `scripts/build.py`

Copies `src/` to `out/host/` and `out/sandbox/` (excluding `profiles/` and
`permissions/`), then applies all stamps to each variant:

1. Sets the `model` field in `out/<variant>/opencode.json` to `global.model`.
2. For each agent file, reads `tier` from frontmatter, looks up the tier in
   `build.json`, and sets or removes the `model` field accordingly.
3. Stamps `{{BASH_PERMISSIONS}}` in agent frontmatter from `src/permissions/`:
   - **Host variant:** reads `src/permissions/host/<agent>.yaml` for each agent.
     The `bash:` key is injected at 2-space indent; all entries at 4-space indent.
   - **Sandbox variant:** reads `src/permissions/sandbox.yaml` and stamps ALL
     agents with the same universal block (`"*": allow` + `gh api *` / `git push*`
     denies). Any remaining `ask` rules are converted to `allow`.
4. Stamps the `external_directory` block in all agent frontmatter:
   - **Host variant:** existing behavior (stamped from `build.json`).
   - **Sandbox variant:** removes the `external_directory:` block entirely
     (no path restrictions in containers).
5. Resolves `{{CONFIG_DIR}}` placeholders in agent files:
   - **Host variant:** resolves to `OPENCODE_CONFIG_SRC` value.
   - **Sandbox variant:** resolves to `/root/.config/opencode` (container path).

The script is idempotent — running it multiple times produces the same result.

```bash
python3 scripts/build.py                # build using existing build.json
python3 scripts/build.py --reconfigure  # re-prompt for model config
python3 scripts/build.py --config-dir /path/to/config  # override host CONFIG_DIR
```

### `scripts/install.py`

Deploys built output to the target config directories:

1. Loads the selected profile (`src/profiles/<name>.env`) to determine
   `CONFIG_DIR`, `OPENCODE_CONFIG_SRC`, and `SANDBOX_CONFIG_DIR`.
2. Rsyncs `out/host/` contents to `CONFIG_DIR`.
3. Rsyncs `out/sandbox/` contents to `SANDBOX_CONFIG_DIR`.
4. Deploys the AoE config (resolving `{{AGENT_VAULT}}`, `{{OPENCODE_CONFIG_SRC}}`,
   and `{{SANDBOX_CONFIG_DIR}}` in `src/aoe-config.toml`).

```bash
python3 scripts/install.py                        # host profile (default)
python3 scripts/install.py --config-dir /custom   # override CONFIG_DIR
```

### `scripts/setup.py`

Standalone bootstrapper for first-time installation. Downloads the release
tarball, prompts for environment paths, runs `build.py` + `install.py`, and
writes environment variables to the user's shell profile. See
[Getting Started in README.md](README.md#getting-started).

### Profiles

Profiles live in `src/profiles/` and are excluded from the build output.
Each is a shell-style `.env` file defining `CONFIG_DIR`, `OPENCODE_CONFIG_SRC`,
and `SANDBOX_CONFIG_DIR`.

| Profile | File                    | CONFIG_DIR               | SANDBOX_CONFIG_DIR               |
| ------- | ----------------------- | ------------------------ | -------------------------------- |
| `host`  | `src/profiles/host.env` | `$HOME/.config/opencode` | `$HOME/.config/opencode-sandbox` |

The sandbox build variant (`out/sandbox/`) replaces the former `docker` profile.
The sandbox config is built with universal `allow` permissions (minus `gh api *`
and `git push*` denies) and no `external_directory` restrictions, then deployed
to `SANDBOX_CONFIG_DIR` and mounted into AoE containers.

### Changing models

1. Edit `build.json` (change a tier's model, or move an agent between tiers
   by editing its `tier:` frontmatter field in `src/agents/`).
2. Run `python3 scripts/build.py`.
3. Run `python3 scripts/install.py`.

---

## opencode.json

`src/opencode.json` is the core configuration template. It does two things:

1. **Sets the default model** — stamped by `build.py` from `build.json`.
2. **Registers mode prompts** — each mode name (`build`, `plan`, `audit`) maps
   to a system prompt file via `{file:./prompts/<name>.md}`.

Do not edit the `model` field in `out/opencode.json` by hand — the build
script will overwrite it.

---

## Docker Sandbox

Agent sessions can run in isolated Docker containers via
[Agent of Empires](https://github.com/njbrake/agent-of-empires) (AoE).

### Image

The `docker/Dockerfile` builds an Ubuntu 24.04 image with the full agent
toolchain: opencode, gh CLI, Node.js, pnpm, bun, Rust, uv, ripgrep, yq.

```bash
docker build -t cubething-occonf-sandbox:latest docker/
```

The image is also published to `ghcr.io/ada-x64/cubething-occonf-sandbox:latest` via
the Docker workflow on pushes to `main` that touch `docker/`.

### AoE config

`src/aoe-config.toml` is a versioned template. The `install.py` script
deploys it to `~/.config/agent-of-empires/config.toml`, resolving `{{AGENT_VAULT}}`,
`{{OPENCODE_CONFIG_SRC}}`, and `{{SANDBOX_CONFIG_DIR}}` placeholders. The
config mounts `$SANDBOX_CONFIG_DIR` (the pre-built sandbox config tree) into
the container at `/root/.config/opencode`, sets up: sandbox-by-default,
custom image, vault bind-mount (RW), credential passthrough (`GH_TOKEN`,
`GIT_CONFIG_COUNT`), and resource limits (4 CPU / 8 GB RAM).

---

## Conventions

### Adding a new agent

1. Create `src/agents/<name>.md`.
2. Open the YAML frontmatter with `{{BASH_PERMISSIONS}}` as the placeholder in
   the `permission:` block (the build system stamps it per-variant).
3. Create `src/permissions/host/<name>.yaml` with the agent's bash permission
   block starting with `"*": deny` then the allowed commands.
4. Write the system prompt in the Markdown body after the closing `---`.
5. Run `python3 scripts/build.py` to propagate `external_directory`, model,
   and bash permission stamps to the new agent.
6. Add the agent to the permission table in
   `repo-notes/ada-x64/opencode-config/agent-permissions.md` in the vault.
7. Update [AGENTS.md](AGENTS.md) and `README.md`.

### Updating the global read-only baseline

The global read-only command list lives in `src/opencode.json` under
`permission.bash`. The shared agent bash baseline lives in
`src/permissions/host/_baseline.yaml`. When you add a command to the
global read-only list:

1. Add it to `src/opencode.json`.
2. Add it to `src/permissions/host/_baseline.yaml` (the shared baseline).
3. Run `python3 scripts/build.py` to rebuild `out/`.
4. Update the baseline table in the vault permission note.

The baseline is merged into every host agent at build time by
`_build_bash_block()`. Do **not** add baseline commands to individual
`src/permissions/host/<agent>.yaml` files — those contain only
agent-specific additions.

### Keeping vault and repo in sync

The vault and this repo evolve together. When you add or rename an agent:

- Update the vault note at `repo-notes/ada-x64/opencode-config/agent-permissions.md`
- The vault's `AGENTS.md` (at `$AGENT_VAULT/AGENTS.md`) documents vault
  conventions independently — it is not the same document as `AGENTS.md` in
  this repo.

---

## CI

Three GitHub Actions workflows:

| Workflow    | Trigger                           | Purpose                                                     |
| ----------- | --------------------------------- | ----------------------------------------------------------- |
| **Lint**    | Push/PR to `main`                 | shfmt, shellcheck, prettier, ruff format/lint, basedpyright |
| **Release** | Tag push (`v*`) or manual         | Build tarball + wheel, publish to PyPI + GitHub Releases    |
| **Docker**  | Push to `main` touching `docker/` | Build & push `cubething-occonf-sandbox` to ghcr.io          |

Both CI and the local pre-push hook run `scripts/lint.sh`. To activate the
hook after cloning:

```bash
git config core.hooksPath .githooks
```
