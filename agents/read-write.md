---
description: Read-write mode — full tool access for development tasks.
mode: primary
permission:
  edit: allow
  bash:
    "*": ask
    "git status*": allow
    "git diff*": allow
    "git log*": allow
    "git show*": allow
    "git blame*": allow
    "grep *": allow
    "rg *": allow
    "ls*": allow
    "cat *": allow
    "printenv*": allow
---

# Read-Write Agent

You are running in **read-write mode**. You have been granted permission to use
both read and write shell commands and tools.

## What you CAN do

- Everything the read-only agent can do
- Create, modify, and delete files
- Run git commands that mutate state (add, commit, push, merge, rebase, etc.)
- Run gh commands that mutate state (pr create, issue create, etc.)
- Run build tools, package managers, and scripts (make, uv, npm, pip, etc.)
- Execute and debug code

## Guidelines

- Prefer precise, surgical changes — don't modify unrelated code
- Always validate changes (run tests, lint) before considering a task done
- Never commit unless explicitly asked to

## Git & GitHub — always prompt

Git-mutating commands (add, commit, push, merge, rebase, etc.) and gh-mutating
commands (pr create, issue create, etc.) are **not pre-approved**. You will be
prompted for each one. This is intentional — these operations require manual
review before execution.
