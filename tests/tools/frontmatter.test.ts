import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import fm_read from "../../src/tools/fm/read";
import fm_write from "../../src/tools/fm/write";
import { parseFlowArray, validateFmValue } from "../../src/tools/fm/_lib";
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
      if (saved !== undefined) {
        process.env.AGENT_VAULT = saved;
      } else {
        delete process.env.AGENT_VAULT;
      }
    }
  });

  it("validates repo format for task files (accepts valid owner/repo)", async () => {
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

  it("validates audits/ status enum", async () => {
    const file = await makeVaultFile("audits/owner/repo/2026-01-01-audit.md");
    // "📋 todo" is not valid for audits — only "🔨 in-progress" and "✅ complete"
    // The vault doc starts with "📋 todo", so set a different invalid value to
    // ensure fmWrite detects a change and triggers validation.
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
      value: "✅ complete",
    });
    expect(accept).not.toMatch(/^Error:/);
  });

  it("validates designs/ status enum", async () => {
    const file = await makeVaultFile("designs/my-design.md");
    const reject = await execute_tool(fm_write, {
      file,
      key: "status",
      value: "🔨 in-progress",
    });
    expect(reject).toMatch(/^Error:/);

    const accept = await execute_tool(fm_write, {
      file,
      key: "status",
      value: "📝 draft",
    });
    expect(accept).not.toMatch(/^Error:/);
  });

  it("validates drafts/ status enum", async () => {
    const file = await makeVaultFile("drafts/my-draft.md");
    const reject = await execute_tool(fm_write, {
      file,
      key: "status",
      value: "✅ complete",
    });
    expect(reject).toMatch(/^Error:/);

    const accept = await execute_tool(fm_write, {
      file,
      key: "status",
      value: "📤 promoted",
    });
    expect(accept).not.toMatch(/^Error:/);
  });

  it("is a silent no-op for missing keys — no validation error", async () => {
    const file = await makeVaultFile("tasks/owner/repo/mytask8/schema.md");
    const result = await execute_tool(fm_write, {
      file,
      key: "nonexistent",
      value: "bare-invalid",
    });
    // Key doesn't exist in frontmatter → fmWrite is a no-op → no validation
    expect(result).not.toMatch(/^Error:/);
  });
});

// ---------------------------------------------------------------------------
// parseFlowArray tests
// ---------------------------------------------------------------------------

describe("parseFlowArray", () => {
  it("parses a multi-element array", () => {
    expect(parseFlowArray("[a, b, c]")).toEqual(["a", "b", "c"]);
  });

  it("returns null for a scalar", () => {
    expect(parseFlowArray("foo")).toBeNull();
  });

  it("parses an empty array", () => {
    expect(parseFlowArray("[]")).toEqual([]);
  });

  it("parses a single-element array", () => {
    expect(parseFlowArray("[single]")).toEqual(["single"]);
  });

  it("handles whitespace around brackets", () => {
    expect(parseFlowArray("  [ a , b ]  ")).toEqual(["a", "b"]);
  });

  it("filters out empty entries from trailing comma", () => {
    expect(parseFlowArray("[a, b, ]")).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// validateFmValue tests for estimate, tags, repo
// ---------------------------------------------------------------------------

describe("validateFmValue for estimate", () => {
  it("accepts valid estimate 'M'", () => {
    expect(
      validateFmValue(`${vaultTmp}/tasks/t/schema.md`, "estimate", "M"),
    ).toBeNull();
  });

  it("accepts valid estimate 'XS'", () => {
    expect(
      validateFmValue(`${vaultTmp}/tasks/t/schema.md`, "estimate", "XS"),
    ).toBeNull();
  });

  it("accepts valid estimate 'XL'", () => {
    expect(
      validateFmValue(`${vaultTmp}/tasks/t/schema.md`, "estimate", "XL"),
    ).toBeNull();
  });

  it("rejects invalid estimate 'XXL'", () => {
    expect(
      validateFmValue(`${vaultTmp}/tasks/t/schema.md`, "estimate", "XXL"),
    ).toMatch(/invalid estimate/);
  });

  it("rejects lowercase estimate 'm'", () => {
    expect(
      validateFmValue(`${vaultTmp}/tasks/t/schema.md`, "estimate", "m"),
    ).toMatch(/invalid estimate/);
  });

  it("skips estimate validation for non-task files", () => {
    expect(
      validateFmValue(`${vaultTmp}/audits/a/b.md`, "estimate", "INVALID"),
    ).toBeNull();
  });
});

describe("validateFmValue for tags", () => {
  it("accepts known tags (always returns null)", () => {
    expect(
      validateFmValue(`${vaultTmp}/tasks/t/schema.md`, "tags", "[ci, bug]"),
    ).toBeNull();
  });

  it("accepts unknown tags (soft vocabulary — no write-time error)", () => {
    expect(
      validateFmValue(
        `${vaultTmp}/tasks/t/schema.md`,
        "tags",
        "[ci, custom-tag]",
      ),
    ).toBeNull();
  });

  it("accepts empty tags array", () => {
    expect(
      validateFmValue(`${vaultTmp}/tasks/t/schema.md`, "tags", "[]"),
    ).toBeNull();
  });
});

describe("validateFmValue for repo", () => {
  it("accepts scalar owner/repo", () => {
    expect(
      validateFmValue(`${vaultTmp}/tasks/t/schema.md`, "repo", "owner/repo"),
    ).toBeNull();
  });

  it("accepts flow array of repos", () => {
    expect(
      validateFmValue(
        `${vaultTmp}/tasks/t/schema.md`,
        "repo",
        "[owner/a, owner/b]",
      ),
    ).toBeNull();
  });

  it("rejects malformed repo in array", () => {
    expect(
      validateFmValue(`${vaultTmp}/tasks/t/schema.md`, "repo", "[malformed]"),
    ).toMatch(/invalid repo/);
  });

  it("rejects malformed scalar repo", () => {
    expect(
      validateFmValue(`${vaultTmp}/tasks/t/schema.md`, "repo", "no-slash"),
    ).toMatch(/invalid repo/);
  });

  it("rejects repo with spaces", () => {
    expect(
      validateFmValue(`${vaultTmp}/tasks/t/schema.md`, "repo", "owner/ repo"),
    ).toMatch(/invalid repo/);
  });
});

// ---------------------------------------------------------------------------
// fm_read flow-array test
// ---------------------------------------------------------------------------

describe("fm_read flow-array", () => {
  it("reads flow array value as raw string", async () => {
    const doc = `---\nrepo: [owner/a, owner/b]\n---\n\n# Title\n`;
    const file = path.join(tmp, "flow-array.md");
    await writeFile(file, doc);
    const result = await execute_tool(fm_read, { file, key: "repo" });
    expect(result).toBe("[owner/a, owner/b]");
  });
});
