import { describe, it, expect } from "bun:test";
import notify_triage from "../../src/tools/notify/triage";
import triage_dashboard from "../../src/tools/triage/dashboard";
import type { ToolContext } from "@opencode-ai/plugin";

describe("notify_triage", () => {
  it("fails silently when ntfy is not configured", async () => {
    // notify.sh is designed to fail silently — should not throw
    const result = await notify_triage.execute(
      {
        type: "activity",
        task: "test-owner/test-repo/test-task",
        headline: "Test Notification",
        body: "• test bullet",
        icon: "reviewer",
        emoji: "activity",
      },
      {} as ToolContext,
    );
    expect(result).toBeTruthy();
  });

  it("has the correct tool shape", () => {
    expect(notify_triage.description).toContain("triage push notification");
    expect(notify_triage.args).toHaveProperty("type");
    expect(notify_triage.args).toHaveProperty("task");
    expect(notify_triage.args).toHaveProperty("headline");
  });
});

describe("triage_dashboard", () => {
  it("has the correct tool shape", () => {
    expect(triage_dashboard.description).toContain("triage inbox dashboard");
    expect(triage_dashboard.args).toHaveProperty("notify_summary");
  });
});
