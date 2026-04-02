---
name: local-ci
description: >
  Run and debug GitHub Actions workflows locally using `gh act` and the
  skill's `act.sh` wrapper. Use this skill when asked to test CI locally,
  run a specific workflow or job, verify workflow changes before pushing,
  or debug failing GitHub Actions workflows.
---

# Local CI Testing with `gh act`

## Overview

This skill bundles an `act.sh` wrapper script that invokes
[`gh act`](https://github.com/nektos/gh-act) (nektos/act) for running
GitHub Actions workflows locally. It handles GitHub authentication, starts
a Docker-based artifact server, and passes all arguments through to `gh act`.

## When to Use

- Testing GitHub Actions workflows locally before pushing
- Verifying CI changes (new or modified `.github/workflows/*.yml` files)
- Debugging a failing CI workflow by reproducing it locally
- Running a specific job from a workflow in isolation

## How to Invoke

The `act.sh` script is located alongside this skill file at
`~/.config/opencode/skills/local-ci/act.sh`. Always run it from within the
target repository directory.

```bash
# Run from within a repo directory
cd "$AGENT_REPOS/<owner>/<repo>"

# Run all workflows triggered by push (default event)
bash ~/.config/opencode/skills/local-ci/act.sh

# Run a specific workflow file
bash ~/.config/opencode/skills/local-ci/act.sh -W .github/workflows/ci.yml

# Run a specific job within a workflow
bash ~/.config/opencode/skills/local-ci/act.sh -W .github/workflows/ci.yml -j build

# Dry run (validate without running containers)
bash ~/.config/opencode/skills/local-ci/act.sh -n

# List all available workflows and jobs
bash ~/.config/opencode/skills/local-ci/act.sh --list

# Verbose output for debugging
bash ~/.config/opencode/skills/local-ci/act.sh -W .github/workflows/ci.yml -v
```

## What the Script Does

1. **Authenticates** with GitHub using `gh auth token`
2. **Starts an artifact server** — a Docker container (`ghcr.io/jefuller/artifact-server:latest`) on port 8080 for caching and artifact uploads. Reuses existing container if already running.
3. **Invokes `gh act`** with the artifact server configuration and passes all extra arguments (`$@`) through

## Key `gh act` Flags

| Flag                            | Description                                     |
| ------------------------------- | ----------------------------------------------- |
| `-W .github/workflows/FILE.yml` | Run a specific workflow file                    |
| `-j JOB_ID`                     | Run a specific job by its ID                    |
| `-n`                            | Dry run — validate without creating containers  |
| `-v`                            | Verbose output                                  |
| `--list`                        | List all workflows and jobs                     |
| `-e EVENT.json`                 | Provide a custom event payload                  |
| `-s SECRET=value`               | Pass a secret to actions                        |
| `--env VAR=value`               | Set an environment variable                     |
| `--matrix key:value`            | Filter matrix configuration                     |
| `-P platform=image`             | Use a custom Docker image for a platform        |
| `--reuse`                       | Keep containers between runs (faster iteration) |
| `--rm`                          | Remove containers after failure                 |

## Debugging CI Failures

Follow this workflow:

1. **List available workflows and jobs:**

   ```bash
   bash ~/.config/opencode/skills/local-ci/act.sh --list
   ```

2. **Run the failing workflow:**

   ```bash
   bash ~/.config/opencode/skills/local-ci/act.sh -W .github/workflows/ci.yml -v
   ```

3. **Isolate the failing job** if the workflow has multiple jobs:

   ```bash
   bash ~/.config/opencode/skills/local-ci/act.sh -W .github/workflows/ci.yml -j <job-id> -v
   ```

4. **Iterate on fixes** — use `--reuse` to keep containers alive between runs:

   ```bash
   bash ~/.config/opencode/skills/local-ci/act.sh -W .github/workflows/ci.yml -j <job-id> --reuse
   ```

5. **Clean up** when done:
   ```bash
   docker stop artifact-server && docker rm artifact-server
   ```

## Workspace CI Workflows _(illustrative — may be out of date)_

_Check each repository's `.github/workflows/` directory for the current list._

| Repository        | Workflow(s)                                                                            |
| ----------------- | -------------------------------------------------------------------------------------- |
| `nanvix/`         | `ci.yml`, `verus-update.yml`, `cargo-upgrade.yml`, `branch-up-to-date.yml`, and others |
| `zutils/`         | `ci.yml`, `release.yml`                                                                |
| `nanvix-python/`  | `ci.yml`                                                                               |
| `bzip2/`          | `nanvix-ci.yml`                                                                        |
| `zlib/`           | `nanvix-ci.yml`, `cmake.yml`, `fuzz.yml`, `configure.yml`                              |
| `sqlite/`         | `nanvix-ci.yml`                                                                        |
| `nanvix-hello-c/` | `nanvix-ci.yml`                                                                        |
| `openssl/`        | `cross-compiles.yml`, `make-release.yml`, and others                                   |

## Troubleshooting

- **Artifact server won't start:** Check if port 8080 is in use (`lsof -i :8080`). Stop the existing container: `docker stop artifact-server && docker rm artifact-server`.
- **Docker permission errors:** Ensure your user is in the `docker` group or use `sudo`.
- **`gh auth token` fails:** Run `gh auth login` first.
- **Workflow uses unsupported features:** `gh act` doesn't support all GitHub Actions features. Check [nektos/act limitations](https://github.com/nektos/act#known-issues).
