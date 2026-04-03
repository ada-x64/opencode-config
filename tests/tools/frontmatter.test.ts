import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile, readFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import fm_read from "../../src/tools/fm_read";
import fm_write from "../../src/tools/fm_write";

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
    const result = await fm_read.execute({ file: testFile, key: "status" });
    expect(result).toBe("todo");
  });

  it("reads a value containing slashes", async () => {
    const result = await fm_read.execute({ file: testFile, key: "repo" });
    expect(result).toBe("owner/repo");
  });

  it("reads a value with markdown links and quotes", async () => {
    const result = await fm_read.execute({ file: testFile, key: "issue" });
    expect(result).toBe("[#1](https://github.com/owner/repo/issues/1)");
  });

  it("returns default when key is absent", async () => {
    const result = await fm_read.execute({
      file: testFile,
      key: "missing",
      default_value: "fallback",
    });
    expect(result).toBe("fallback");
  });

  it("returns empty string when key is absent and no default", async () => {
    const result = await fm_read.execute({ file: testFile, key: "missing" });
    expect(result).toBe("");
  });
});

describe("fm_write", () => {
  it("updates an existing frontmatter value", async () => {
    await fm_write.execute({
      file: testFile,
      key: "status",
      value: "in progress",
    });
    const result = await fm_read.execute({ file: testFile, key: "status" });
    expect(result).toBe("in progress");
  });

  it("does not corrupt the body", async () => {
    const content = await readFile(testFile, "utf-8");
    expect(content).toContain("Body text with status: not-this");
  });

  it("handles values with slashes", async () => {
    await fm_write.execute({
      file: testFile,
      key: "repo",
      value: "new-owner/new-repo",
    });
    const result = await fm_read.execute({ file: testFile, key: "repo" });
    expect(result).toBe("new-owner/new-repo");
  });

  it("is a no-op for nonexistent keys", async () => {
    const before = await readFile(testFile, "utf-8");
    await fm_write.execute({
      file: testFile,
      key: "nonexistent",
      value: "anything",
    });
    const after = await readFile(testFile, "utf-8");
    expect(after).toBe(before);
  });
});
