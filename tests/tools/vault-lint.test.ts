import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import vault_lint from "../../src/tools/vault/lint";
import { execute_tool } from "./_lib";

// Each test file owns its own isolated vault so it never touches the real
// AGENT_VAULT and never races against other test files.

let tmp: string;
let vault: string;
const origAgentVault = process.env.AGENT_VAULT;

const VALID_SCHEMA = `---
status: 📋 todo
repo: lint-owner/lint-repo
task: task-valid
date: 2026-01-01
priority: 🟡 medium
issue: "[#1](https://github.com/lint-owner/lint-repo/issues/1)"
---

# My Task Title

## Problem

Describe the problem here.

## Approach

Describe the approach here.

## Todos

- [ ] todo item

## Files changed

- path/to/file.ts
`;

// Missing all required H2 sections; also no issue field
const INVALID_SCHEMA = `---
status: 📋 todo
repo: lint-owner/lint-repo
task: task-invalid
date: 2026-01-01
---

# My Broken Task
`;

// Bad status value (all sections present)
const BAD_STATUS_SCHEMA = `---
status: wip
repo: lint-owner/lint-repo
task: task-bad-status
date: 2026-01-01
issue: "[#2](https://github.com/lint-owner/lint-repo/issues/2)"
---

# Bad Status Task

## Problem

Problem.

## Approach

Approach.

## Todos

- [ ] item

## Files changed

- file.ts
`;

// Schema with 🔍 in-review status (valid for tasks/)
const IN_REVIEW_SCHEMA = `---
status: 🔍 in-review
repo: lint-owner/lint-repo
task: task-in-review
date: 2026-01-01
priority: 🟡 medium
issue: "[#3](https://github.com/lint-owner/lint-repo/issues/3)"
---

# In Review Task

## Problem

Problem.

## Approach

Approach.

## Todos

- [ ] item

## Files changed

- file.ts
`;

// Schema with 🚫 closed status (valid for tasks/)
const CLOSED_SCHEMA = `---
status: 🚫 closed
repo: lint-owner/lint-repo
task: task-closed
date: 2026-01-01
priority: 🟢 low
issue: "[#4](https://github.com/lint-owner/lint-repo/issues/4)"
---

# Closed Task

## Problem

Problem.

## Approach

Approach.

## Todos

- [ ] item

## Files changed

- file.ts
`;

// Schema with bare "todo" (no emoji prefix) — should be rejected
const BARE_TODO_SCHEMA = `---
status: todo
repo: lint-owner/lint-repo
task: task-bare-todo
date: 2026-01-01
priority: 🟡 medium
issue: "[#5](https://github.com/lint-owner/lint-repo/issues/5)"
---

# Bare Todo Task

## Problem

Problem.

## Approach

Approach.

## Todos

- [ ] item

## Files changed

- file.ts
`;

// Valid review with 📋 todo status
const VALID_REVIEW = `---
status: 📋 todo
repo: lint-owner/lint-repo
date: 2026-01-01
---

# Review: task-valid

## Verdict: pending

No issues found.
`;

// Review with 🔍 in-review status — NOT in REVIEW_STATUSES, should be rejected
const BAD_REVIEW_STATUS = `---
status: 🔍 in-review
repo: lint-owner/lint-repo
date: 2026-01-01
---

# Review: task-bad-review-status

## Verdict: pending

No issues found.
`;

beforeAll(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "vault-lint-test-"));
  vault = path.join(tmp, "vault");

  const base = path.join(vault, "tasks");
  await mkdir(path.join(base, "task-valid"), { recursive: true });
  await mkdir(path.join(base, "task-invalid"), { recursive: true });
  await mkdir(path.join(base, "task-bad-status"), { recursive: true });
  await mkdir(path.join(base, "task-in-review"), { recursive: true });
  await mkdir(path.join(base, "task-closed"), { recursive: true });
  await mkdir(path.join(base, "task-bare-todo"), { recursive: true });
  await mkdir(path.join(base, "task-valid", "reviews"), { recursive: true });
  await mkdir(path.join(base, "task-bad-review-status", "reviews"), {
    recursive: true,
  });

  await writeFile(path.join(base, "task-valid", "schema.md"), VALID_SCHEMA);
  await writeFile(path.join(base, "task-invalid", "schema.md"), INVALID_SCHEMA);
  await writeFile(
    path.join(base, "task-bad-status", "schema.md"),
    BAD_STATUS_SCHEMA,
  );
  await writeFile(
    path.join(base, "task-in-review", "schema.md"),
    IN_REVIEW_SCHEMA,
  );
  await writeFile(path.join(base, "task-closed", "schema.md"), CLOSED_SCHEMA);
  await writeFile(
    path.join(base, "task-bare-todo", "schema.md"),
    BARE_TODO_SCHEMA,
  );
  await writeFile(
    path.join(base, "task-valid", "reviews", "review.md"),
    VALID_REVIEW,
  );
  await writeFile(
    path.join(base, "task-bad-review-status", "reviews", "review.md"),
    BAD_REVIEW_STATUS,
  );

  process.env.AGENT_VAULT = vault;
});

