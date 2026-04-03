# opencode-config — Repository Overview

This repository (`ada-x64/opencode-config`) is the opencode configuration for
this workstation. It defines AI models, operation modes, subagent personas,
skill libraries, and bash permission policies that govern every agent session.

Source templates live in `src/`. The build system stamps them with model
assignments and environment-specific values, producing deployable output in
`out/`. The output is then installed to `$OPENCODE_CONFIG_SRC` (typically
`~/.config/opencode`), where opencode loads it at startup.

---

## Repository Layout

```
opencode-config/
├── src/                       # Source templates (never modified by build)
│   ├── opencode.json          #   Core config: model, mode prompts
│   ├── aoe-config.toml        #   AoE sandbox config template
│   ├── agents/                #   Subagent definitions (7 agents)
│   │   ├── planner.md
│   │   ├── project-manager.md
│   │   ├── implementor.md
│   │   ├── auto-implementor.md
│   │   ├── reviewer.md
│   │   ├── designer.md
│   │   └── auto-auditor.md
│   ├── prompts/               #   Mode system prompts
│   │   ├── build.md
│   │   ├── plan.md
│   │   └── audit.md
│   ├── skills/                #   Loadable skill instruction sets
│   │   ├── lib/               #     Shared libraries (frontmatter.sh)
│   │   ├── archive/
│   │   ├── fleet-schemas/
│   │   ├── local-ci/
│   │   ├── repo-notes/
│   │   ├── reviews/
│   │   ├── schemas/
│   │   ├── vault/
│   │   ├── vault-cache/
│   │   ├── vault-gc/
│   │   ├── vault-init/
│   │   ├── vault-lint/
│   │   └── vault-triage/
│   ├── profiles/              #   Deployment profiles (excluded from out/)
│   │   ├── host.env           #     Standard Linux/WSL workstation
│   │   └── docker.env         #     Docker/AoE sandbox containers
│   └── images/                #   Notification icons (64x64 PNG)
├── scripts/                   # Build and install tooling (Python)
│   ├── build.py               #   src/ → out/ copy + stamping
│   ├── install.py             #   out/ → CONFIG_DIR rsync + AoE deploy
│   ├── setup.py               #   Standalone bootstrapper (curl|python3)
│   ├── lint.sh                #   Runs all CI lint checks locally
│   └── pyproject.toml         #   Python project metadata (PyPI packaging)
├── .githooks/                 # Git hooks (activate: git config core.hooksPath .githooks)
│   └── pre-push               #   Runs scripts/lint.sh before every push
├── out/                       # Build output (gitignored, never edit)
├── build.json                 # Model tier definitions (gitignored, per-machine)
├── docker/                    # Docker sandbox image
│   ├── Dockerfile             #   Ubuntu 24.04 + opencode + agent toolchain
│   └── .dockerignore
├── .github/workflows/         # CI
│   ├── lint.yml               #   shfmt, shellcheck, prettier, ruff, basedpyright
│   ├── release.yml            #   Tarball + PyPI publish on tag push
│   └── docker.yml             #   Build & push cubething-occonf-sandbox to ghcr.io
├── AGENTS.md                  # This file (loaded as system context)
└── README.md                  # Public-facing summary
```

---

## Build System

The build system uses a **src/ → out/ → install** pipeline. Source templates
in `src/` are never modified. All stamping happens on the copies in `out/`.

### Pipeline overview

