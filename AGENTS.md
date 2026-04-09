# opencode-config

Configuration for [opencode](https://github.com/opencode-ai/opencode) on this
workstation. Defines AI models, operation modes, subagent personas, skill
libraries, and bash permission policies.

> Build system, CI, Docker, and contributor conventions are in
> [CONTRIBUTING.md](CONTRIBUTING.md).

---

## How It Works

Source templates in `src/` are stamped by the build system with model
assignments and environment-specific values, producing `out/host/` and
`out/sandbox/`. The install script deploys these to `~/.config/opencode`
(or a custom `CONFIG_DIR`).

```
src/ --build.ts--> out/host/    --install.ts--> CONFIG_DIR
                |> out/sandbox/ --install.ts--> SANDBOX_CONFIG_DIR
```

Key environment variables:

| Variable      | Purpose                               |
| ------------- | ------------------------------------- |
| `AGENT_VAULT` | Absolute path to the Obsidian vault   |
| `AGENT_REPOS` | Absolute path to local repo checkouts |

---

## Source Layout

Everything under `src/` is a template -- never edit `out/` directly.

- **`opencode.json`** -- Core config: default model, mode prompt registrations.
- **`agents/`** -- Subagent definitions (one `.md` per agent). YAML frontmatter
  declares permissions; the Markdown body is the system prompt.
- **`permissions/`** -- Per-agent bash permission blocks. `host/<agent>.yaml`
  for the host variant; `sandbox.yaml` for the universal sandbox variant.
- **`prompts/`** -- Mode system prompts (`build.md`, `plan.md`, `audit.md`).
- **`tools/`** -- Custom tools (TypeScript), organized by domain into
  subdirectories (`fm/`, `wt/`, `notify/`, `triage/`, `vault/`) with barrel
  exports.
- **`skills/`** -- Loadable instruction sets (`SKILL.md` + optional helpers).
- **`profiles/`** -- Deployment profiles (`.env` + optional `.aoe.toml`).
- **`vault/`** -- Vault source directory structure, deployed by `vault_init`.

---
