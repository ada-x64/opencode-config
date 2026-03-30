# Repo Notes Format

Repo notes are reference summaries of repository internals. A future agent
session should be able to understand a subsystem by reading one file. This is
a suggested format — adapt the structure to fit the repository, but always
include the required sections.

## Header

Every repo notes file starts with YAML frontmatter followed by an H1 title:

```markdown
---
repo: <owner>/<repo>
date: YYYY-MM-DD
---

# <repo> — <Subsystem or scope label>
```

### Frontmatter fields

| Field | Description |
|-------|-------------|
| `repo` | `<owner>/<repo>` identifier |
| `date` | Date the notes were written or last substantially updated (YYYY-MM-DD) |

## Purpose

**Required.** One short paragraph or bullet list explaining what the
repository or subsystem does. Why does it exist? What problem does it solve?

```markdown
## Purpose

<High-level description of what this repo/subsystem does.>
```

## Layout

**Required.** A description of the directory structure and major files. Use a
code block for the tree, then annotate each entry.

```markdown
## Layout

\```
repo/
  src/
    main.rs       # entry point
    lib.rs        # library root
  tests/          # integration tests
  Cargo.toml
\```

- `src/main.rs` — <What it does>
- `src/lib.rs` — <What it does>
```

## Architecture

**Required.** A narrative description of the key abstractions, data flows, and
module relationships. Use prose, diagrams (ASCII or Mermaid), or both. Link to
other vault notes using Obsidian wiki-links (`[[path/to/note]]`).

```markdown
## Architecture

<Describe the major components and how they interact. Reference key types,
traits, modules, or functions by name.>
```

## Build and tooling

**Required.** How to build, test, lint, and run the project. Include any
non-obvious environment requirements or toolchain pinning.

```markdown
## Build and tooling

- **Build:** `<command>`
- **Test:** `<command>`
- **Lint:** `<command>`
- **Toolchain:** <e.g. `nightly-2026-01-22`, Python 3.12, Node 20>
```

## Key files

A table of the most important files for an agent to know about — files that
are touched frequently, contain core logic, or are required reading.

```markdown
## Key files

| File | Purpose |
|------|---------|
| `path/to/file.rs` | <What it does> |
```

## Notes (optional)

Quirks, gotchas, or institutional knowledge that isn't obvious from reading
the code. Things an agent should know before making changes.

```markdown
## Notes

- <Quirk or gotcha>
- <Non-obvious constraint>
```

## History

**Required.** A changelog for the notes themselves. Newest entries first.

```markdown
## History

| Date | Change |
|------|--------|
| YYYY-MM-DD | Initial notes |
| YYYY-MM-DD | Updated architecture section after refactor |
```
