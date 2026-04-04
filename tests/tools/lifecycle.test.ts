import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import fm_read from "../../src/tools/fm_read";
import impl_startup from "../../src/tools/impl_startup";
import impl_complete from "../../src/tools/impl_complete";

const SAMPLE_SCHEMA = `---
status: todo
repo: owner/repo
issue: "[#42](https://github.com/owner/repo/issues/42)"
branch: feat/test
date: 2026-04-04
---

# Test Schema

## Todos

### Commit 1: First group

#### 1a. \`do-something\`

Do a thing.

### Commit 2: Second group

#### 2a. \`do-another\`

Do another thing.
`;

const LOCAL_SCHEMA = `---
status: todo
repo: owner/repo
issue: local-123
branch: feat/local
date: 2026-04-04
---

# Local Schema

## Todos

### Commit 1: Only group

#### 1a. \`do-local\`

Do something local.
`;

const BLANK_ISSUE_SCHEMA = `---
status: todo
repo: owner/repo
issue:
branch: feat/blank
date: 2026-04-04
---

# Blank Issue Schema

## Todos

### Commit 1: Only group

#### 1a. \`do-blank\`

Do something blank.
`;

let tmp: string;
let schemaFile: string;
let localSchemaFile: string;
let blankIssueFile: string;

beforeAll(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "lifecycle-test-"));
  schemaFile = path.join(tmp, "schema.md");
  localSchemaFile = path.join(tmp, "local-schema.md");
  blankIssueFile = path.join(tmp, "blank-issue-schema.md");
  await writeFile(schemaFile, SAMPLE_SCHEMA);
  await writeFile(localSchemaFile, LOCAL_SCHEMA);
  await writeFile(blankIssueFile, BLANK_ISSUE_SCHEMA);
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("impl_startup", () => {
  let result: ReturnType<typeof JSON.parse>;

  beforeAll(async () => {
    const raw = await impl_startup.execute({
      schema_file: schemaFile,
      repo: "owner/repo",
    });
    result = JSON.parse(raw);
  });

  it("returns correct branch", () => {
    expect(result.branch).toBe("feat/test");
  });

  it("returns correct issue number", () => {
    expect(result.issue_number).toBe("42");
  });

  it("counts commit groups", () => {
    expect(result.group_count).toBe(2);
  });

  it("sets status to in progress", async () => {
    const status = await fm_read.execute({ file: schemaFile, key: "status" });
    expect(status).toBe("in progress");
  });

  it("returns gh commands array with 2 entries", () => {
    expect(Array.isArray(result.commands)).toBe(true);
    expect(result.commands).toHaveLength(2);
  });

  it("commands contain correct issue number", () => {
    for (const cmd of result.commands) {
      expect(cmd).toContain("42");
    }
  });

  it("commands contain correct repo", () => {
    for (const cmd of result.commands) {
      expect(cmd).toContain("owner/repo");
    }
  });

  it("no commands for local issues", async () => {
    const raw = await impl_startup.execute({
      schema_file: localSchemaFile,
      repo: "owner/repo",
    });
    const localResult = JSON.parse(raw);
    expect(localResult.commands).toEqual([]);
    expect(localResult.issue_number).toBe("");
  });

  it("no commands for blank issue", async () => {
    const raw = await impl_startup.execute({
      schema_file: blankIssueFile,
      repo: "owner/repo",
    });
    const blankResult = JSON.parse(raw);
    expect(blankResult.commands).toEqual([]);
  });
});

describe("impl_complete", () => {
  it("sets status to complete", async () => {
    await impl_complete.execute({
      schema_file: schemaFile,
      repo: "owner/repo",
      branch: "feat/test",
    });
    const status = await fm_read.execute({ file: schemaFile, key: "status" });
    expect(status).toBe("complete");
  });

  it("returns gh commands with remove and add label", async () => {
    const raw = await impl_complete.execute({
      schema_file: schemaFile,
      repo: "owner/repo",
      branch: "feat/test",
    });
    const result = JSON.parse(raw);
    expect(Array.isArray(result.commands)).toBe(true);
    const combined = result.commands.join(" ");
    expect(combined).toContain('--remove-label "in-progress"');
    expect(combined).toContain('--add-label "review-ready"');
  });

  it("uses branch arg in comment command", async () => {
    const raw = await impl_complete.execute({
      schema_file: schemaFile,
      repo: "owner/repo",
      branch: "feat/test",
    });
    const result = JSON.parse(raw);
    const commentCmd = result.commands.find((c: string) =>
      c.includes("comment"),
    );
    expect(commentCmd).toContain("feat/test");
  });

  it("no commands for blank issue", async () => {
    const raw = await impl_complete.execute({
      schema_file: blankIssueFile,
      repo: "owner/repo",
      branch: "feat/blank",
    });
    const result = JSON.parse(raw);
    expect(result.commands).toEqual([]);
  });
});
