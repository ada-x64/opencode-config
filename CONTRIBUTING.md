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
   - **Host variant:** resolves to the `CONFIG_DIR` from the build configuration.
   - **Sandbox variant:** resolves to `/data/config` (container path).

The script is idempotent — running it multiple times produces the same result.

```bash
bun run build                                    # build using existing build.json
bun run build -- --reconfigure                   # re-prompt for model config
bun run build -- --config-dir /path/to/config   # override host CONFIG_DIR
```

### `scripts/install.ts`

Deploys built output to the target config directories:

1. Validates the `--profile` name, then loads the profile using 2-level fallback
   (e.g. `src/profiles/gh/username.env` → `src/profiles/gh.env`) to determine
   `CONFIG_DIR`, `OPENCODE_CONFIG_SRC`, and `SANDBOX_CONFIG_DIR`.
2. Rsyncs `out/host/` contents to `CONFIG_DIR`.
3. Rsyncs `out/sandbox/` contents to `SANDBOX_CONFIG_DIR`.
4. Loads per-profile secrets and Docker user config from `profiles.toml`
   (see [Per-profile secrets](#per-profile-secrets-profilestoml) below).
5. Deploys the AoE global config from `src/aoe-config.toml`, resolving
   `{{AGENT_VAULT}}`, `{{SANDBOX_CONFIG_DIR}}`, and `{{OPENCODE_DATA_DIR}}`
   path placeholders.
6. For non-host profiles, deploys an AoE per-profile config from
   `src/aoe-profile.toml`, resolving path placeholders and per-profile
   secrets. Copies the profile's gitconfig (if configured) into the AoE
   profile directory.

```bash
bun run install-config                                              # host profile (default)
bun run install-config -- --profile gh/myuser                       # gh/* profile (SSH-prefer)
bun run install-config -- --config-dir /custom                      # override CONFIG_DIR
bun run install-config -- --profiles-config /path/to/profiles.toml  # custom profiles.toml
```

### `scripts/setup.ts`

Standalone bootstrapper for first-time installation. Downloads the release
tarball, prompts for environment paths, runs `build.ts` + `install.ts`, and
writes environment variables to the user's shell profile. See
[Getting Started in README.md](README.md#getting-started).

### Profiles

Profiles live in `src/profiles/` and are excluded from the build output.
Each is a shell-style `.env` file defining `CONFIG_DIR`, `OPENCODE_CONFIG_SRC`,
and `SANDBOX_CONFIG_DIR`.

| Profile         | Files                   | CONFIG_DIR               | SANDBOX_CONFIG_DIR               |
| --------------- | ----------------------- | ------------------------ | -------------------------------- |
| `host`          | `src/profiles/host.env` | `$HOME/.config/opencode` | `$HOME/.config/opencode-sandbox` |
| `gh/<username>` | `src/profiles/gh.env`   | `$HOME/.config/opencode` | `$HOME/.config/opencode-sandbox` |

#### Profile resolution

For slash-separated profile names like `gh/v-phoenixman`:

1. **`.env` lookup:** tries `src/profiles/gh/v-phoenixman.env` first, then
   falls back to `src/profiles/gh.env` (base for the `gh/*` family).

This allows per-user overrides while sharing a common base.

#### Per-profile secrets (`profiles.toml`)

The file `~/.config/opencode-config/profiles.toml` (TOML format, chmod 600)
stores per-profile secrets and Docker user config that are stamped into
deployed AoE configs. Override the location with `OCCONF_PROFILES` env var
or `--profiles-config` CLI flag. See `src/profiles/profiles.toml.example`
for the full format.

Resolution order for each secret key:

1. `profiles."<profile-name>"` section in `profiles.toml`
2. `[default]` section in `profiles.toml`
3. Key-specific fallback (`NTFY_TOPIC` → `$AGENT_VAULT/_misc/cache/ntfy-topic.txt`)
4. Omit — the entire line is removed from the deployed TOML

Supported keys:

| Key          | Description                                                                     |
| ------------ | ------------------------------------------------------------------------------- |
| `GH_TOKEN`   | GitHub personal access token for `gh` CLI                                       |
| `NTFY_TOPIC` | ntfy.sh topic for push notifications                                            |
| `gitconfig`  | Path to a gitconfig file on the host (mounted at `/etc/gitconfig` in container) |

Docker user fields (nested under `[profiles."<name>".docker]`):

| Field      | Maps to         | Default                 |
| ---------- | --------------- | ----------------------- |
| `username` | `SANDBOX_USER`  | _(none — runs as root)_ |
| `group`    | `SANDBOX_GROUP` | `agents`                |
| `uid`      | `SANDBOX_UID`   | `1000`                  |
| `gid`      | `SANDBOX_GID`   | `1000`                  |

When `SANDBOX_USER` is configured, the container entrypoint creates the
user/group and drops privileges via `gosu`. See
[Docker user support](#docker-user-support) below.

#### `gh/*` profile

The `gh/*` profile family is a GitHub-authenticated profile. The AoE profile
template automatically sets `mount_ssh = true` for `gh/*` profiles, mounting
the host SSH agent into the container. Configure per-profile tokens and git
identity in `profiles.toml`.

Usage:

```bash
bun run install-config -- --profile gh/myuser
```

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

AoE configuration uses a two-template system:

- **Global template** (`src/aoe-config.toml`) — deployed to
  `~/.config/agent-of-empires/config.toml`. Contains shared sandbox settings:
  image, resource limits, generic `/data/` mount paths for vault, sandbox
  config, and opencode data. No `environment` array — that's in the profile
  template.

- **Profile template** (`src/aoe-profile.toml`) — deployed to
  `~/.config/agent-of-empires/profiles/<name>/config.toml` for each non-host
  profile. Contains the `environment` array with per-profile secret
  placeholders (`{{GH_TOKEN}}`, `{{NTFY_TOPIC}}`, `{{SANDBOX_USER}}`, etc.),
  `mount_ssh` setting (auto-set based on profile family), and gitconfig
  volume mount. AoE merges profile config on top of global at runtime.

Profile names with `/` are converted to `-` for AoE directory names (e.g.
`gh/alice` → `gh-alice`). The `host` profile is special — no AoE profile is
deployed; only the global config is written.

Deployed AoE config files have mode `0o600` since they may contain tokens.

### Per-profile git configuration

Git configuration in containers is via a standard `.gitconfig` file rather
than `GIT_CONFIG_COUNT`/`KEY_N`/`VALUE_N` environment variables. When a
profile specifies `gitconfig = "/path/to/file"` in `profiles.toml`, the file
is copied into the AoE profile directory and mounted read-only at
`/etc/gitconfig` in the container. This supports the full range of git
configuration: user identity, signing keys, credential helpers, protocol
settings, and URL rewrites.

### Docker user support

When `SANDBOX_USER` is configured in `profiles.toml`, the container entrypoint
(`docker/entrypoint.sh`) creates the specified user/group and re-executes
the command via `gosu`. This prevents bind-mounted files from being owned
by root on the host. Without `SANDBOX_USER`, the container runs as root
for backward compatibility.

---

## Conventions

### Adding a new agent

1. Create `src/agents/<name>.md`.
2. Open the YAML frontmatter with `{{BASH_PERMISSIONS}}` as the placeholder in
   the `permission:` block (the build system stamps it per-variant).
3. Create `src/permissions/host/<name>.yaml` with the agent's bash permission
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
`src/permissions/host/_baseline.yaml`. When you add a command to the
global read-only list:

1. Add it to `src/opencode.json`.
2. Add it to `src/permissions/host/_baseline.yaml` (the shared baseline).
3. Run `bun run build` to rebuild `out/`.
4. Update the baseline table in the vault permission note.

The baseline is merged into every host agent at build time by
`_build_bash_block()`. Do **not** add baseline commands to individual
`src/permissions/host/<agent>.yaml` files — those contain only
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
