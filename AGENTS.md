# opencode-config — Repository Overview

This repository (`ada-x64/opencode-config`, living at `~/.config/opencode`) is
the opencode configuration for this workstation. It defines the AI models,
operation modes, subagent personas, skill libraries, and bash permission
policies that govern every agent session.

Everything here is loaded automatically by opencode at startup. Changing a
file in this repo immediately changes the behaviour of the next session.
Model configuration is managed via `build.yaml` + `build.sh` (see
[Build System](#build-system)).

---

## Repository Layout

```
~/.config/opencode/
├── opencode.json          # Core config: model, mode prompts, global bash permissions
├── build.yaml             # Model tier definitions (source of truth for model assignment)
├── build.sh               # Applies build.yaml → opencode.json + agent frontmatter
├── package.json           # Node dependency (@opencode-ai/plugin)
├── agents/                # Subagent definitions (dispatched via Task tool)
│   ├── planner.md
│   ├── project-manager.md
│   ├── implementor.md
│   ├── auto-implementor.md
│   ├── reviewer.md
│   ├── designer.md
│   └── auto-auditor.md
├── prompts/               # Mode system prompts (build, plan, audit)
│   ├── build.md
│   ├── plan.md
│   └── audit.md
├── skills/                # Loadable skill instruction sets
│   ├── archive/
│   ├── fleet-schemas/
│   ├── local-ci/
│   ├── repo-notes/
│   ├── reviews/
│   ├── schemas/
│   ├── vault/
│   ├── vault-cache/
│   ├── vault-gc/
│   ├── vault-init/
│   ├── vault-lint/
│   └── vault-triage/
├── AGENTS.md              # This file
└── README.md              # Short public summary
```

---

## opencode.json

`opencode.json` is the root configuration file. It does three things:

1. **Sets the default model** — currently `github-copilot/claude-opus-4.6` (managed by `build.sh`; do not edit by hand).
2. **Registers mode prompts** — each mode name (`build`, `plan`, `audit`) maps
   to a system prompt file via `{file:./prompts/<name>.md}`.
3. **Defines the global bash permission list** — a broad set of read-only
   commands that are pre-approved for interactive sessions. Subagents override
   this with a deny-first policy (see [Agents](#agents) below).

The `@opencode-ai/plugin` package (`package.json`) provides the opencode plugin
interface; `bun.lock` pins the exact version.

---

## Build System

Model assignment is managed declaratively via `build.yaml` and applied by
`build.sh`. Do not edit model fields in `opencode.json` or agent frontmatter
by hand — the build script will overwrite manual changes.

### `build.yaml`

Defines two model tiers:

| Tier | Model | Inherits global? |
|------|-------|-----------------|
| `design` | `github-copilot/claude-opus-4.6` | Yes (no `model` override in agent frontmatter) |
| `execute` | `github-copilot/claude-sonnet-4.6` | No (explicit `model` override) |

Each agent declares its tier via a `tier:` field in its YAML frontmatter.

### Tier assignments

| Agent | Tier |
|-------|------|
| `@planner` | `design` |
| `@designer` | `design` |
| `@auto-auditor` | `design` |
| `@implementor` | `execute` |
| `@auto-implementor` | `execute` |
| `@reviewer` | `execute` |

### `build.sh`

Reads `build.yaml` and:
1. Sets the `model` field in `opencode.json` to `global.model`.
2. For each agent file, reads its `tier` from frontmatter, looks up the tier
   in `build.yaml`, and sets or removes the `model` field accordingly.
3. Prints a summary of changes.

The script is idempotent — running it multiple times produces the same result.

### Changing models

1. Edit `build.yaml` (change a tier's model, or move an agent between tiers by editing its `tier:` frontmatter field).
2. Run `./build.sh`.
3. Commit the resulting changes.

---

## Modes

Modes are interactive session contexts. Switch between them with the **Tab key**
in the opencode TUI. Each mode has its own system prompt and a distinct scope
of permitted actions.

| Mode | Prompt file | Purpose |
|------|-------------|---------|
| **build** | `prompts/build.md` | Full tool access — file edits, commands, subagent dispatch |
| **plan** | `prompts/plan.md` | Read-only exploration and schema authoring; no direct file edits |
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
(`@agentname`). Each agent is a Markdown file in `agents/` with a YAML
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
- **File:** `agents/planner.md`
- **Role:** Explores a codebase, discusses design with the user, writes an
  implementation schema to `$AGENT_VAULT/tasks/<owner>/<repo>/<task>/schema.md`,
  creates a GitHub issue, and links it into the schema.
- **Write access:** Full vault mutations (schemas and drafts); GitHub issue
  creation and project board adds (both require user approval via `ask`);
  `gh pr comment*` (ask — to cross-reference PRs when creating a related issue).
- **Does not:** Implement anything; write outside the vault.

#### `@project-manager` — issue lifecycle and project board
- **File:** `agents/project-manager.md`
- **Role:** Keeps GitHub project state and vault task state synchronized. Closes completed issues, manages milestones, moves project board items, maintains `$AGENT_VAULT/projects/<owner>/<repo>.md` status documents, and runs `vault-gc`/`vault-lint` as part of project cleanup.
- **Write access:** All `gh issue *`, `gh project *`, `gh label *`, and `gh api repos/*/milestones` mutations; `gh pr comment*` (to cross-reference PRs when creating related issues); `obsidian` CLI for vault writes; `vault-gc` and `vault-lint` scripts directly.
- **Does not:** Edit source files; run any git write command; merge or close PRs; create or delete repositories; operate on repos not in the vault.
- **Modes:** Interactive (bulk-confirm) and status-sync. See `agents/project-manager.md` for full documentation.

#### `@implementor` — manual schema execution
- **File:** `agents/implementor.md`
- **Role:** Executes a schema commit-group by commit-group, **pausing after
  each group** for user review before proceeding. Reads `CONTRIBUTING.md` at
  startup to learn project conventions. On startup: applies `in-progress` label
  and posts a start comment on the linked GitHub issue. On completion: removes
  `in-progress` label and posts a completion comment.
- **Write access:** Full repository edits, `git add`, `git switch`,
  `git checkout`, build/test tools, `fm_read`/`fm_write` (frontmatter helpers for schema/review status updates),
  `gh issue edit`/`comment` (label transitions and issue comments), `curl`
  (for notify.sh), `source`/`notify_triage`/`triage-dashboard.sh` (for triage).
- **Does not:** `git commit` (the user does that); push; skip approval gates;
  apply `review-ready` label (that is manual/PM-agent only).

#### `@auto-implementor` — autonomous schema execution
- **File:** `agents/auto-implementor.md`
- **Role:** Executes a schema **end-to-end without pausing**. After each commit
  group it stages, commits, then runs a bounded review loop (max 3 rounds of
  `@reviewer`). Escalations and design-question decisions are recorded directly
  via the vault-triage skill. Sends push notifications at key milestones. On
  startup: applies `in-progress` label and posts a start comment on the linked
  GitHub issue. On completion: removes `in-progress` label and posts a
  completion comment.
- **Write access:** Everything `@implementor` has, plus `git commit`,
  `git stash`, `gh pr comment*` (allow — to cross-reference PRs when an escalation creates an issue).
- **Does not:** Push to remote (hard rule, no exceptions); apply `review-ready`
  label (manual/PM only).
- **Review loop:** After each commit, runs up to 3 review rounds. If high+
  findings persist after round 3, escalates via the vault-triage skill and
  continues — it never stops the run.

#### `@reviewer` — structured code review
- **File:** `agents/reviewer.md`
- **Role:** Reviews staged changes (`git diff --cached`) or the latest commit
  (`git show HEAD`). Every finding is tagged with severity
  (`nit/low/medium/high/critical`) and category
  (`bug/performance/design/types/maintenance/security/docs/testing/style`).
  Writes the structured review to `$AGENT_VAULT/tasks/<owner>/<repo>/<task>/review.md`.
- **Write access:** Write tool (for review file); `fm_read`/`fm_write` (frontmatter helpers for review status updates); can run the test/lint suite
  (`cargo test/clippy`, `pytest`, `jest`, `vitest`, `tsc`) for verification;
  `curl`, `source`/`notify_triage`/`triage-dashboard.sh` (for triage).
- **Does not:** Run build tools; create PRs or issues; write outside the review file.

#### `@designer` — repo notes and design documents
- **File:** `agents/designer.md`
- **Role:** Explores repositories and produces written reference material:
  - Repo notes at `$AGENT_VAULT/repo-notes/<owner>/<repo>/`
  - Design documents at `$AGENT_VAULT/design/`
  - Work-in-progress drafts at `$AGENT_VAULT/draft/`
- **Write access:** Full vault mutations (Write/Edit tools, `mv`, `rm`, `mkdir`).
- **Does not:** Write schemas or reviews; run build tools; mutate git state.

#### `@auto-auditor` — headless quality audit
- **File:** `agents/auto-auditor.md`
- **Role:** Detects project language, runs all available static analysis tools
  (degrading gracefully when tools are absent), synthesises findings across
  Security/Testing/Architecture/Performance/Maintenance, and writes a structured
  audit report to `$AGENT_VAULT/audits/<owner>/<repo>/<date>-<label>.md`.
- **Write access:** Write tool and `yq` (for audit report frontmatter — plain YAML, not frontmatter syntax); a full
  suite of static analysis tools (Rust: `cargo clippy/audit/deny/llvm-cov`;
  Node: `npm/pnpm/yarn audit`, `eslint`, `tsc`, `jest`, `vitest`; Python:
  `pip-audit`, `ruff`, `mypy`, `bandit`, `pytest`; cross-language: `semgrep`,
  `trivy`); `curl`, `source`/`notify_triage`/`triage-dashboard.sh` (for triage).
- **Does not:** Run build/install tools; modify the repository; commit; push;
  get dispatched by implementor agents (only by audit mode or a human in
  build/plan mode).

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
human prompt) to load one. Each skill lives in `skills/<name>/` with a
`SKILL.md` descriptor and optional helper scripts.

### How to load a skill

In any agent session, call the `skill` tool with the skill name:

```
skill("vault-triage")
```

The skill injects its `SKILL.md` content into the conversation, providing
detailed instructions and references to bundled scripts.

### Available skills

| Skill | Directory | Purpose |
|-------|-----------|---------|
| `archive` | `skills/archive/` | Find and read archived schemas and reviews from the vault |
| `fleet-schemas` | `skills/fleet-schemas/` | Find and read cross-repo (fleet) schemas |
| `local-ci` | `skills/local-ci/` | Run and debug GitHub Actions workflows locally via `gh act` (includes `act.sh` wrapper) |
| `repo-notes` | `skills/repo-notes/` | Find and read repository reference notes from the vault |
| `reviews` | `skills/reviews/` | Find and read code review files from the vault |
| `schemas` | `skills/schemas/` | Find and read implementation schemas; understand schema frontmatter fields |
| `vault` | `skills/vault/` | Cross-section vault search and repository lookup |
| `vault-cache` | `skills/vault-cache/` | Refresh the GitHub metadata cache (projects, milestones, labels) |
| `vault-gc` | `skills/vault-gc/` | Archive completed schemas and reviews; supports `--dry-run` |
| `vault-init` | `skills/vault-init/` | Initialize or verify the vault directory structure; runs `init.sh` |
| `vault-lint` | `skills/vault-lint/` | Validate schemas and reviews against format templates |
| `vault-triage` | `skills/vault-triage/` | Full triage skill for all agents — write triage entries, send push notifications, regenerate the inbox. Load after any significant work. |

### Skills with bundled scripts

Some skills include executable scripts:

- `local-ci/act.sh` — wrapper around `gh act` for local CI runs
- `vault-init/init.sh` — idempotent vault directory initializer
- `vault-triage/notify.sh` — `notify_triage` bash function for push alerts
- `vault-triage/triage-dashboard.sh` — generates `$AGENT_VAULT/triage-inbox.md`
- `vault-triage/setup.sh` — one-time notification platform setup

---

## Vault Integration

Agent work products (schemas, reviews, triage entries, audit reports, repo
notes, design documents) live in a **separate Obsidian vault** — not in this
repo. The vault is a git-tracked directory managed with Obsidian.

### Environment variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `AGENT_VAULT` | Absolute path to the vault root | `~/obsidian/agent.obs` |
| `AGENT_REPOS` | Absolute path to local repo checkouts | `~/repos` |
| `NTFY_TOPIC` | ntfy.sh topic for push notifications (optional) | `my-topic-abc123` |

`NTFY_TOPIC` falls back to the value in `$AGENT_VAULT/cache/ntfy-topic.txt` if
the environment variable is not set.

### Vault directory layout

```
$AGENT_VAULT/
├── tasks/
│   └── <owner>/<repo>/<task>/
│       ├── schema.md         # Implementation spec
│       ├── review.md         # Code review (review-2.md, etc.)
│       └── triage.md         # Triage entry (triage-2.md, etc.)
├── archive/
│   └── tasks/                # Completed/closed tasks
├── audits/
│   └── <owner>/<repo>/
│       └── <date>-<label>.md # Audit reports
├── repo-notes/
│   └── <owner>/<repo>/       # Reference documentation per repo
├── design/                   # Cross-cutting design documents
├── draft/                    # Work-in-progress staging area
├── templates/                # Format templates (schema, review, triage, audit, ...)
├── cache/                    # GitHub metadata cache
├── triage-inbox.md           # Generated triage dashboard
└── AGENTS.md                 # Vault conventions document
```

### Vault access pattern

The vault is a plain directory of Markdown files with YAML frontmatter. Agents
access it directly via standard filesystem tools — no app needs to be running.

- **Read:** Read tool, `cat`, `find`, `rg` — standard file reads and searches
- **Create/modify:** Write and Edit tools — agents use these directly for vault file writes
- **Frontmatter:** `source ~/.config/opencode/skills/lib/frontmatter.sh` then `fm_read file.md "key"` to read; `fm_write file.md "key" "value"` to write
- **Move/rename:** `mv`
- **Delete:** `rm`
- **List:** `find "$AGENT_VAULT" -name "*.md"`

### Initializing the vault

If `$AGENT_VAULT` is unset or the vault directory is missing, load the
`vault-init` skill and run:

```bash
bash ~/.config/opencode/skills/vault-init/init.sh
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

## Conventions

### Adding a new agent

1. Create `agents/<name>.md`.
2. Open the YAML frontmatter with `"*": deny` as the first bash rule.
3. Copy the full read-only baseline from `agents/designer.md` (or any agent).
4. Add only the write permissions the new agent actually needs.
5. Add `external_directory` entries if the agent needs paths beyond `~/repos/`
   and `~/winhome/obsidian/agent.obs/`.
6. Write the system prompt in the Markdown body after the closing `---`.
7. Add the agent to the permission table in
   `repo-notes/ada-x64/opencode-config/agent-permissions.md` in the vault.
8. Update the `AGENTS.md` agent reference table above.

### Updating the global read-only baseline

The global read-only command list lives in `opencode.json` under
`permission.bash`. Every agent file duplicates this list in its own
frontmatter. When you add a command to the global list:

1. Add it to `opencode.json`.
2. Add it to the baseline block in **every** `agents/*.md` file.
3. Update the baseline table in the vault permission note.

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
therefore exempt. See the individual agent prompts for the exact insertion
point in each agent's workflow.

The CLI command to use:

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
`vault-triage/notify.sh` helper provides a `notify_triage` bash function:

```bash
source ~/.config/opencode/skills/vault-triage/notify.sh
notify_triage activity "owner/repo/task" "Commit group 2 complete — all tests passing"
notify_triage escalation "owner/repo/task" "Review loop exhausted on group 3"
```

All 7 agents load the `vault-triage` skill after completing significant work,
write a triage entry, send a notification, and regenerate the inbox. These
three post-work steps are mandatory — see the skill's Write Mode instructions.

Notification priorities: escalation/design-question → high (audible);
activity/handoff → default (non-audible); run-summary → low (silent). All
calls fail silently if ntfy is not configured, so they never block agent work.

---

## Environment Variable Reference

| Variable | Required | Description | Fallback |
|----------|----------|-------------|---------- |
| `AGENT_VAULT` | Yes (for vault ops) | Absolute path to the Obsidian vault | None — must be set |
| `AGENT_REPOS` | Yes (for repo ops) | Absolute path to local repo checkouts | None — must be set |
| `NTFY_TOPIC` | No | ntfy.sh topic for push notifications | `$AGENT_VAULT/cache/ntfy-topic.txt` |

Both path variables are checked at the top of any agent session that uses
the vault or operates on a repository. The `vault-init` skill can create and
populate the vault directory if it does not yet exist.
