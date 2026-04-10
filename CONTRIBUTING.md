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
src/ ──build.ts──► out/host/    ──install.ts──► ~/.config/opencode
                                                  (or custom CONFIG_DIR)
               ├─► out/sandbox/ ──install.ts──► ~/.config/opencode-sandbox
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

On first run, if `build.json` does not exist, `build.ts` prompts interactively
for model configuration and writes the file. Use `--reconfigure` to re-prompt.

### Tier assignments

| Agent          | Tier      |
| -------------- | --------- |
| `@planner`     | `design`  |
| `@designer`    | `design`  |
| `@auditor`     | `design`  |
| `@implementor` | `execute` |
| `@reviewer`    | `execute` |

### `scripts/build.ts`

Copies `src/` to `out/host/` and `out/sandbox/` (excluding `profiles/`,
`permissions/`, `vault/`, and `_shared/` directories), then applies all stamps
to each variant:

1. Sets the `model` field in `out/<variant>/opencode.json` to `global.model`.
2. For each agent file, reads `tier` from frontmatter, looks up the tier in
   `build.json`, and sets or removes the `model` field accordingly.
3. Stamps `{{BASH_PERMISSIONS}}` in agent frontmatter from `src/permissions/`:
   - **Host variant:** reads `src/permissions/host/<agent>.json` for each agent.
     The `bash:` key is injected at 2-space indent; all entries at 4-space indent.
   - **Sandbox variant:** reads `src/permissions/sandbox.json` and stamps ALL
     agents with the same universal block (`"*": allow` + `gh api *` / `git push*`
     denies). Any remaining `ask` rules are converted to `allow`.
4. Stamps the `external_directory` block in all agent frontmatter:
   - **Host variant:** existing behavior (stamped from `build.json`).
   - **Sandbox variant:** removes the `external_directory:` block entirely
     (no path restrictions in containers).
5. Resolves `{{CONFIG_DIR}}` placeholders in agent files:
   - **Host variant:** resolves to the `CONFIG_DIR` from the build configuration.
   - **Sandbox variant:** resolves to `/root/.config/opencode` (container path).

The script is idempotent — running it multiple times produces the same result.

```bash
bun run build                                    # build using existing build.json
bun run build -- --reconfigure                   # re-prompt for model config
bun run build -- --config-dir /path/to/config   # override host CONFIG_DIR
```

### `scripts/install.ts`

Deploys built output to the target config directories:

1. Resolves `CONFIG_DIR` and `SANDBOX_CONFIG_DIR` from CLI flags, env vars,
   or defaults. Derives `OPENCODE_CONFIG_SRC` from the repository root.
2. Rsyncs `out/host/` contents to `CONFIG_DIR`.
3. Rsyncs `out/sandbox/` contents to `SANDBOX_CONFIG_DIR`.
4. Deploys the AoE global config from `src/aoe-config.toml`, resolving
   `{{AGENT_VAULT}}`, `{{SANDBOX_CONFIG_DIR}}`, and `{{OPENCODE_DATA_DIR}}`
   placeholders.
5. If `profiles.toml` doesn't exist, interactively generates one with defaults.
6. Deploys AoE per-profile configs for ALL profiles in `profiles.toml`,
   resolving per-profile secrets and Docker user settings.

```bash
bun run install-config                                              # defaults
bun run install-config -- --opencode-config-dir /custom/config     # override host config dir
bun run install-config -- --sandbox-config-dir /custom/sandbox     # override sandbox config dir
bun run install-config -- --profiles-config /custom/profiles.toml  # override profiles.toml path
```

Path resolution order: CLI flag → env var → default.

| Flag                      | Env var                | Default                          |
| ------------------------- | ---------------------- | -------------------------------- |
| `--opencode-config-dir`   | `OPENCODE_CONFIG_DIR`  | `~/.config/opencode`             |
| `--sandbox-config-dir`    | `SANDBOX_CONFIG_DIR`   | `~/.config/opencode-sandbox`     |
| `--profiles-config`       | `OCCONF_PROFILES`      | `~/.config/occonf/profiles.toml` |

### `scripts/setup.ts`

