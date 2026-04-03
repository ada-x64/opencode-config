# opencode-config

An opinionated [opencode](https://opencode.ai) configuration for structured,
multi-agent development workflows. Defines models, modes, agents, skills, and
a permission system -- all backed by a persistent vault for tracking work
across sessions.

## Quick install

```bash
uvx cubething-occonf
```

The installer prompts for your vault and repos paths, downloads the latest
release, runs the build pipeline, and writes environment variables to your
shell profile. Restart your shell and run `opencode`.

## How it works

The system is organized around three ideas: **modes** control what you can do
in a session, **agents** do specialized work, and the **vault** persists
everything they produce.

### Modes

You work in one of three modes, switched with Tab in the opencode TUI:

- **build** -- full tool access. File edits, shell commands, agent dispatch.
  The default working mode.
- **plan** -- read-only. Explore code, discuss design, write schemas. No
  direct file edits.
- **audit** -- read-only. Dispatch auditors and reviewers, collect reports.
  No repository modifications.

### Agents

Seven subagents, each with a locked-down permission set and a specific role
in the workflow:

```
Plan ----------> Implement ----------> Review
  @planner        @implementor           @reviewer
                  @auto-implementor
  @project-manager                       @designer
                                         @auto-auditor
```

**Planning.** `@planner` explores a codebase, discusses design, and writes an
implementation schema -- a self-contained spec broken into commit groups, each
with sub-tasks and a validation step. It creates a GitHub issue and links it
to the schema. `@project-manager` handles issue lifecycle, milestones, and
project board state after that.

**Implementation.** `@implementor` executes a schema one commit group at a
time, pausing after each for your review. `@auto-implementor` runs end-to-end
without pausing, using a bounded review loop (up to 3 rounds of `@reviewer`
per commit) and escalating persistent problems via triage.

**Review and analysis.** `@reviewer` writes structured findings with severity
and category tags. `@designer` produces reference notes and design documents.
`@auto-auditor` runs static analysis tools and writes audit reports.

Agents are split into two model tiers (`design` and `execute`), each assigned
any opencode-compatible model via `build.json`. The design tier handles
planning and analysis; the execute tier handles implementation and review.

### Vault

The vault is the persistent layer. It is a git-tracked directory of Markdown
files with YAML frontmatter, managed with [Obsidian](https://obsidian.md)
(though no app needs to be running -- agents access it via standard filesystem
tools).

Everything agents produce goes here:

```
$AGENT_VAULT/
  tasks/<owner>/<repo>/<task>/
    schema.md                  Implementation spec
    review.md                  Code review findings
    triage.md                  Escalation / triage entries
  audits/<owner>/<repo>/       Audit reports
  repo-notes/<owner>/<repo>/   Reference documentation per repo
  design/                      Cross-cutting design documents
  projects/                    Per-repo project status documents
  _misc/
    archive/tasks/             Completed work
    cache/                     GitHub metadata cache
    templates/                 Format templates
```

The vault is separate from this repo and lives at `$AGENT_VAULT`. Schemas,
reviews, triage entries, audit reports, repo notes, and design documents all
follow format templates that agents and skills know how to read and write.
Skills like `vault-gc`, `vault-lint`, and `vault-triage` provide maintenance
workflows -- archiving completed work, validating format compliance, and
generating a triage inbox dashboard.

### Skills

Skills are loadable instruction sets that agents pull in on demand. They are
not baked into agent prompts -- an agent calls `skill("vault-triage")` when it
needs triage capabilities, for example. Each skill lives in `src/skills/<name>/`
with a `SKILL.md` descriptor and optional helper scripts.

There are 13 skills covering vault operations (search, init, lint, gc, triage,
cache), work product lookup (schemas, reviews, repo-notes, archive,
fleet-schemas), and development tooling (local-ci).

### Permissions

All agents use a deny-override permission model: every agent's bash permission
block starts with `"*": deny` and then explicitly allows only the commands it
needs. This makes each agent's capabilities independently auditable. Two agents
(`@planner` and `@auto-implementor`) can dispatch subagents; the rest are leaf
agents with no `task:` permission.

### Docker sandbox

Agent sessions can optionally run in isolated Docker containers via
[Agent of Empires](https://github.com/njbrake/agent-of-empires). The
`docker/Dockerfile` builds an Ubuntu 24.04 image with the full toolchain
(opencode, gh, Node.js, pnpm, bun, Rust, uv, ripgrep, yq). The AoE config
template is deployed automatically during install.

---

## Getting started

### Other install methods

```bash
uvx run cubething-occonf
pipx run cubething-occonf

# From a GitHub release (no PyPI):
uvx --from https://github.com/ada-x64/opencode-config/releases/latest/download/opencode-config.tar.gz cubething-occonf

# curl | python3:
curl -fsSL https://github.com/ada-x64/opencode-config/releases/latest/download/setup.py | python3
```

### From source

```bash
git clone https://github.com/ada-x64/opencode-config.git
cd opencode-config
python3 scripts/build.py      # src/ -> out/, stamps models + config
python3 scripts/install.py    # out/ -> ~/.config/opencode
```

On first run, `build.py` prompts for model configuration and writes
`build.json` (gitignored, per-machine). Use `--reconfigure` to re-prompt.

### Environment variables

The installer writes these to your shell profile. If installing from source,
set them manually:

| Variable              | Required            | Description                                   |
| --------------------- | ------------------- | --------------------------------------------- |
| `OPENCODE_CONFIG_SRC` | No                  | Path to the deployed config (`~/.config/opencode` default) |
| `AGENT_VAULT`         | Yes (for vault ops) | Path to the vault directory                   |
| `AGENT_REPOS`         | Yes (for repo ops)  | Path to local repo checkouts                  |
| `NTFY_TOPIC`          | No                  | ntfy.sh topic for push notifications          |

## License

MIT
