import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import fm_read from "../../src/tools/fm/read";
import fm_write from "../../src/tools/fm/write";
import { execute_tool } from "./_lib";

const SAMPLE_DOC = `---
status: todo
repo: owner/repo
issue: "[#1](https://github.com/owner/repo/issues/1)"
date: 2026-03-31
---

# Title
Body text with status: not-this
`;

let tmp: string;
let testFile: string;

beforeAll(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "fm-test-"));
  testFile = path.join(tmp, "test.md");
  await writeFile(testFile, SAMPLE_DOC);
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("fm_read", () => {
  it("reads a simple frontmatter value", async () => {
    const result = await execute_tool(fm_read, {
      file: testFile,
      key: "status",
    });
    expect(result).toBe("todo");
  });

  it("reads a value containing slashes", async () => {
    const result = await execute_tool(fm_read, { file: testFile, key: "repo" });
    expect(result).toBe("owner/repo");
  });

  it("reads a value with markdown links and quotes", async () => {
    const result = await execute_tool(fm_read, {
      file: testFile,
      key: "issue",
    });
    expect(result).toBe("[#1](https://github.com/owner/repo/issues/1)");
  });

  it("returns default when key is absent", async () => {
    const result = await execute_tool(fm_read, {
      file: testFile,
      key: "missing",
      default_value: "fallback",
    });
    expect(result).toBe("fallback");
  });

  it("returns empty string when key is absent and no default", async () => {
    const result = await execute_tool(fm_read, {
      file: testFile,
      key: "missing",
    });
    expect(result).toBe("");
  });
});

