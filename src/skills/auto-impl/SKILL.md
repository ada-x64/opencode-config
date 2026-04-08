---
name: auto-impl
description: >
  Autonomous schema execution skill for build mode. Turns build mode into
  an orchestrator that dispatches @implementor and @reviewer as first-level
  subagents with a bounded review loop. Load this skill when the user wants
  end-to-end schema execution without manual approval gates.
---

# Autonomous Schema Execution

## Overview

This skill turns build mode into an **autonomous schema executor**. Build mode
orchestrates everything directly — all subagent calls (`@implementor`,
`@reviewer`) are first-level dispatches. There is no nested subagent chain.

```
build + auto-impl skill (orchestrator)
  |-- @implementor (fresh dispatch per group)
  `-- @reviewer (fresh dispatch per review round)
```

When this skill is loaded:

- Build mode **commits without prompting** (auto-commit consent is implied)
- Build mode executes the full schema end-to-end without pausing for user input
- Build mode **never pushes** to remote — this is a hard rule with no exceptions
- Each commit group dispatches `@implementor` independently (fresh context)
- Each review round dispatches `@reviewer` independently (fresh context)

The caller provides:

- **Repository path** — e.g. `$AGENT_REPOS/<owner>/<repo>`
- **Task directory** — e.g. `$AGENT_VAULT/tasks/<task>/`

---

## Startup

Set shell variables at the start:

```bash
repo_path="<path provided by caller>"
task_dir="$AGENT_VAULT/tasks/<task>"
schema_file="$task_dir/schema.md"
review_file="$task_dir/reviews/review.md"
```

Then execute these steps in order:

1. **Read `CONTRIBUTING.md`** from `$repo_path` root (if it exists). This
   provides project conventions for the implementation.

2. **Read the full schema** at `$schema_file`.

3. **Switch to the target branch.** Read `branch` from frontmatter and switch:

   ```
   branch = fm_read({ file: schema_file, key: "branch" })
   ```

   If `branch` is empty or `null`, stay on the current branch. Otherwise:

   ```
   repo_path = wt_switch_branch({ repo_path: repo_path, branch: branch })
   ```

   In a bare repo / worktree setup this creates a new worktree directory and
   updates `repo_path`. All subsequent operations use the (possibly updated) path.

4. **Set schema status** to `in progress`:

   ```
   fm_write({ file: schema_file, key: "status", value: "in progress" })
   ```

5. **Apply `in-progress` label** to the linked GitHub issue (best-effort):

   ```
   issue_field = fm_read({ file: schema_file, key: "issue" })
   repo_slug = fm_read({ file: schema_file, key: "repo" })
   ```

   If `issue_field` is non-empty and does not start with `local-`:

   ```bash
   _issue_num="$(echo "$issue_field" | grep -oP '#\K[0-9]+')"
   gh issue edit "$_issue_num" -R "$repo_slug" --add-label "in-progress" 2>/dev/null || true
   ```

6. **Post a start comment** on the linked issue (best-effort):

   ```bash
   _group_count="$(grep -c '^### Commit' "$schema_file" 2>/dev/null || echo '?')"
   gh issue comment "$_issue_num" -R "$repo_slug" \
     --body "Implementation started on branch \`${branch}\`. Schema: ${_group_count} commit groups. Started at $(date -u '+%Y-%m-%d %H:%M UTC')." \
     2>/dev/null || true
   ```

7. **Check for partial run recovery.** If the schema status was already
   `in progress` (set in a previous interrupted run), check `git log` against
   the schema commit groups to determine where to resume. Start from the first
   uncommitted group.

---

## Per-Group Loop

For each commit group (1, 2, 3, ...) execute these steps in order without
stopping:

### a. Dispatch implementor

Dispatch `@implementor` with explicit instructions to execute only this group:

```
@implementor
Execute ONLY commit group N of the schema at <schema_file> in <repo_path>.
Task directory: <task_dir>
- Execute all sub-tasks (Na, Nb, Nc, ...) in order
- Run the validation step (Nv)
- Do NOT commit -- the orchestrator handles commits
- Do NOT pause for approval -- return immediately after validation passes
- Return: files changed, validation result, any issues encountered
```

### b. Commit

Stage and commit all changes for this group:

```bash
git -C "$repo_path" add -A
git -C "$repo_path" commit -m "<short message describing the group>"
```

This is auto-approved — the skill implies autonomous commit consent.

### c. Review loop (max 3 rounds)

**Round 1** — dispatch `@reviewer`:

```
@reviewer
Review the latest commit in <repo_path>. Write findings to <review_file>.
Schema context: <schema_file>
```

Read the review file. Evaluate findings by severity:

- **All findings are medium or below (nit/low/medium):** Fix in a single
  commit, move on. Done — 1 review for this group.

  ```bash
  git -C "$repo_path" commit -am "review: address findings"
  ```

- **Any finding is high or critical:** Fix those issues, commit:

  ```bash
  git -C "$repo_path" commit -am "review: fix high-severity findings"
  ```

  Proceed to Round 2.

**Round 2** — dispatch a second `@reviewer`:

```
@reviewer
Re-review <repo_path> after fixes. Write findings to <review_file>.
Focus on whether high/critical issues from round 1 are resolved.
High/critical issues from round 1: <paste the high+ findings from round 1>
Schema context: <schema_file>
```

- **No high+ findings remain:** Fix remaining medium/lows in one commit. Done — 2 reviews.
- **High+ persist:** Fix and commit, proceed to Round 3.

**Round 3 (cap)** — dispatch a final `@reviewer`:

```
@reviewer
Final review of <repo_path>. Write findings to <review_file>.
Schema context: <schema_file>
```

- **No high+ findings:** Fix remaining medium/lows. Done — 3 reviews.
- **High+ still persist:** This is a design problem, not a code fix. **Do NOT
  stop.** Write an `escalation` triage entry (see Triage section), send
  notification, and **continue to the next group**.

### d. Design decisions

If during implementation a genuine design ambiguity was encountered and a
non-trivial judgment call was made, write a `design-question` triage entry
before moving to the next group.

### e. Activity entry

After the review loop completes for this group, write an `activity` triage
entry recording what was done.

### f. Continue

Proceed immediately to the next commit group. Do not pause.

---

## Completion

After all commit groups are done and validated:

1. **Set schema status** to `complete`:

   ```
   fm_write({ file: schema_file, key: "status", value: "complete" })
   ```

2. **Remove `in-progress` label** from the linked issue (best-effort):

   ```bash
   _issue_num="$(echo "$issue_field" | grep -oP '#\K[0-9]+')"
   gh issue edit "$_issue_num" -R "$repo_slug" --remove-label "in-progress" 2>/dev/null || true
   ```

3. **Post a completion comment** on the linked issue (best-effort):

   ```bash
   gh issue comment "$_issue_num" -R "$repo_slug" \
     --body "Implementation complete on branch \`${branch}\`. ${_groups_completed} commit groups implemented and validated." \
     2>/dev/null || true
   ```

4. **Write a `run-summary` triage entry.** Include: commit groups completed,
   total review rounds, escalations filed, design decisions made, unresolved
   nit/low findings.

5. **Suggest worktree cleanup** if a new worktree was created during startup:

   ```
   wt_cleanup({ worktree_path: repo_path })
   ```

---

## Triage & Notifications

All triage entries follow the `vault-triage` skill protocol. The three
post-write steps are **mandatory** after every triage write:

1. Write the entry:

   ```
   triage_write({ type: "<type>", task: "<owner>/<repo>/<task>", agent: "auto-impl", headline: "<headline>", body: "<body>" })
   ```

2. Send notification:

   ```
   notify_triage({ type: "<type>", task: "<owner>/<repo>/<task>", headline: "<headline>", body: "<body>", icon: "auto-implementor", emoji: "<semantic-key>" })
   ```

3. Regenerate inbox:

   ```
   triage_dashboard({})
   ```

### Events table

| Event                                            | Type              | When                             |
| ------------------------------------------------ | ----------------- | -------------------------------- |
| Commit group completed                           | `activity`        | After each commit + review cycle |
| Review loop exhausted (3 rounds, high+ persists) | `escalation`      | Step c, Round 3                  |
| Design ambiguity resolved                        | `design-question` | Step d                           |
| Run complete                                     | `run-summary`     | Completion                       |

**Icon:** Pass `auto-implementor` as the `icon` parameter — the `notify.sh`
auto-prefix stripping logic prepends a gear emoji automatically.

**Icon selection for review outcomes:**

- 0 high+ findings -> semantic key `clean` (resolves to gear + green)
- Medium findings only -> semantic key `warn` (resolves to gear + yellow)
- Any high/critical findings -> semantic key `reject` (resolves to gear + red)

---

## Constraints

When this skill is loaded, build mode MUST NOT:

- Push to remote (`git push`) — hard rule, no exceptions
- Skip sub-tasks or reorder them without a documented reason
- Proceed past a failing validation step
- Dispatch more than 3 reviews for a single commit group
- Write outside the repository and vault paths
- Stop the run because a review loop is stuck — escalate and continue
- Apply `in-progress` label when the schema's `issue:` field is blank, `null`,
  `(empty)`, or starts with `local-`
