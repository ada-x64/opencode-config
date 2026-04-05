import { describe, it, expect } from "bun:test";
import triage_write from "../../src/tools/triage_write";
import { execute_tool } from "./_lib";
import path from "path";

describe("triage_write", () => {
  // ── Shape / description tests ──────────────────────────────────────────────

  it("has the correct tool shape", () => {
    expect(triage_write.description).toContain("triage entry");
    expect(triage_write.args).toHaveProperty("type");
    expect(triage_write.args).toHaveProperty("task");
    expect(triage_write.args).toHaveProperty("agent");
    expect(triage_write.args).toHaveProperty("headline");
    expect(triage_write.args).toHaveProperty("body");
    expect(triage_write.args).toHaveProperty("severity");
  });

  it("description mentions key directories", () => {
    expect(triage_write.description).toContain("_misc/triage");
    expect(triage_write.description).toContain("_misc/activity");
    expect(triage_write.description).toContain("_misc/handoffs");
  });

  it("description mentions return value", () => {
    expect(triage_write.description).toContain("path");
    expect(triage_write.description).toContain("filename");
    expect(triage_write.description).toContain("notify_triage");
  });

  // ── Behavioural tests ──────────────────────────────────────────────────────

  it("writes an activity entry to _misc/activity/ and returns valid JSON", async () => {
    const raw = await execute_tool(triage_write, {
      type: "activity",
      task: "ada-x64/opencode-config/test-task",
      agent: "auto-implementor",
      headline: "Activity test entry",
      body: "Body for activity test.",
    });

    const parsed = JSON.parse(raw);
    expect(parsed).toHaveProperty("path");
    expect(parsed).toHaveProperty("filename");
    expect(parsed.path).toContain("_misc/activity");
    expect(parsed.filename).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.md$/,
    );
  });

  it("writes an escalation entry to _misc/triage/", async () => {
    const raw = await execute_tool(triage_write, {
      type: "escalation",
      task: "ada-x64/opencode-config/escalation-task",
      agent: "auto-implementor",
      headline: "Escalation test entry",
      body: "Body for escalation test.",
    });

    const parsed = JSON.parse(raw);
    expect(parsed.path).toContain("_misc/triage");
    expect(parsed.filename).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.md$/,
    );
  });

  it("writes a handoff entry to _misc/handoffs/", async () => {
    const raw = await execute_tool(triage_write, {
      type: "handoff",
      task: "ada-x64/opencode-config/handoff-task",
      agent: "auto-implementor",
      headline: "Handoff test entry",
      body: "Body for handoff test.",
    });

    const parsed = JSON.parse(raw);
    expect(parsed.path).toContain("_misc/handoffs");
    expect(parsed.filename).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.md$/,
    );
  });

  it("written file exists on disk at AGENT_VAULT/<path>", async () => {
    const raw = await execute_tool(triage_write, {
      type: "activity",
      task: "ada-x64/opencode-config/existence-task",
      agent: "auto-implementor",
      headline: "Existence check entry",
      body: "Body for existence test.",
    });

    const parsed = JSON.parse(raw);
    const fullPath = path.join(process.env.AGENT_VAULT!, parsed.path);
    const file = Bun.file(fullPath);
    expect(await file.exists()).toBe(true);
  });

  it("written file contains expected frontmatter fields", async () => {
    const raw = await execute_tool(triage_write, {
      type: "activity",
      task: "ada-x64/opencode-config/frontmatter-task",
      agent: "auto-implementor",
      headline: "Frontmatter check entry",
      body: "Body for frontmatter test.",
    });

    const parsed = JSON.parse(raw);
    const fullPath = path.join(process.env.AGENT_VAULT!, parsed.path);
    const content = await Bun.file(fullPath).text();

    expect(content).toContain("type:");
    expect(content).toContain("agent:");
    expect(content).toContain("task:");
    expect(content).toContain("repo:");
    expect(content).toContain("headline:");
    expect(content).toContain("date:");
    expect(content).toContain("status:");
  });

  it("written file contains correct frontmatter values", async () => {
    const raw = await execute_tool(triage_write, {
      type: "activity",
      task: "ada-x64/opencode-config/values-task",
      agent: "auto-implementor",
      headline: "Values check entry",
      body: "Body for values test.",
    });

    const parsed = JSON.parse(raw);
    const fullPath = path.join(process.env.AGENT_VAULT!, parsed.path);
    const content = await Bun.file(fullPath).text();

    expect(content).toContain("activity");
    expect(content).toContain("auto-implementor");
    expect(content).toContain("Values check entry");
  });

  it("entry with severity includes it in the frontmatter", async () => {
    const raw = await execute_tool(triage_write, {
      type: "escalation",
      task: "ada-x64/opencode-config/severity-task",
      agent: "auto-implementor",
      headline: "Severity check entry",
      body: "Body for severity test.",
      severity: "high",
    });

    const parsed = JSON.parse(raw);
    expect(parsed.path).toContain("_misc/triage");

    const fullPath = path.join(process.env.AGENT_VAULT!, parsed.path);
    const content = await Bun.file(fullPath).text();

    expect(content).toContain("severity:");
    expect(content).toContain("high");
  });
});