```
src/ ──build.py──► out/ ──install.py──► ~/.config/opencode
                     ▲                          (or custom CONFIG_DIR)
              build.json
           (model tiers, external_directory)
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

Copies `src/` to `out/` (excluding `profiles/`), then applies all stamps:

1. Sets the `model` field in `out/opencode.json` to `global.model`.
2. For each agent file, reads `tier` from frontmatter, looks up the tier in
   `build.json`, and sets or removes the `model` field accordingly.
3. Stamps the `external_directory` block in all agent frontmatter.
4. Resolves `{{CONFIG_DIR}}` placeholders in agent files.

The script is idempotent — running it multiple times produces the same result.

```bash
python3 scripts/build.py                # build using existing build.json
python3 scripts/build.py --reconfigure  # re-prompt for model config
python3 scripts/build.py --config-dir /path/to/config  # override CONFIG_DIR
```

### `scripts/install.py`

Deploys built output to the target config directory:

1. Loads the selected profile (`src/profiles/<name>.env`) to determine
   `CONFIG_DIR` and `OPENCODE_CONFIG_SRC`.
2. Rsyncs `out/` contents to `CONFIG_DIR`.
3. Deploys the AoE config (resolving `{{AGENT_VAULT}}` and
   `{{OPENCODE_CONFIG_SRC}}` in `src/aoe-config.toml`).

```bash
python3 scripts/install.py                        # host profile (default)
python3 scripts/install.py --profile docker       # docker profile
python3 scripts/install.py --config-dir /custom   # override CONFIG_DIR
```

### `scripts/setup.py`

Standalone bootstrapper for first-time installation. Downloads the release
tarball, prompts for environment paths, runs `build.py` + `install.py`, and
writes environment variables to the user's shell profile. See
[Getting Started in README.md](README.md#getting-started).

### Profiles

Profiles live in `src/profiles/` and are excluded from the build output.
Each is a shell-style `.env` file defining `CONFIG_DIR` and
`OPENCODE_CONFIG_SRC`.

| Profile  | File                      | CONFIG_DIR               |
| -------- | ------------------------- | ------------------------ |
| `host`   | `src/profiles/host.env`   | `$HOME/.config/opencode` |
| `docker` | `src/profiles/docker.env` | `/root/.config/opencode` |

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

## Modes

Modes are interactive session contexts. Switch between them with the **Tab key**
in the opencode TUI. Each mode has its own system prompt and a distinct scope
of permitted actions.

| Mode      | Prompt file        | Purpose                                                                   |
| --------- | ------------------ | ------------------------------------------------------------------------- |
| **build** | `prompts/build.md` | Full tool access — file edits, commands, subagent dispatch                |
| **plan**  | `prompts/plan.md`  | Read-only exploration and schema authoring; no direct file edits          |
| **audit** | `prompts/audit.md` | Read-only quality analysis — orchestrates `@auto-auditor` and `@reviewer` |

### build mode

The default working mode. Has pre-approved `git add`, `git switch`,
`git checkout`; can dispatch any subagent. Commits and pushes always prompt
the user. Handles straightforward tasks directly; uses subagents for
structured workflow phases (plan → implement → review).

### plan mode

Restricted to reading and discussing. It cannot make file edits or run
state-mutating commands directly. Designed for the planning phase: explore
a codebase, discuss design, dispatch `@planner` to write a schema. When ready
to implement, the user switches to build mode (Tab).

### audit mode

Orchestrator for quality analysis. Does not run static analysis tools itself —
that is `@auto-auditor`'s job. Clarifies scope with the user, dispatches
`@auto-auditor`, and may additionally dispatch `@reviewer` for targeted diff
reviews. Does not modify repositories or create commits.

---

## Agents

Subagents are dispatched from within a session using the **Task tool**
(`@agentname`). Each agent is a Markdown file in `src/agents/` with a YAML
frontmatter block that declares its permissions, followed by its system prompt.

### Workflow roles

The seven agents map to distinct phases of the development workflow:

```
Plan ──────► Implement ──────► Review
  @planner    @implementor       @reviewer
  @project-manager  @auto-implementor
                                 @designer  (notes / design docs)
                                 @auto-auditor (quality audits)