afterAll(async () => {
  if (origAgentVault !== undefined) {
    process.env.AGENT_VAULT = origAgentVault;
  } else {
    delete process.env.AGENT_VAULT;
  }
  await rm(tmp, { recursive: true, force: true });
});

describe("vault_lint", () => {
  // ── Shape ──────────────────────────────────────────────────────────────────

  it("has correct shape", () => {
    expect(vault_lint.description).toContain("vault schemas");
    expect(vault_lint.args).toHaveProperty("schemas_only");
    expect(vault_lint.args).toHaveProperty("reviews_only");
    expect(vault_lint.args).toHaveProperty("filter");
    expect(vault_lint.args).not.toHaveProperty("agents");
  });

  // ── Valid schema ───────────────────────────────────────────────────────────

  it("passes a fully valid schema", async () => {
    const result = await execute_tool(vault_lint, {
      schemas_only: true,
      filter: "task-valid",
    });
    expect(result).toBe("All files pass validation.");
  });

  // ── Invalid schema ─────────────────────────────────────────────────────────

  it("reports missing H2 sections for an invalid schema", async () => {
    const result = await execute_tool(vault_lint, {
      schemas_only: true,
      filter: "task-invalid",
    });
    expect(result).toContain("task-invalid");
    expect(result).toMatch(/missing ## Problem/);
    expect(result).toMatch(/missing ## Approach/);
    expect(result).toMatch(/missing ## Todos/);
    expect(result).toMatch(/missing ## Files changed/);
  });

  it("reports missing issue field as a warning", async () => {
    const result = await execute_tool(vault_lint, {
      schemas_only: true,
      filter: "task-invalid",
    });
    expect(result).toMatch(/warning.*missing 'issue'/i);
  });

  it("reports an invalid status value", async () => {
    const result = await execute_tool(vault_lint, {
      schemas_only: true,
      filter: "task-bad-status",
    });
    expect(result).toContain("task-bad-status");
    expect(result).toMatch(/invalid status value.*wip/);
  });

  it("includes 'Lint found issues above.' footer when errors exist", async () => {
    const result = await execute_tool(vault_lint, {
      schemas_only: true,
      filter: "task-invalid",
    });
    expect(result).toContain("Lint found issues above.");
  });

  // ── Filter ─────────────────────────────────────────────────────────────────

  it("filter scopes lint to matching paths only", async () => {
    const result = await execute_tool(vault_lint, {
      schemas_only: true,
      filter: "task-valid",
    });
    expect(result).not.toContain("task-invalid");
    expect(result).toBe("All files pass validation.");
  });

  // ── AGENT_VAULT guard ──────────────────────────────────────────────────────

  it("returns an error when AGENT_VAULT is unset", async () => {
    delete process.env.AGENT_VAULT;
    try {
      const result = await execute_tool(vault_lint, { schemas_only: true });
      expect(result).toMatch(/AGENT_VAULT.*not set/i);
    } finally {
      process.env.AGENT_VAULT = vault;
    }
  });

  // ── Emoji-prefixed schema statuses ─────────────────────────────────────────

  it("accepts 🔍 in-review as a valid schema status", async () => {
    const result = await execute_tool(vault_lint, {
      schemas_only: true,
      filter: "task-in-review",
    });
    expect(result).toBe("All files pass validation.");
  });

  it("accepts 🚫 closed as a valid schema status", async () => {
    const result = await execute_tool(vault_lint, {
      schemas_only: true,
      filter: "task-closed",
    });
    expect(result).toBe("All files pass validation.");
  });

  it("rejects bare 'todo' without emoji prefix", async () => {
    const result = await execute_tool(vault_lint, {
      schemas_only: true,
      filter: "task-bare-todo",
    });
    expect(result).toContain("task-bare-todo");
    expect(result).toMatch(/invalid status value.*todo/);
  });

  // ── Review status validation ───────────────────────────────────────────────

  it("accepts 📋 todo as a valid review status", async () => {
    const result = await execute_tool(vault_lint, {
      reviews_only: true,
      filter: "task-valid",
    });
    expect(result).toBe("All files pass validation.");
  });

  it("rejects 🔍 in-review for reviews (not in REVIEW_STATUSES)", async () => {
    const result = await execute_tool(vault_lint, {
      reviews_only: true,
      filter: "task-bad-review-status",
    });
    expect(result).toContain("task-bad-review-status");
    expect(result).toMatch(/invalid status value/);
  });
});
