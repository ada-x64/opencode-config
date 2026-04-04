# opencode-config — Repository Overview

This repository (`ada-x64/opencode-config`) is the opencode configuration for
this workstation. It defines AI models, operation modes, subagent personas,
skill libraries, and bash permission policies that govern every agent session.

Source templates live in `src/`. The build system stamps them with model
assignments and environment-specific values, producing deployable output in
`out/`. The output is then installed to `$OPENCODE_CONFIG_SRC` (typically
`~/.config/opencode`), where opencode loads it at startup.

> For build system internals, CI, Docker sandbox, and contributor conventions,
> see [CONTRIBUTING.md](CONTRIBUTING.md).

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
│   │   ├── implementor.md     #   Shared source — build produces auto-implementor.md via mode conditionals
│   │   ├── reviewer.md
│   │   ├── designer.md
│   │   └── auto-auditor.md
│   ├── permissions/           #   Per-agent bash permission blocks
│   │   ├── host/              #     Per-agent YAML files for host variant
│   │   │   ├── auto-auditor.yaml
│   │   │   ├── designer.yaml
│   │   │   ├── implementor.yaml  #  Shared source — mode conditionals for manual/autonomous
│   │   │   ├── planner.yaml
│   │   │   ├── project-manager.yaml
│   │   │   └── reviewer.yaml
│   │   └── sandbox.yaml       #   Universal sandbox permissions (all agents)
│   ├── prompts/               #   Mode system prompts
│   │   ├── build.md
│   │   ├── plan.md
│   │   └── audit.md
│   ├── tools/                 #   Custom tools (TypeScript, wrapping skill scripts)
│   │   ├── _lib.ts
│   │   ├── fm_read.ts
│   │   ├── fm_write.ts
│   │   ├── wt_detect.ts
│   │   ├── wt_owner_repo.ts
│   │   ├── wt_switch_branch.ts
│   │   ├── wt_cleanup.ts
│   │   ├── notify_triage.ts
│   │   ├── triage_dashboard.ts
│   │   ├── vault_gc.ts
│   │   ├── vault_lint.ts
│   │   ├── vault_cache.ts
│   │   ├── vault_init.ts
│   │   ├── local_ci.ts
│   │   ├── session_notify.ts
│   │   ├── create_issue.ts
│   │   ├── create_pr.ts
│   │   ├── impl_startup.ts    #   Lifecycle: schema startup (deferred commands pattern)
│   │   └── impl_complete.ts   #   Lifecycle: schema completion (deferred commands pattern)
│   ├── skills/                #   Loadable skill instruction sets
│   │   ├── lib/               #     Shared libraries (frontmatter.sh, worktree.sh)
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
│   │   └── host.env           #     Standard Linux/WSL workstation
│   └── images/                #   Notification icons (64x64 PNG)
├── scripts/                   # Build and install tooling (Python)
│   ├── build.py               #   src/ → out/host/ + out/sandbox/ copy + stamping
│   ├── install.py             #   out/host/ → CONFIG_DIR + out/sandbox/ → SANDBOX_CONFIG_DIR rsync + AoE deploy
│   ├── setup.py               #   Standalone bootstrapper (curl|python3)
│   └── lint.sh                #   Runs all CI lint checks locally
├── pyproject.toml             # Python project metadata (PyPI packaging)
├── .githooks/                 # Git hooks (activate: git config core.hooksPath .githooks)
│   └── pre-push               #   Runs scripts/lint.sh before every push
├── out/                       # Build output (gitignored, never edit)
│   ├── host/                  #   Host variant — deployed to $OPENCODE_CONFIG_SRC
│   └── sandbox/               #   Sandbox variant — deployed to $SANDBOX_CONFIG_DIR
├── build.json                 # Model tier definitions (gitignored, per-machine)
├── docker/                    # Docker sandbox image
│   ├── Dockerfile             #   Ubuntu 24.04 + opencode + agent toolchain
│   └── .dockerignore
├── .github/workflows/         # CI
│   ├── lint.yml               #   shfmt, shellcheck, prettier, ruff, basedpyright
│   ├── release.yml            #   Tarball + PyPI publish on tag push
│   └── docker.yml             #   Build & push cubething-occonf-sandbox to ghcr.io
├── AGENTS.md                  # This file (loaded as system context)
├── CONTRIBUTING.md            # Build system, CI, Docker, and contributor conventions
└── README.md                  # Public-facing summary
```

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
- **Post-schema:** Archives source drafts from `$AGENT_VAULT/draft/` to `$AGENT_VAULT/_misc/archive/draft/` with a date prefix.
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

- **File:** `src/agents/implementor.md` (shared source with `@auto-implementor` via `{{#if MODE=...}}` conditionals)
- **Role:** Executes a schema commit-group by commit-group, **pausing after
  each group** for user review before proceeding. Reads `CONTRIBUTING.md` at
  startup to learn project conventions. Startup and completion sequences are
  handled by `impl_startup` and `impl_complete` lifecycle tools (deferred
  commands pattern — tools return gh commands as strings, agent runs them with
  bash `ask` permission prompting the user).
- **Write access:** Full repository edits, `git add`, `git switch`,
  `git checkout`, build/test tools. GitHub mutations (`gh issue edit`/`comment`,
  `gh pr comment`) require user approval (`ask`). Uses custom tools for
  frontmatter (`fm_read`/`fm_write`), worktree ops (`wt_detect`/`wt_switch_branch`),
  lifecycle (`impl_startup`/`impl_complete`), notifications
  (`notify_triage`/`triage_dashboard`), and issue creation (`create_issue`).
- **Does not:** `git commit` (the user does that); push; skip approval gates.

#### `@auto-implementor` — autonomous schema execution

- **File:** Built from `src/agents/implementor.md` (shared source with `{{#if MODE=autonomous}}` conditionals)
- **Role:** Executes a schema **end-to-end without pausing**. After each commit
  group it stages, commits, then runs a bounded review loop (max 3 rounds of
  `@reviewer`). Escalations are recorded via the vault-triage skill. Sends push
  notifications at key milestones. GitHub issue mutations are **deferred** —
  lifecycle tools (`impl_startup`/`impl_complete`) return commands as strings,
  the agent stores them, and includes them in its final output for the
  orchestrator to run.
- **Write access:** Everything `@implementor` has, plus `git commit`,
  `git stash`. GitHub PR comments (`gh pr comment*`) are direct (`allow`);
  issue mutations are deferred (no direct `gh issue` entries — inherits `deny`
  from baseline).
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

**Shared source files:** `@implementor` and `@auto-implementor` share a single
source file (`src/agents/implementor.md`) and a single permission file
(`src/permissions/host/implementor.yaml`). Build-time `{{#if MODE=...}}`
conditionals produce mode-specific output for each agent. The permission file
uses `ask` for manual mode's GitHub mutations and `allow`/omit for autonomous
mode (where issue mutations are deferred via lifecycle tools instead).

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

| Skill           | Directory                   | Purpose                                                                                      |
| --------------- | --------------------------- | -------------------------------------------------------------------------------------------- |
| `archive`       | `src/skills/archive/`       | Find and read archived schemas and reviews from the vault                                    |
| `fleet-schemas` | `src/skills/fleet-schemas/` | Find and read cross-repo (fleet) schemas                                                     |
| `gh-helpers`    | `src/skills/gh-helpers/`    | Create GitHub issues and PRs from schema files and commit history                            |
| `local-ci`      | `src/skills/local-ci/`      | Run and debug GitHub Actions workflows locally via `gh act`; use the `local_ci` tool         |
| `repo-notes`    | `src/skills/repo-notes/`    | Find and read repository reference notes from the vault                                      |
| `reviews`       | `src/skills/reviews/`       | Find and read code review files from the vault                                               |
| `schemas`       | `src/skills/schemas/`       | Find and read implementation schemas; understand schema frontmatter                          |
| `vault`         | `src/skills/vault/`         | Cross-section vault search and repository lookup                                             |
| `vault-cache`   | `src/skills/vault-cache/`   | Refresh the GitHub metadata cache (projects, milestones, labels); use the `vault_cache` tool |
| `vault-gc`      | `src/skills/vault-gc/`      | Archive completed schemas and reviews; supports `--dry-run`                                  |
| `vault-init`    | `src/skills/vault-init/`    | Initialize or verify the vault directory structure; use the `vault_init` tool                |
| `vault-lint`    | `src/skills/vault-lint/`    | Validate schemas and reviews against format templates                                        |
| `vault-triage`  | `src/skills/vault-triage/`  | Write triage entries, send push notifications, regenerate the inbox                          |

### Skills with bundled scripts

Some skills include executable scripts. Most agent-facing scripts are now
wrapped by **custom tools** in `src/tools/` — agents call the tool directly
instead of constructing bash commands. The underlying scripts remain unchanged
and are still used internally (tools shell out to them via `Bun.$`).

| Script                                        | Custom tool                                                    | Purpose                                |
| --------------------------------------------- | -------------------------------------------------------------- | -------------------------------------- |
| `src/skills/lib/frontmatter.sh`               | `fm_read`, `fm_write`                                          | YAML frontmatter read/write            |
| `src/skills/lib/worktree.sh`                  | `wt_detect`, `wt_owner_repo`, `wt_switch_branch`, `wt_cleanup` | Bare-repo worktree operations          |
| `src/skills/gh-helpers/create-issue.sh`       | `create_issue`                                                 | Create GitHub issue from schema        |
| `src/skills/gh-helpers/create-pr.sh`          | `create_pr`                                                    | Create PR from commit log              |
| `src/skills/vault-gc/gc.sh`                   | `vault_gc`                                                     | Archive completed schemas/reviews      |
| `src/skills/vault-lint/lint.sh`               | `vault_lint`                                                   | Validate vault files against templates |
| `src/skills/vault-triage/notify.sh`           | `notify_triage`                                                | Push notifications via ntfy            |
| `src/skills/vault-triage/triage-dashboard.sh` | `triage_dashboard`                                             | Regenerate `triage-inbox.md`           |
| `src/skills/vault-cache/refresh.sh`           | `vault_cache`                                                  | Refresh GitHub metadata cache          |
| `src/skills/vault-init/init.sh`               | `vault_init`                                                   | Initialize vault directory structure   |
| `src/skills/local-ci/act.sh`                  | `local_ci`                                                     | Run GitHub Actions workflows locally   |
| _(no script — standalone tool)_               | `session_notify`                                               | Send session-completion notification   |
| _(no script — standalone tool)_               | `impl_startup`                                                 | Schema startup (deferred commands)     |
| _(no script — standalone tool)_               | `impl_complete`                                                | Schema completion (deferred commands)  |

Scripts **not** wrapped by tools (invoked directly via bash):

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
- **Frontmatter:** `fm_read({ file: "path.md", key: "key" })` /
  `fm_write({ file: "path.md", key: "key", value: "value" })` custom tools
  (thin wrappers around `skills/lib/frontmatter.sh`)
- **Move/rename:** `mv`
- **Delete:** `rm`
- **List:** `find "$AGENT_VAULT" -name "*.md"`

### Initializing the vault

If `$AGENT_VAULT` is unset or the vault directory is missing, load the
`vault-init` skill and run:

```
vault_init({})
```

The tool (and the underlying script) is idempotent and safe to run multiple times.

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

## Bare Repo / Worktree Convention

Repositories under `$AGENT_REPOS` may use a **bare repo + worktree** layout
instead of a traditional `git clone`. This is the preferred repository format.

### Layout

```
$AGENT_REPOS/<owner>/<repo>/
├── .bare/                # Bare git repository (objects, refs, etc.)
├── .git                  # File containing "gitdir: .bare"
├── main/                 # Worktree for the main branch
├── feat/my-feature/      # Worktree for a feature branch
└── fix/bug-123/          # Worktree for a bugfix branch
```

Each branch lives in its own worktree directory. The `.git` at the repo root
is a **file** (not a directory) that points to `.bare`.

### Detection

Agents detect repo type by checking `.git`:

| `.git` is a…                              | Repo type  | Meaning                                  |
| ----------------------------------------- | ---------- | ---------------------------------------- |
| **Directory**                             | `clone`    | Traditional `git clone`                  |
| **File**                                  | `worktree` | Git worktree (part of a bare repo setup) |
| **Absent** (but `HEAD` + `refs/` present) | `bare`     | Bare repository root                     |
| **Absent**                                | `unknown`  | Not a git repository                     |

### Worktree library: `skills/lib/worktree.sh`

A shell library (parallel to `frontmatter.sh`) that provides four functions.
Each function is also available as a **custom tool** — agents call the tool
instead of sourcing the script and running bash commands.

| Function           | Custom tool        | Behaviour                                                                                        |
| ------------------ | ------------------ | ------------------------------------------------------------------------------------------------ |
| `wt_detect`        | `wt_detect`        | Prints `clone`, `worktree`, `bare`, or `unknown`                                                 |
| `wt_owner_repo`    | `wt_owner_repo`    | Prints `<owner>/<repo>` — always 2 path components after `$AGENT_REPOS`, regardless of depth     |
| `wt_switch_branch` | `wt_switch_branch` | Creates a new worktree (bare setup) or `git switch` (clone). Returns the working directory path. |
| `wt_cleanup`       | `wt_cleanup`       | Removes a worktree. Best-effort, never fails the caller.                                         |

**Tool invocation** (preferred):

```
wt_detect({ path: "/home/user/repos/owner/repo/main" })
wt_switch_branch({ repo_path: "/home/user/repos/owner/repo/main", branch: "feat/my-feature" })
```

**Direct bash** (still works, used internally by tools):

```bash
source "$OPENCODE_CONFIG_SRC/skills/lib/worktree.sh"
```

### Key rules for agents

1. **Always detect** — run `wt_detect` or check `.git` at startup when
   operating on a repository. Never assume a traditional clone.
2. **Use `wt_owner_repo`** for `<owner>/<repo>` derivation — never manually
   strip `$AGENT_REPOS/` with `sed`, as that breaks for worktree paths.
3. **Use `wt_switch_branch`** instead of `git switch` for branch operations.
   In a worktree setup this creates a new worktree at
   `<bare_root>/<branch>` and returns the new path. The caller must
   reassign: `repo_path="$(wt_switch_branch "$repo_path" "$branch")"`.
4. **One branch per worktree** — never use `git switch` inside a worktree
   to change its branch. Each worktree is pinned to one branch.
5. **Cleanup after merge** — after a branch is merged, the worktree can be
   removed with `wt_cleanup <path>`. Agents should suggest this to the user
   but never run it automatically.

### Permissions

With the custom tool conversion, worktree bash permissions (`source
*/lib/worktree.sh*`, `wt_detect *`, `wt_owner_repo *`, `wt_switch_branch *`,
`wt_cleanup *`) have been removed from agent permission files. Custom tools
execute via Bun and bypass bash permissions entirely.

Remaining bash permissions for worktree operations:

- All agents: `"git worktree list*": allow` (read-only)
- `@implementor` and `@auto-implementor`: additionally `"git worktree add*": allow` and `"git worktree remove*": allow`

---

---

## PR-Issue cross-reference

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

---

## Reading remote source code

When a repository is not cloned locally (not under `$AGENT_REPOS`), use the
GitHub API to browse it:

```bash
# List all files in a branch
gh api repos/<owner>/<repo>/git/trees/<branch>?recursive=1 -q '.tree[].path'

# Fetch a specific file
gh api repos/<owner>/<repo>/contents/<path> -q .content | base64 -d
```

---

## Notifications

Push notifications to phone/desktop are sent via ntfy.sh. The `notify_triage`
custom tool wraps `vault-triage/notify.sh`. The `icon` parameter is the agent
name (e.g. `"implementor"`, `"reviewer"`, `"auto-implementor"`) and the
optional `semantic_key` parameter resolves to an emoji prefix (e.g. `"clean"`
→ 🟢, `"escalation"` → ❗). When the icon starts with `auto-` (e.g.
`"auto-implementor"`), the script strips the prefix for the PNG URL and
prepends ⚙️ to the emoji automatically. Full key table in
`skills/vault-triage/SKILL.md`.

```
notify_triage({
  entry_type: "activity",
  context: "owner/repo/task",
  headline: "Commit Group 2 Complete",
  body: "• All tests passing",
  icon: "auto-implementor",
  semantic_key: "activity"
})

notify_triage({
  entry_type: "escalation",
  context: "owner/repo/task",
  headline: "Review Loop Exhausted on Group 3",
  body: "• High findings persist",
  icon: "auto-implementor",
  semantic_key: "escalation"
})
```

All 7 agents load the `vault-triage` skill after completing significant work,
write a triage entry, send a notification (via `notify_triage` tool), and
regenerate the inbox (via `triage_dashboard` tool). These three post-work steps
are mandatory — see the skill's Write Mode instructions.

Notification priorities: escalation/design-question → high (audible);
activity/handoff → default (non-audible); run-summary → low (silent). All
calls fail silently if ntfy is not configured, so they never block agent work.

---

## Environment Variable Reference

| Variable              | Required            | Description                                   | Fallback                                  |
| --------------------- | ------------------- | --------------------------------------------- | ----------------------------------------- |
| `OPENCODE_CONFIG_SRC` | No                  | Absolute path to the deployed opencode config | `$HOME/.config/opencode`                  |
| `SANDBOX_CONFIG_DIR`  | No                  | Path where sandbox config is deployed         | `$HOME/.config/opencode-sandbox`          |
| `AGENT_VAULT`         | Yes (for vault ops) | Absolute path to the Obsidian vault           | None — must be set                        |
| `AGENT_REPOS`         | Yes (for repo ops)  | Absolute path to local repo checkouts         | None — must be set                        |
| `NTFY_TOPIC`          | No                  | ntfy.sh topic for push notifications          | `$AGENT_VAULT/_misc/cache/ntfy-topic.txt` |

`AGENT_VAULT` and `AGENT_REPOS` are checked at the top of any agent session
that uses the vault or operates on a repository. The `vault-init` skill can
create and populate the vault directory if it does not yet exist.