```

### Agent reference

#### `@planner` — schema authoring

- **File:** `src/agents/planner.md`
- **Role:** Explores a codebase, discusses design with the user, writes an
  implementation schema to `$AGENT_VAULT/tasks/<owner>/<repo>/<task>/schema.md`,
  creates a GitHub issue, and links it into the schema.
- **Write access:** Full vault mutations (schemas and drafts); GitHub issue
  creation and project board adds (both require user approval via `ask`);
  `gh pr comment*` (ask — to cross-reference PRs when creating a related issue).
- **Does not:** Implement anything; write outside the vault.

#### `@project-manager` — issue lifecycle and project board

- **File:** `src/agents/project-manager.md`
- **Role:** Keeps GitHub project state and vault task state synchronized. Closes
  completed issues, manages milestones, moves project board items, maintains
  `$AGENT_VAULT/projects/<owner>/<repo>.md` status documents, and runs
  `vault-gc`/`vault-lint` as part of project cleanup.
- **Write access:** All `gh issue *`, `gh project *`, `gh label *`, and
  `gh api repos/*/milestones` mutations; `gh pr comment*`; `vault-gc` and
  `vault-lint` scripts.
- **Does not:** Edit source files; run any git write command; merge or close PRs;
  create or delete repositories; operate on repos not in the vault.

#### `@implementor` — manual schema execution

- **File:** `src/agents/implementor.md`
- **Role:** Executes a schema commit-group by commit-group, **pausing after
  each group** for user review before proceeding. Reads `CONTRIBUTING.md` at
  startup to learn project conventions. On startup: applies `in-progress` label
  and posts a start comment on the linked GitHub issue. On completion: removes
  `in-progress` label and posts a completion comment.
- **Write access:** Full repository edits, `git add`, `git switch`,
  `git checkout`, build/test tools, `fm_read`/`fm_write`, `gh issue edit`/`comment`,
  `curl`, `source`/`notify_triage`/`triage-dashboard.sh`.
- **Does not:** `git commit` (the user does that); push; skip approval gates.

#### `@auto-implementor` — autonomous schema execution

- **File:** `src/agents/auto-implementor.md`
- **Role:** Executes a schema **end-to-end without pausing**. After each commit
  group it stages, commits, then runs a bounded review loop (max 3 rounds of
  `@reviewer`). Escalations are recorded via the vault-triage skill. Sends push
  notifications at key milestones.
- **Write access:** Everything `@implementor` has, plus `git commit`,
  `git stash`, `gh pr comment*`.
- **Does not:** Push to remote (hard rule, no exceptions).
- **Review loop:** After each commit, up to 3 review rounds. If high+ findings
  persist after round 3, escalates and continues.

#### `@reviewer` — structured code review

- **File:** `src/agents/reviewer.md`
- **Role:** Reviews staged changes (`git diff --cached`) or the latest commit
  (`git show HEAD`). Every finding is tagged with severity
  (`nit/low/medium/high/critical`) and category
  (`bug/performance/design/types/maintenance/security/docs/testing/style`).
  Writes the structured review to `$AGENT_VAULT/tasks/<owner>/<repo>/<task>/review.md`.
- **Write access:** Write tool (for review file); `fm_read`/`fm_write`; can run
  the test/lint suite for verification.
- **Does not:** Run build tools; create PRs or issues; write outside the review file.

#### `@designer` — repo notes and design documents

- **File:** `src/agents/designer.md`
- **Role:** Explores repositories and produces written reference material:
  - Repo notes at `$AGENT_VAULT/repo-notes/<owner>/<repo>/`
  - Design documents at `$AGENT_VAULT/design/`
  - Work-in-progress drafts at `$AGENT_VAULT/draft/`
- **Write access:** Full vault mutations (Write/Edit tools, `mv`, `rm`, `mkdir`).
- **Does not:** Write schemas or reviews; run build tools; mutate git state.

#### `@auto-auditor` — headless quality audit

- **File:** `src/agents/auto-auditor.md`
- **Role:** Detects project language, runs all available static analysis tools
  (degrading gracefully when tools are absent), synthesises findings across
  Security/Testing/Architecture/Performance/Maintenance, and writes a structured
  audit report to `$AGENT_VAULT/audits/<owner>/<repo>/<date>-<label>.md`.
- **Write access:** Write tool and `yq`; a full suite of static analysis tools
  (Rust, Node, Python, cross-language).
- **Does not:** Run build/install tools; modify the repository; commit; push.

### Permission model

All agents use a **deny-override** pattern: the bash permission block opens
with `"*": deny` and then explicitly allows only the commands the agent needs.
This is the opposite of the global `opencode.json` list, which grants a wide
read-only baseline. The deny-override makes each agent's capabilities
independently auditable without cross-referencing the global config.

**Orchestrators vs. leaf agents:** `@planner` and `@auto-implementor` carry
`task: allow` and may dispatch subagents. All other agents (`@implementor`,
`@project-manager`, `@reviewer`, `@designer`, `@auto-auditor`) are **leaf agents** —
they have no `task:` permission and cannot spawn further subagents.

For full details — including the complete read-only baseline, the per-agent
write permission table, file-system scope restrictions, and instructions for
adding a new agent — see the vault note:

> `repo-notes/ada-x64/opencode-config/agent-permissions.md`

---

## Skills

Skills are **loadable instruction sets** injected into context on demand. They
are not loaded automatically — an agent uses the `skill` tool (or follows a
human prompt) to load one. Each skill lives in `src/skills/<name>/` with a
`SKILL.md` descriptor and optional helper scripts.

### How to load a skill

In any agent session, call the `skill` tool with the skill name:

```
skill("vault-triage")
```

The skill injects its `SKILL.md` content into the conversation, providing
detailed instructions and references to bundled scripts.

### Available skills

| Skill           | Directory                   | Purpose                                                             |
| --------------- | --------------------------- | ------------------------------------------------------------------- |
| `archive`       | `src/skills/archive/`       | Find and read archived schemas and reviews from the vault           |
| `fleet-schemas` | `src/skills/fleet-schemas/` | Find and read cross-repo (fleet) schemas                            |
| `local-ci`      | `src/skills/local-ci/`      | Run and debug GitHub Actions workflows locally via `gh act`         |
| `repo-notes`    | `src/skills/repo-notes/`    | Find and read repository reference notes from the vault             |
| `reviews`       | `src/skills/reviews/`       | Find and read code review files from the vault                      |
| `schemas`       | `src/skills/schemas/`       | Find and read implementation schemas; understand schema frontmatter |
| `vault`         | `src/skills/vault/`         | Cross-section vault search and repository lookup                    |
| `vault-cache`   | `src/skills/vault-cache/`   | Refresh the GitHub metadata cache (projects, milestones, labels)    |
| `vault-gc`      | `src/skills/vault-gc/`      | Archive completed schemas and reviews; supports `--dry-run`         |
| `vault-init`    | `src/skills/vault-init/`    | Initialize or verify the vault directory structure                  |
| `vault-lint`    | `src/skills/vault-lint/`    | Validate schemas and reviews against format templates               |
| `vault-triage`  | `src/skills/vault-triage/`  | Write triage entries, send push notifications, regenerate the inbox |

### Skills with bundled scripts

Some skills include executable scripts:

- `src/skills/lib/frontmatter.sh` — `fm_read`/`fm_write` helpers for YAML frontmatter
- `src/skills/local-ci/act.sh` — wrapper around `gh act` for local CI runs
- `src/skills/vault-cache/refresh.sh` — refresh the GitHub metadata cache
- `src/skills/vault-gc/gc.sh` — archive completed schemas and reviews
- `src/skills/vault-init/init.sh` — idempotent vault directory initializer
- `src/skills/vault-lint/lint.sh` — validate vault files against format templates
- `src/skills/vault-triage/notify.sh` — `notify_triage` bash function for push alerts
- `src/skills/vault-triage/triage-dashboard.sh` — generates `$AGENT_VAULT/triage-inbox.md`
- `src/skills/vault-triage/setup.sh` — one-time notification platform setup
- `src/skills/vault-triage/toast-handler.sh` — desktop toast notification handler

---

## Vault Integration

Agent work products (schemas, reviews, triage entries, audit reports, repo
notes, design documents) live in a **separate Obsidian vault** — not in this
repo. The vault is a git-tracked directory managed with Obsidian.

### Vault directory layout

```
$AGENT_VAULT/
├── tasks/
│   └── <owner>/<repo>/<task>/
│       ├── schema.md         # Implementation spec
│       ├── review.md         # Code review (review-2.md, etc.)
│       └── triage.md         # Triage entry (triage-2.md, etc.)
├── _misc/
│   ├── archive/
│   │   └── tasks/            # Completed/closed tasks
│   ├── cache/                # GitHub metadata cache
│   ├── templates/            # Format templates (schema, review, triage, audit, ...)
│   └── images/               # Notification icons and image assets
├── audits/
│   └── <owner>/<repo>/
│       └── <date>-<label>.md # Audit reports
├── repo-notes/
│   └── <owner>/<repo>/       # Reference documentation per repo
├── design/                   # Cross-cutting design documents
├── draft/                    # Work-in-progress staging area
├── projects/                 # Per-repo project status documents
├── triage-inbox.md           # Generated triage dashboard
└── AGENTS.md                 # Vault conventions document
```

### Vault access pattern

The vault is a plain directory of Markdown files with YAML frontmatter. Agents
access it directly via standard filesystem tools — no app needs to be running.

- **Read:** Read tool, `cat`, `find`, `rg`
- **Create/modify:** Write and Edit tools
- **Frontmatter:** `source "$OPENCODE_CONFIG_SRC/skills/lib/frontmatter.sh"` then
  `fm_read file.md "key"` / `fm_write file.md "key" "value"`
- **Move/rename:** `mv`
- **Delete:** `rm`
- **List:** `find "$AGENT_VAULT" -name "*.md"`

### Initializing the vault

If `$AGENT_VAULT` is unset or the vault directory is missing, load the
`vault-init` skill and run:

```bash
bash "$OPENCODE_CONFIG_SRC/skills/vault-init/init.sh"
```

The script is idempotent and safe to run multiple times.

---

## Workflow Phases

All non-trivial implementation work follows three sequential phases:

### Phase 1 — Plan

**Mode:** plan (or build mode via `@planner`)
**Agent:** `@planner`
**Output:** `$AGENT_VAULT/tasks/<owner>/<repo>/<task>/schema.md`, GitHub issue

The planner explores the codebase, discusses design with the user, and writes
a schema. The schema is a fully self-contained actionable spec organized into
commit groups (each with sub-tasks and a validation step). The planner stops
after writing the schema and waits for user approval before creating the issue.

### Phase 2 — Implement

**Mode:** build
**Agent:** `@implementor` (manual) or `@auto-implementor` (autonomous)

Choose based on how much oversight is needed:

- `@implementor` — pauses after each commit group; the user reviews and says
  "continue". Good for unfamiliar codebases, risky changes, or when the user
  wants granular control.
- `@auto-implementor` — runs end-to-end; uses a bounded review loop per commit
  group; escalates persistent problems via the vault-triage skill. Good for
  well-specified schemas in repos with good test coverage.

### Phase 3 — Review

**Mode:** build (or triggered automatically by `@auto-implementor`)
**Agent:** `@reviewer`

The reviewer examines staged changes or the latest commit and writes a
structured finding list with per-finding severity and category. In manual
mode the user explicitly requests the review; in auto mode the implementor
dispatches it automatically after each commit.

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
deploys it to `~/.config/agent-of-empires/config.toml`, resolving `{{AGENT_VAULT}}` and
`{{OPENCODE_CONFIG_SRC}}` placeholders. The config sets up: sandbox-by-default,
custom image, vault bind-mount (RW), credential passthrough (`GH_TOKEN`,
`GIT_CONFIG_COUNT`), and resource limits (4 CPU / 8 GB RAM).

---

## Conventions

### Adding a new agent

1. Create `src/agents/<name>.md`.
2. Open the YAML frontmatter with `"*": deny` as the first bash rule.
3. Copy the full read-only baseline from `src/agents/designer.md` (or any agent).
4. Add only the write permissions the new agent actually needs.
5. Write the system prompt in the Markdown body after the closing `---`.
6. Run `python3 scripts/build.py` to propagate `external_directory` and model
   stamps to the new agent.
7. Add the agent to the permission table in
   `repo-notes/ada-x64/opencode-config/agent-permissions.md` in the vault.
8. Update this file and `README.md`.

### Updating the global read-only baseline

The global read-only command list lives in `src/opencode.json` under
`permission.bash`. Every agent file duplicates this list in its own
frontmatter. When you add a command to the global list:

1. Add it to `src/opencode.json`.
2. Add it to the baseline block in **every** `src/agents/*.md` file.
3. Run `python3 scripts/build.py` to rebuild `out/`.
4. Update the baseline table in the vault permission note.

There is no inheritance — each file is independently authoritative.

### Keeping vault and repo in sync

The vault and this repo evolve together. When you add or rename an agent:

- Update the vault note at `repo-notes/ada-x64/opencode-config/agent-permissions.md`
- The vault's `AGENTS.md` (at `$AGENT_VAULT/AGENTS.md`) documents vault
  conventions independently — it is not the same document as this file.

### PR-Issue cross-reference

When an agent creates a GitHub issue that relates to an open PR, it must
immediately post a comment on the PR using the format:

```
Opened #<number> to track <short description>.
```

This applies to `@planner` (ask), `@project-manager` (allow), and
`@auto-implementor` (allow). `@reviewer` does not create issues and is
therefore exempt.

```bash
gh pr comment <pr-number> -R <owner>/<repo> --body "Opened #<issue-number> to track <short description>."
```

### Reading remote source code

When a repository is not cloned locally (not under `$AGENT_REPOS`), use the
GitHub API to browse it:

```bash
# List all files in a branch
gh api repos/<owner>/<repo>/git/trees/<branch>?recursive=1 -q '.tree[].path'

# Fetch a specific file
gh api repos/<owner>/<repo>/contents/<path> -q .content | base64 -d
```

### Notifications

Push notifications to phone/desktop are sent via ntfy.sh. The
`vault-triage/notify.sh` helper provides a `notify_triage` bash function.
The 6th argument is the icon name (e.g. `"implementor"`, `"reviewer"`,
`"auto-implementor"`) and the optional 7th argument is a semantic key that
`notify.sh` resolves to an emoji prefix (e.g. `"clean"` → 🟢, `"escalation"`
→ ❗). When the icon starts with `auto-` (e.g. `"auto-implementor"`), the
script strips the prefix for the PNG URL and prepends ⚙️ to the emoji
automatically. Full key table in `skills/vault-triage/SKILL.md`.

```bash
source "$OPENCODE_CONFIG_SRC/skills/vault-triage/notify.sh"
notify_triage activity "owner/repo/task" "Commit Group 2 Complete" "• All tests passing" "" "auto-implementor" "activity"
notify_triage escalation "owner/repo/task" "Review Loop Exhausted on Group 3" "• High findings persist" "" "auto-implementor" "escalation"
```

All 7 agents load the `vault-triage` skill after completing significant work,
write a triage entry, send a notification, and regenerate the inbox. These
three post-work steps are mandatory — see the skill's Write Mode instructions.

Notification priorities: escalation/design-question → high (audible);
activity/handoff → default (non-audible); run-summary → low (silent). All
calls fail silently if ntfy is not configured, so they never block agent work.

---

## CI

Three GitHub Actions workflows:

| Workflow    | Trigger                           | Purpose                                                     |
| ----------- | --------------------------------- | ----------------------------------------------------------- |
| **Lint**    | Push/PR to `main`                 | shfmt, shellcheck, prettier, ruff format/lint, basedpyright |
| **Release** | Tag push (`v*`) or manual         | Build tarball + wheel, publish to PyPI + GitHub Releases    |
| **Docker**  | Push to `main` touching `docker/` | Build & push `cubething-occonf-sandbox` to ghcr.io                  |

Both CI and the local pre-push hook run `scripts/lint.sh`. To activate the
hook after cloning:

```bash
git config core.hooksPath .githooks
```

---

## Environment Variable Reference

| Variable              | Required            | Description                                   | Fallback                                  |
| --------------------- | ------------------- | --------------------------------------------- | ----------------------------------------- |
| `OPENCODE_CONFIG_SRC` | No                  | Absolute path to the deployed opencode config | `$HOME/.config/opencode`                  |
| `AGENT_VAULT`         | Yes (for vault ops) | Absolute path to the Obsidian vault           | None — must be set                        |
| `AGENT_REPOS`         | Yes (for repo ops)  | Absolute path to local repo checkouts         | None — must be set                        |
| `NTFY_TOPIC`          | No                  | ntfy.sh topic for push notifications          | `$AGENT_VAULT/_misc/cache/ntfy-topic.txt` |

`AGENT_VAULT` and `AGENT_REPOS` are checked at the top of any agent session
that uses the vault or operates on a repository. The `vault-init` skill can
create and populate the vault directory if it does not yet exist.