describe("fm_write", () => {
  it("updates an existing frontmatter value", async () => {
    await execute_tool(fm_write, {
      file: testFile,
      key: "status",
      value: "in progress",
    });
    const result = await execute_tool(fm_read, {
      file: testFile,
      key: "status",
    });
    expect(result).toBe("in progress");
  });

  it("does not corrupt the body", async () => {
    const content = await readFile(testFile, "utf-8");
    expect(content).toContain("Body text with status: not-this");
  });

  it("handles values with slashes", async () => {
    await execute_tool(fm_write, {
      file: testFile,
      key: "repo",
      value: "new-owner/new-repo",
    });
    const result = await execute_tool(fm_read, { file: testFile, key: "repo" });
    expect(result).toBe("new-owner/new-repo");
  });

  it("is a no-op for nonexistent keys", async () => {
    const before = await readFile(testFile, "utf-8");
    await execute_tool(fm_write, {
      file: testFile,
      key: "nonexistent",
      value: "anything",
    });
    const after = await readFile(testFile, "utf-8");
    expect(after).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// fm_write validation tests
// ---------------------------------------------------------------------------

const VAULT_DOC = `---
status: 📋 todo
priority: 🟡 medium
repo: owner/repo
date: 2026-01-01
---

# Title
`;

let vaultTmp: string;
let origVault: string | undefined;

beforeAll(async () => {
  vaultTmp = await mkdtemp(path.join(tmpdir(), "fm-vault-test-"));
  origVault = process.env.AGENT_VAULT;
  process.env.AGENT_VAULT = vaultTmp;
});

afterAll(async () => {
  if (origVault === undefined) {
    delete process.env.AGENT_VAULT;
  } else {
    process.env.AGENT_VAULT = origVault;
  }
  await rm(vaultTmp, { recursive: true, force: true });
});

/** Helper: create a vault-relative file and return its absolute path. */
async function makeVaultFile(relPath: string): Promise<string> {
  const abs = path.join(vaultTmp, relPath);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, VAULT_DOC);
  return abs;
}

describe("fm_write validation", () => {
  it("rejects bare 'todo' status for a tasks/ file", async () => {
    const file = await makeVaultFile("tasks/owner/repo/mytask/schema.md");
    const result = await execute_tool(fm_write, {
      file,
      key: "status",
      value: "todo",
    });
    expect(result).toMatch(/^Error:/);
    expect(result).toContain("invalid status");
    expect(result).toContain("todo");
  });

  it("accepts '📋 todo' status for a tasks/ file", async () => {
    const file = await makeVaultFile("tasks/owner/repo/mytask2/schema.md");
    const result = await execute_tool(fm_write, {
      file,
      key: "status",
      value: "📋 todo",
    });
    expect(result).not.toMatch(/^Error:/);
    const written = await execute_tool(fm_read, { file, key: "status" });
    expect(written).toBe("📋 todo");
  });

  it("rejects '🔍 in-review' status for a _misc/activity/ file", async () => {
    const file = await makeVaultFile("_misc/activity/2026-01-01-entry.md");
    const result = await execute_tool(fm_write, {
      file,
      key: "status",
      value: "🔍 in-review",
    });
    expect(result).toMatch(/^Error:/);
    expect(result).toContain("invalid status");
  });

  it("accepts '⏳ pending' status for a _misc/activity/ file", async () => {
    const file = await makeVaultFile("_misc/activity/2026-01-02-entry.md");
    const result = await execute_tool(fm_write, {
      file,
      key: "status",
      value: "⏳ pending",
    });
    expect(result).not.toMatch(/^Error:/);
    const written = await execute_tool(fm_read, { file, key: "status" });
    expect(written).toBe("⏳ pending");
  });

  it("rejects 'wip' priority for a tasks/ file", async () => {
    const file = await makeVaultFile("tasks/owner/repo/mytask3/schema.md");
    const result = await execute_tool(fm_write, {
      file,
      key: "priority",
      value: "wip",
    });
    expect(result).toMatch(/^Error:/);
    expect(result).toContain("invalid priority");
  });

  it("accepts '🟡 medium' priority for a tasks/ file", async () => {
    const file = await makeVaultFile("tasks/owner/repo/mytask4/schema.md");
    const result = await execute_tool(fm_write, {
      file,
      key: "priority",
      value: "🟡 medium",
    });
    expect(result).not.toMatch(/^Error:/);
    const written = await execute_tool(fm_read, { file, key: "priority" });
    expect(written).toBe("🟡 medium");
  });

  it("skips priority validation for non-task files (audits/)", async () => {
    const file = await makeVaultFile("audits/owner/repo/2026-01-01-audit.md");
    const result = await execute_tool(fm_write, {
      file,
      key: "priority",
      value: "wip",
    });
    // No validation for priority outside tasks/ — should not return an error
    expect(result).not.toMatch(/^Error:/);
  });

  it("rejects '🔍 in-review' for a review file, accepts '📋 todo'", async () => {
    const file = await makeVaultFile(
      "tasks/owner/repo/mytask5/reviews/review.md",
    );

    const reject = await execute_tool(fm_write, {
      file,
      key: "status",
      value: "🔍 in-review",
    });
    expect(reject).toMatch(/^Error:/);
    expect(reject).toContain("invalid status");

    const accept = await execute_tool(fm_write, {
      file,
      key: "status",
      value: "📋 todo",
    });
    expect(accept).not.toMatch(/^Error:/);
    const written = await execute_tool(fm_read, { file, key: "status" });
    expect(written).toBe("📋 todo");
  });

  it("skips validation for files outside AGENT_VAULT", async () => {
    // testFile is in a different tmpdir, outside vaultTmp
    const result = await execute_tool(fm_write, {
      file: testFile,
      key: "status",
      value: "bare-invalid-value",
    });
    // Should not error — file is outside vault
    expect(result).not.toMatch(/^Error:/);
  });

  it("skips validation when AGENT_VAULT is unset", async () => {
    const file = await makeVaultFile("tasks/owner/repo/mytask6/schema.md");
    const saved = process.env.AGENT_VAULT;
    delete process.env.AGENT_VAULT;
    try {
      const result = await execute_tool(fm_write, {
        file,
        key: "status",
        value: "bare-invalid-no-vault",
      });
      expect(result).not.toMatch(/^Error:/);
    } finally {
      process.env.AGENT_VAULT = saved;
    }
  });

  it("skips validation for non-status/priority keys (e.g. 'repo')", async () => {
    const file = await makeVaultFile("tasks/owner/repo/mytask7/schema.md");
    const result = await execute_tool(fm_write, {
      file,
      key: "repo",
      value: "any-value/no-validation",
    });
    expect(result).not.toMatch(/^Error:/);
    const written = await execute_tool(fm_read, { file, key: "repo" });
    expect(written).toBe("any-value/no-validation");
  });
});
