# Code Review Format

Reviews must follow this structure exactly. Always overwrite the entire file.

## Header

Every review starts with YAML frontmatter followed by an H1 title:

```markdown
---
repo: <owner>/<repo>
status: 📋 todo
date: YYYY-MM-DD
---

# Review: <task-name>

**Branch:** `<branch>` (<N> commits ahead of `<base>`)
**Diff:** `+<added> / −<removed>` across <N> files
```

### Frontmatter fields

| Field    | Description                                  |
| -------- | -------------------------------------------- |
| `repo`   | `<owner>/<repo>` identifier                  |
| `status` | `📋 todo` / `🔨 in-progress` / `✅ complete` |
| `date`   | Review date (YYYY-MM-DD)                     |

Branch and diff info go in the document body (below the H1) since they change per review round.

## Verdict

One of: **Accept**, **Accept with nits**, **Request changes**, **Reject**.

```markdown
## Verdict: <Accept | Accept with nits | Request changes | Reject>

<1-3 sentence summary of the overall assessment.>
```

## Issues

Each issue gets its own subsection. Issues are numbered sequentially.

### Severity levels (mutually exclusive)

| Severity     | Meaning                                                                         |
| ------------ | ------------------------------------------------------------------------------- |
| **nit**      | Stylistic or trivial. Not worth blocking merge.                                 |
| **low**      | Minor improvement. Nice to fix but acceptable as-is.                            |
| **medium**   | Should be fixed before merge. Affects correctness, clarity, or maintainability. |
| **high**     | Must be fixed. Bug, security issue, or data loss risk.                          |
| **critical** | Blocking. Fundamentally broken or dangerous.                                    |

### Issue categories (can combine, e.g. "bug, performance")

| Category        | Meaning                                                    |
| --------------- | ---------------------------------------------------------- |
| **bug**         | Incorrect behavior at runtime.                             |
| **performance** | Unnecessary work, O(n) where O(1) is possible, etc.        |
| **design**      | Architectural or API design concern.                       |
| **types**       | Type safety gap, missing narrowing, incorrect annotations. |
| **maintenance** | Makes future changes harder (coupling, duplication, etc.)  |
| **security**    | Potential vulnerability or unsafe pattern.                 |
| **docs**        | Missing, incorrect, or misleading documentation.           |
| **testing**     | Missing test coverage, flaky test, or incorrect assertion. |
| **style**       | Formatting, naming, or convention inconsistency.           |

### Issue format

```markdown
### <N>. <Short title>

**Severity:** <severity> · **Category:** <category>[, <category>...]

<Description of the issue. Be specific — reference file paths, line numbers,
and code snippets. Explain _why_ it's a problem, not just _what_ is wrong.>

**Suggested fix:**

<Concrete suggestion. When possible, include a before/after code diff
showing the proposed change. Use fenced code blocks with the appropriate
language identifier.>

**File:** `<path>:<line range>`
```

## Observations (optional)

Non-blocking notes, context, or praise. Use lettered subsections (A, B, C...).

```markdown
## Observations

### A. <Title>

<Description.>
```

## File summary (optional)

A table summarizing per-file changes. Useful for large diffs.

```markdown
## File summary

| File              | LOC Δ    | Notes        |
| ----------------- | -------- | ------------ |
| `path/to/file.py` | +100/−20 | <Brief note> |
```
