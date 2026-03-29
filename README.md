# agent-config

opencode configuration: models, modes, agents, prompts, skills, and permissions.

## Structure

```
opencode.json        # Model, mode prompts, and global bash permissions
agents/              # Subagent definitions (dispatched via Task tool)
prompts/             # Mode system prompts (build, plan)
skills/              # Loadable skill instructions and scripts
```

## Modes

Two modes, each with its own system prompt:

| Mode | Prompt | Description |
|------|--------|-------------|
| **build** | `prompts/build.md` | Full tool access — file edits, commands, subagent dispatch |
| **plan** | `prompts/plan.md` | Read-only exploration and schema authoring |

Switch modes with the Tab key in the opencode TUI.

## Agents

Subagents dispatched via the Task tool. Each is defined in `agents/`:

| Agent | File | Role |
|-------|------|------|
| `@planner` | `agents/planner.md` | Explores codebase, writes schemas, creates GitHub issues |
| `@implementor` | `agents/implementor.md` | Executes schemas step-by-step with manual approval gates |
| `@auto-implementor` | `agents/auto-implementor.md` | Executes schemas autonomously with a bounded review loop |
| `@reviewer` | `agents/reviewer.md` | Structured code review; writes findings to the vault |
| `@designer` | `agents/designer.md` | Repo notes, design documents, vault drafts |
| `@triage` | `agents/triage.md` | Writes triage entries (escalations, design questions, run summaries); produces triage reports |

## Skills

Skills are loadable instruction sets injected into context on demand. Each lives
in `skills/<name>/` with a `SKILL.md` descriptor and optional scripts.

| Skill | Purpose |
|-------|---------|
| `archive` | Find and read archived schemas and reviews from the vault |
| `fleet-schemas` | Find and read cross-repo (fleet) schemas |
| `local-ci` | Run and debug GitHub Actions workflows locally via `gh act` |
| `repo-notes` | Find and read repository reference notes |
| `reviews` | Find and read code review files |
| `schemas` | Find and read implementation schemas |
| `vault` | Cross-section vault search and repo lookup |
| `vault-cache` | Refresh GitHub metadata cache (projects, milestones, labels) |
| `vault-gc` | Archive completed schemas and reviews |
| `vault-init` | Initialize or verify the vault directory structure |
| `vault-lint` | Validate schemas and reviews against format templates |
| `vault-triage` | Generate triage dashboard; send push notifications for agent triage entries |

See `skills/vault-triage/README.md` for first-time notification setup.

## Vault

Agent work (schemas, reviews, triage, repo notes, design docs) lives in a
separate git-tracked Obsidian vault, path set via `$AGENT_VAULT`. See the
vault's `AGENTS.md` for conventions.

## Environment variables

| Variable | Description |
|----------|-------------|
| `AGENT_VAULT` | Path to the agent vault (e.g. `~/obsidian/agent.obs`) |
| `AGENT_REPOS` | Path to local repository checkouts (e.g. `~/repos`) |
| `NTFY_TOPIC` | ntfy.sh topic for push notifications (optional; falls back to `$AGENT_VAULT/cache/ntfy-topic.txt`) |