Standalone bootstrapper for first-time installation. Downloads the release
tarball, prompts for environment paths, runs `build.ts` + `install.ts`, and
writes environment variables to the user's shell profile. See
[Getting Started in README.md](README.md#getting-started).

### Profiles

Per-profile configuration lives in `profiles.toml` (default:
`~/.config/occonf/profiles.toml`). Each profile defines per-sandbox secrets
(GH_TOKEN, NTFY_TOPIC), gitconfig path, and Docker user settings. The install
script deploys AoE configs for ALL profiles listed in `profiles.toml`.

An example file is provided at `src/profiles/profiles.toml.example`. If no
`profiles.toml` exists at install time, the script offers to generate one
interactively (detecting GitHub username, GH_TOKEN, gitconfig, Docker UID/GID).

#### `gh/*` profile

The `gh/*` profile family differs from other profiles in the AoE sandbox config:

- `mount_ssh = true` — mounts the host SSH agent into the container
- Adds a git config `insteadOf` rule that rewrites `https://github.com/` URLs
  to `git@github.com:` so clones/fetches/pushes use SSH

The sandbox build variant (`out/sandbox/`) replaces the former `docker` profile.
The sandbox config is built with universal `allow` permissions (minus `gh api *`
and `git push*` denies) and no `external_directory` restrictions, then deployed
to `SANDBOX_CONFIG_DIR` and mounted into AoE containers.

### Changing models

1. Edit `build.json` (change a tier's model, or move an agent between tiers
   by editing its `tier:` frontmatter field in `src/agents/`).
2. Run `bun run build`.
3. Run `bun run install-config`.

---

## opencode.json

`src/opencode.json` is the core configuration template. It does two things:

1. **Sets the default model** — stamped by `build.ts` from `build.json`.
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

`src/aoe-config.toml` is the default AoE template. The `install.ts` script
deploys it to `~/.config/agent-of-empires/config.toml`, resolving
`{{AGENT_VAULT}}`, `{{SANDBOX_CONFIG_DIR}}`, and `{{OPENCODE_DATA_DIR}}`
placeholders. Per-profile configs are deployed from `src/aoe-profile.toml`
for each profile listed in `profiles.toml`. The config mounts
`$SANDBOX_CONFIG_DIR` (the pre-built sandbox config tree) into the container
at `/root/.config/opencode`, sets up: sandbox-by-default, custom image,
vault bind-mount (RW), credential passthrough (`GH_TOKEN`, `GIT_CONFIG_COUNT`),
and resource limits (4 CPU / 8 GB RAM).

---

## Conventions

### Adding a new agent

1. Create `src/agents/<name>.md`.
2. Open the YAML frontmatter with `{{BASH_PERMISSIONS}}` as the placeholder in
   the `permission:` block (the build system stamps it per-variant).
3. Create `src/permissions/host/<name>.json` with the agent's bash permission
   block starting with `"*": deny` then the allowed commands.
4. Write the system prompt in the Markdown body after the closing `---`.
5. Run `bun run build` to propagate `external_directory`, model,
   and bash permission stamps to the new agent.
6. Add the agent to the permission table in
   `notes/ada-x64/opencode-config/agent-permissions.md` in the vault.
7. Update [AGENTS.md](AGENTS.md) and `README.md`.

### Updating the global read-only baseline

The global read-only command list lives in `src/opencode.json` under
`permission.bash`. The shared agent bash baseline lives in
`src/permissions/host/_baseline.json`. When you add a command to the
global read-only list:

1. Add it to `src/opencode.json`.
2. Add it to `src/permissions/host/_baseline.json` (the shared baseline).
3. Run `bun run build` to rebuild `out/`.
4. Update the baseline table in the vault permission note.

The baseline is merged into every host agent at build time by
`_build_bash_block()`. Do **not** add baseline commands to individual
`src/permissions/host/<agent>.json` files — those contain only
agent-specific additions.

### Keeping vault and repo in sync

The vault and this repo evolve together. When you add or rename an agent:

- Update the vault note at `notes/ada-x64/opencode-config/agent-permissions.md`
- The vault's `AGENTS.md` (at `$AGENT_VAULT/AGENTS.md`) documents vault
  conventions independently — it is not the same document as `AGENTS.md` in
  this repo.

---

## CI

Three GitHub Actions workflows:

| Workflow    | Trigger                           | Purpose                                            |
| ----------- | --------------------------------- | -------------------------------------------------- |
| **Lint**    | Push/PR to `main`                 | shfmt, shellcheck, prettier, bun test              |
| **Release** | Tag push (`v*`) or manual         | Build tarball + publish to GitHub Releases         |
| **Docker**  | Push to `main` touching `docker/` | Build & push `cubething-occonf-sandbox` to ghcr.io |

Both CI and the local pre-push hook run `scripts/lint.sh`. To activate the
hook after cloning:

```bash
git config core.hooksPath .githooks
```
