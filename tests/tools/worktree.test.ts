import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import wt_detect from "../../src/tools/wt/detect";
import wt_owner_repo from "../../src/tools/wt/owner_repo";
import wt_switch_branch from "../../src/tools/wt/switch_branch";
import wt_cleanup from "../../src/tools/wt/cleanup";
import { execute_tool } from "./_lib";

let tmp: string;
let clonePath: string;
let bareDir: string; // the repo root with .bare/ and .git file
let mainWt: string; // the main worktree

const origAgentRepos = process.env.AGENT_REPOS;
// Git hooks set GIT_DIR / GIT_WORK_TREE which leak into child git commands,
// causing -C flags to be ignored. Save and clear them for test isolation.
const origGitDir = process.env.GIT_DIR;
const origGitWorkTree = process.env.GIT_WORK_TREE;

beforeAll(async () => {
  delete process.env.GIT_DIR;
  delete process.env.GIT_WORK_TREE;
  tmp = await mkdtemp(path.join(tmpdir(), "wt-test-"));

  // Set AGENT_REPOS to our temp repos dir
  const reposDir = path.join(tmp, "repos");
  await mkdir(reposDir, { recursive: true });
  process.env.AGENT_REPOS = reposDir;

  // Git identity for CI environments that have none configured
  const gc = ["-c", "user.name=Test", "-c", "user.email=test@test"];

  // --- Traditional clone ---
  clonePath = path.join(tmp, "clone-repo");
  await Bun.$`git init ${clonePath}`.quiet();
  await Bun.$`git -C ${clonePath} ${gc} commit --allow-empty -m init`.quiet();

  // --- Bare repo + worktree setup ---
  bareDir = path.join(reposDir, "testowner", "testrepo");
  await mkdir(bareDir, { recursive: true });
  await Bun.$`git init --bare ${bareDir}/.bare`.quiet();
  await writeFile(path.join(bareDir, ".git"), "gitdir: .bare\n");

  // Seed an initial commit
  const seed = path.join(tmp, "seed");
  await Bun.$`git clone ${bareDir}/.bare ${seed}`.quiet();
  await Bun.$`git -C ${seed} ${gc} commit --allow-empty -m init`.quiet();
  await Bun.$`git -C ${seed} push`.quiet();
  await rm(seed, { recursive: true, force: true });

  // Rename default branch to main
  await Bun.$`git -C ${bareDir}/.bare branch -m main`.quiet().nothrow();

  // Create the main worktree
  await Bun.$`git -C ${bareDir}/.bare worktree add ${bareDir}/main main`.quiet();
  mainWt = path.join(bareDir, "main");
});

afterAll(async () => {
  // Restore original env vars
  const restore = (key: string, orig: string | undefined) => {
    if (orig !== undefined) process.env[key] = orig;
    else delete process.env[key];
  };
  restore("AGENT_REPOS", origAgentRepos);
  restore("GIT_DIR", origGitDir);
  restore("GIT_WORK_TREE", origGitWorkTree);
  await rm(tmp, { recursive: true, force: true });
});

describe("wt_detect", () => {
  it("detects a traditional clone", async () => {
    const result = await execute_tool(wt_detect, { path: clonePath });
    expect(result).toBe("clone");
  });

  it("detects a worktree", async () => {
    const result = await execute_tool(wt_detect, { path: mainWt });
    expect(result).toBe("worktree");
  });

  it("detects a bare repo", async () => {
    const result = await execute_tool(wt_detect, {
      path: path.join(bareDir, ".bare"),
    });
    expect(result).toBe("bare");
  });

  it("returns unknown for a non-repo directory", async () => {
    const notRepo = path.join(tmp, "not-a-repo");
    await mkdir(notRepo, { recursive: true });
    const result = await execute_tool(wt_detect, { path: notRepo });
    expect(result).toBe("unknown");
  });
});

describe("wt_owner_repo", () => {
  it("derives owner/repo from repo root", async () => {
    const result = await execute_tool(wt_owner_repo, { path: bareDir });
    expect(result).toBe("testowner/testrepo");
  });

  it("derives owner/repo from worktree path", async () => {
    const result = await execute_tool(wt_owner_repo, { path: mainWt });
    expect(result).toBe("testowner/testrepo");
  });

  it("derives owner/repo from nested worktree path", async () => {
    // Simulate a feat/foo worktree path (just needs the directory to exist
    // for realpath -m to resolve)
    const result = await execute_tool(wt_owner_repo, {
      path: path.join(bareDir, "feat", "foo"),
    });
    expect(result).toBe("testowner/testrepo");
  });
});

describe("wt_switch_branch", () => {
  it("returns same path when already on the branch (worktree)", async () => {
    const result = await execute_tool(wt_switch_branch, {
      repo_path: mainWt,
      branch: "main",
    });
    expect(result).toBe(mainWt);
  });

  it("creates a new worktree for a new branch", async () => {
    const result = await execute_tool(wt_switch_branch, {
      repo_path: mainWt,
      branch: "feat-test",
    });
    expect(result).toBe(path.join(bareDir, "feat-test"));
    expect(existsSync(path.join(bareDir, "feat-test"))).toBe(true);

    // Verify it's on the right branch
    const branch = await Bun.$`git -C ${result} branch --show-current`.text();
    expect(branch.trim()).toBe("feat-test");
  });

  it("returns existing worktree path if already created", async () => {
    const result = await execute_tool(wt_switch_branch, {
      repo_path: mainWt,
      branch: "feat-test",
    });
    expect(result).toBe(path.join(bareDir, "feat-test"));
  });

  it("switches branch in a traditional clone", async () => {
    const result = await execute_tool(wt_switch_branch, {
      repo_path: clonePath,
      branch: "test-branch",
    });
    expect(result).toBe(clonePath);

    const branch =
      await Bun.$`git -C ${clonePath} branch --show-current`.text();
    expect(branch.trim()).toBe("test-branch");
  });
});

describe("wt_cleanup", () => {
  it("removes a worktree", async () => {
    // feat-test was created in the switch_branch test above
    const wtPath = path.join(bareDir, "feat-test");
    expect(existsSync(wtPath)).toBe(true);

    const result = await execute_tool(wt_cleanup, { worktree_path: wtPath });
    expect(result).toBeTruthy();
    expect(existsSync(wtPath)).toBe(false);
  });

  it("is a no-op for non-worktree paths", async () => {
    const result = await execute_tool(wt_cleanup, { worktree_path: clonePath });
    expect(result).toBeTruthy();
    // Clone should still exist
    expect(existsSync(clonePath)).toBe(true);
  });
});
