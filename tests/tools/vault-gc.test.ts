import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import vault_gc from "../../src/tools/vault/gc";
import { execute_tool } from "./_lib";

let tmp: string;
let vault: string;
const origAgentVault = process.env.AGENT_VAULT;

const COMPLETE_SCHEMA = `---
status: complete
repo: gc-owner/gc-repo
date: 2026-01-01
---

# Task Complete
`;

const TODO_SCHEMA = `---
status: todo
repo: gc-owner/gc-repo
date: 2026-01-02
---

# Task Todo
`;

// No status, no issue — goes to noSignal bucket
const NO_SIGNAL_SCHEMA = `---
repo: gc-owner/gc-repo
date: 2026-01-03
---

# Task No Signal
`;

beforeAll(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "vault-gc-test-"));
  vault = path.join(tmp, "vault");

  const tasks = path.join(vault, "tasks");
  await mkdir(path.join(vault, "_misc", "archive"), {
    recursive: true,
  });
  await mkdir(path.join(tasks, "task-complete"), { recursive: true });
  await mkdir(path.join(tasks, "task-todo"), { recursive: true });
  await mkdir(path.join(tasks, "task-no-signal"), { recursive: true });

  await writeFile(
    path.join(tasks, "task-complete", "schema.md"),
    COMPLETE_SCHEMA,
  );
  await writeFile(path.join(tasks, "task-todo", "schema.md"), TODO_SCHEMA);
  await writeFile(
    path.join(tasks, "task-no-signal", "schema.md"),
    NO_SIGNAL_SCHEMA,
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

describe("vault_gc", () => {
  it("dry-run reports the complete task without moving it", async () => {
    const result = await execute_tool(vault_gc, { dry_run: true });

    expect(result).toContain("task-complete");
    expect(result).toContain("dry-run");

    // Original must still be in place
    const schema = Bun.file(
      path.join(
        vault,
        "tasks",
        "task-complete",
        "schema.md",
      ),
    );
    expect(await schema.exists()).toBe(true);
  });

  it("archives a task with status: complete", async () => {
    const result = await execute_tool(vault_gc, {});

    expect(result).toContain("archived");

    // Must appear in archive
    const archived = Bun.file(
      path.join(
        vault,
        "_misc",
        "archive",
        "task-complete",
        "schema.md",
      ),
    );
    expect(await archived.exists()).toBe(true);

    // Must be gone from tasks/
    const original = Bun.file(
      path.join(
        vault,
        "tasks",
        "task-complete",
        "schema.md",
      ),
    );
    expect(await original.exists()).toBe(false);
  });

  it("leaves a task with status: todo in place", async () => {
    const schema = Bun.file(
      path.join(
        vault,
        "tasks",
        "task-todo",
        "schema.md",
      ),
    );
    expect(await schema.exists()).toBe(true);
  });

  it("reports no-signal tasks in the summary", async () => {
    // task-complete already archived; only todo and no-signal remain
    const result = await execute_tool(vault_gc, {});
    expect(result).toContain("skipped");
  });

  it("returns a clean message when there is nothing left to archive", async () => {
    const result = await execute_tool(vault_gc, {});
    expect(result).toMatch(/0 archived|no tasks to archive/i);
  });
});
