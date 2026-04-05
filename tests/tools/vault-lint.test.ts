import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import vault_lint from "../../src/tools/vault_lint";
import { execute_tool } from "./_lib";

// Each test file owns its own isolated vault so it never touches the real
// AGENT_VAULT and never races against other test files.

let tmp: string;
let vault: string;
const origAgentVault = process.env.AGENT_VAULT;

const VALID_SCHEMA = `---
status: todo
repo: lint-owner/lint-repo
date: 2026-01-01
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
status: todo
repo: lint-owner/lint-repo
date: 2026-01-01
---

# My Broken Task
`;

// Bad status value (all sections present)
const BAD_STATUS_SCHEMA = `---
status: wip
repo: lint-owner/lint-repo
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

beforeAll(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "vault-lint-test-"));
  vault = path.join(tmp, "vault");

  const base = path.join(vault, "tasks", "lint-owner", "lint-repo");
  await mkdir(path.join(base, "task-valid"), { recursive: true });
  await mkdir(path.join(base, "task-invalid"), { recursive: true });
  await mkdir(path.join(base, "task-bad-status"), { recursive: true });

  await writeFile(path.join(base, "task-valid", "schema.md"), VALID_SCHEMA);
  await writeFile(path.join(base, "task-invalid", "schema.md"), INVALID_SCHEMA);
  await writeFile(
    path.join(base, "task-bad-status", "schema.md"),
    BAD_STATUS_SCHEMA,
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
      filter: "lint-owner/lint-repo/task-valid",
    });
    expect(result).toBe("All files pass validation.");
  });

  // ── Invalid schema ─────────────────────────────────────────────────────────

  it("reports missing H2 sections for an invalid schema", async () => {
    const result = await execute_tool(vault_lint, {
      schemas_only: true,
      filter: "lint-owner/lint-repo/task-invalid",
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
      filter: "lint-owner/lint-repo/task-invalid",
    });
    expect(result).toMatch(/warning.*missing 'issue'/i);
  });

  it("reports an invalid status value", async () => {
    const result = await execute_tool(vault_lint, {
      schemas_only: true,
      filter: "lint-owner/lint-repo/task-bad-status",
    });
    expect(result).toContain("task-bad-status");
    expect(result).toMatch(/invalid status value.*wip/);
  });

  it("includes 'Lint found issues above.' footer when errors exist", async () => {
    const result = await execute_tool(vault_lint, {
      schemas_only: true,
      filter: "lint-owner/lint-repo/task-invalid",
    });
    expect(result).toContain("Lint found issues above.");
  });

  // ── Filter ─────────────────────────────────────────────────────────────────

  it("filter scopes lint to matching paths only", async () => {
    const result = await execute_tool(vault_lint, {
      schemas_only: true,
      filter: "lint-owner/lint-repo/task-valid",
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
});
