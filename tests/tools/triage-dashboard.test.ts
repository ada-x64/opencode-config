import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import triage_dashboard from "../../src/tools/triage/dashboard";
import { execute_tool } from "./_lib";

let tmp: string;
let vault: string;
const origAgentVault = process.env.AGENT_VAULT;
const origNtfyTopic = process.env.NTFY_TOPIC;

const mkTriage = (status: string, type: string, agent: string, date: string) =>
  [
    "---",
    `status: ${status}`,
    `type: ${type}`,
    `agent: ${agent}`,
    `date: ${date}`,
    "---",
    "",
    `# Triage ${status}`,
  ].join("\n");

beforeAll(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "vault-dashboard-test-"));
  vault = path.join(tmp, "vault");

  const triageDir = path.join(vault, "_misc/triage");
  const activityDir = path.join(vault, "_misc/activity");
  const handoffsDir = path.join(vault, "_misc/handoffs");

  await mkdir(triageDir, { recursive: true });
  await mkdir(activityDir, { recursive: true });
  await mkdir(handoffsDir, { recursive: true });

  // pending escalation in _misc/triage
  await writeFile(
    path.join(triageDir, "2026-01-01T00-00-00.md"),
    mkTriage("pending", "escalation", "planner", "2026-01-01"),
  );

  // addressed activity in _misc/activity
  await writeFile(
    path.join(activityDir, "2026-01-02T00-00-00.md"),
    mkTriage("addressed", "activity", "auto-implementor", "2026-01-02"),
  );

  // dismissed handoff in _misc/handoffs
  await writeFile(
    path.join(handoffsDir, "2026-01-03T00-00-00.md"),
    mkTriage("dismissed", "handoff", "reviewer", "2026-01-03"),
  );

  process.env.AGENT_VAULT = vault;
  // Ensure notify_summary never actually fires an HTTP request
  delete process.env.NTFY_TOPIC;
});

afterAll(async () => {
  if (origAgentVault !== undefined) {
    process.env.AGENT_VAULT = origAgentVault;
  } else {
    delete process.env.AGENT_VAULT;
  }
  if (origNtfyTopic !== undefined) {
    process.env.NTFY_TOPIC = origNtfyTopic;
  }
  await rm(tmp, { recursive: true, force: true });
});

describe("triage_dashboard", () => {
  it("writes triage-inbox.md to the vault root", async () => {
    await execute_tool(triage_dashboard, {});
    const file = Bun.file(path.join(vault, "triage-inbox.md"));
    expect(await file.exists()).toBe(true);
  });

  it("returns a summary line with correct counts", async () => {
    const result = await execute_tool(triage_dashboard, {});
    expect(result).toContain("1 pending, 1 addressed, 1 dismissed");
  });

  it("dashboard contains all three sections", async () => {
    const content = await readFile(path.join(vault, "triage-inbox.md"), "utf8");
    expect(content).toContain("## Pending");
    expect(content).toContain("## Addressed");
    expect(content).toContain("## Dismissed");
  });

  it("pending row includes type, agent and date", async () => {
    const content = await readFile(path.join(vault, "triage-inbox.md"), "utf8");
    expect(content).toContain("escalation");
    expect(content).toContain("planner");
    expect(content).toContain("2026-01-01");
  });

  it("addressed row includes type, agent and date", async () => {
    const content = await readFile(path.join(vault, "triage-inbox.md"), "utf8");
    expect(content).toContain("activity");
    expect(content).toContain("auto-implementor");
    expect(content).toContain("2026-01-02");
  });

  it("dismissed row includes type, agent and date", async () => {
    const content = await readFile(path.join(vault, "triage-inbox.md"), "utf8");
    expect(content).toContain("handoff");
    expect(content).toContain("reviewer");
    expect(content).toContain("2026-01-03");
  });

  it("empty vault produces no-items messages in the dashboard", async () => {
    const emptyVault = path.join(tmp, "empty-vault");
    await mkdir(emptyVault, { recursive: true });
    process.env.AGENT_VAULT = emptyVault;
    try {
      await execute_tool(triage_dashboard, {});
      const content = await readFile(
        path.join(emptyVault, "triage-inbox.md"),
        "utf8",
      );
      expect(content).toContain("_No pending triage items._");
      expect(content).toContain("_None._");
    } finally {
      process.env.AGENT_VAULT = vault;
    }
  });

  it("notify_summary without NTFY_TOPIC returns skip message", async () => {
    // NTFY_TOPIC is deleted in beforeAll; no ntfy-topic.txt in this vault
    const result = await execute_tool(triage_dashboard, {
      notify_summary: true,
    });
    expect(result).toMatch(/no ntfy_topic|skipping/i);
  });
});
