---
repo: <owner>/<repo>
date: YYYY-MM-DD
label: <short-label>
scope: full
tools_run: []
tools_unavailable: []
coverage_source: none
status: complete
agent: auto-auditor
---

# Audit: <owner>/<repo> — <label> (<date>)

## Executive Summary

<3-5 sentences. Overall health assessment, most critical findings, recommended priorities.
If no tools were available, note this prominently here.>

| Severity | Count |
|----------|-------|
| critical | N |
| high | N |
| medium | N |
| low | N |
| info | N |

## Scope

**Audited:** `<path or "full repository">`
**Excluded:** `<explicit exclusions or "none">`
**Commit:** `<git SHA>` on `<branch>`
**Date:** YYYY-MM-DD

## Tool Findings

### <Tool Name> (<version or "version unknown">)

**Status:** ran successfully | not available | failed (<reason>)

<Summary of findings — count of warnings/errors, categories.>

<Condensed tool output or representative samples. Truncate if >50 lines.>

### <Tool Name> ...

## Analysis

### Security

<Synthesised findings. Reference specific tool output where applicable.>

### Testing

<Coverage data (source noted), coverage gaps, trivial-test smell,
missing test categories, test-to-code churn correlation.>

### Architecture

<Structural concerns, coupling, cohesion, dependency health.>

### Performance

<Algorithmic concerns, unnecessary allocations, blocking calls.>

### Maintenance

<Code smells, duplication, dead code, documentation gaps, over-specified tests.>

## Severity Summary

| Severity | Security | Testing | Architecture | Performance | Maintenance | Total |
|----------|----------|---------|--------------|-------------|-------------|-------|
| critical | N | N | N | N | N | N |
| high     | N | N | N | N | N | N |
| medium   | N | N | N | N | N | N |
| low      | N | N | N | N | N | N |
| info     | N | N | N | N | N | N |
| **Total**| N | N | N | N | N | **N** |

---

## Reference: Severity Levels

Audit severity uses **roadmap-priority semantics** — not merge-gate semantics. An audit finding does not block a PR; it informs an engineering roadmap.

| Severity | Audit meaning |
|----------|--------------|
| **critical** | Active exploit, data loss risk, or regulatory violation. Fix immediately. |
| **high** | Significant vulnerability or quality failure; address within the current sprint. |
| **medium** | Noteworthy pattern; address within the quarter. |
| **low** | Minor quality issue or best-practice gap; worth tracking, not urgent. |
| **info** | Neutral observation with no negative valence (e.g. "test coverage is 80% in this module"). |

Note: `info` is specific to the audit severity model and has no counterpart in the review (`nit/low/medium/high/critical`) format.

---

## Reference: Coverage Source Values

The `coverage_source` frontmatter field records where coverage data was obtained:

| Value | Source |
|-------|--------|
| `cargo-llvm-cov` | LLVM-based coverage instrumentation via `cargo llvm-cov` |
| `pytest-cov` | Python test coverage via `pytest --cov` |
| `jest-coverage` | JavaScript/TypeScript coverage via `jest --coverage` or `vitest --coverage` |
| `codecov-api` | Hosted coverage data fetched from the Codecov API |
| `coveralls-api` | Hosted coverage data fetched from the Coveralls API |
| `none` | No coverage data available or requested |

---

## Frontmatter Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `repo` | string | `<owner>/<repo>` — the repository being audited |
| `date` | string | `YYYY-MM-DD` — date the audit was run |
| `label` | string | Short identifier for the report filename (e.g. `full-audit`, `security-pass`, `auth-module`) |
| `scope` | string | `full` or a path prefix / glob (e.g. `src/auth`, `src/**/*.rs`) |
| `tools_run` | list | Tools that executed successfully during this audit |
| `tools_unavailable` | list | Tools detected as absent (probed but not found) |
| `coverage_source` | string | Where coverage data was obtained (see Coverage Source Values above) |
| `status` | string | Always `complete` — audit reports are point-in-time, immutable records |
| `agent` | string | Always `auto-auditor` |
