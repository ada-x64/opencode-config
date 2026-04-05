import { describe, it, expect } from "bun:test";
import session_notify from "../../src/tools/session_notify";
import { execute_tool } from "./_lib";

describe("session_notify", () => {
  it("has the correct description", () => {
    expect(session_notify.description).toContain("3 minutes");
  });

  it("has start_epoch, icon, task, and headline args", () => {
    expect(session_notify.args).toHaveProperty("start_epoch");
    expect(session_notify.args).toHaveProperty("icon");
    expect(session_notify.args).toHaveProperty("task");
    expect(session_notify.args).toHaveProperty("headline");
  });

  it("returns below-threshold message for a recent start epoch", async () => {
    const now = Math.floor(Date.now() / 1000).toString();
    const result = await execute_tool(session_notify, {
      start_epoch: now,
      icon: "build",
    });
    expect(result).toContain("below");
    expect(result).toMatch(/\d+s/);
  });

  it("includes elapsed seconds in the below-threshold message", async () => {
    // Use a start 10s ago — still well under 180s
    const tenSecondsAgo = (Math.floor(Date.now() / 1000) - 10).toString();
    const result = await execute_tool(session_notify, {
      start_epoch: tenSecondsAgo,
      icon: "plan",
    });
    expect(result).toContain("below");
    const match = result.match(/(\d+)s/);
    expect(match).not.toBeNull();
    const elapsed = parseInt(match![1]!, 10);
    expect(elapsed).toBeGreaterThanOrEqual(10);
    expect(elapsed).toBeLessThan(30);
  });

  it("returns an error for an invalid start_epoch", async () => {
    const result = await execute_tool(session_notify, {
      start_epoch: "not-a-number",
      icon: "build",
    });
    expect(result).toContain("Invalid");
  });

  it("would notify for a start epoch older than 3 minutes", async () => {
    // 4 minutes ago — crosses the 180s threshold.
    // notify.sh will fail silently in CI (no ntfy configured), but the
    // tool should still return the "Notification sent" message.
    const fourMinsAgo = (Math.floor(Date.now() / 1000) - 240).toString();
    const result = await execute_tool(session_notify, {
      start_epoch: fourMinsAgo,
      icon: "build",
      task: "test-owner/test-repo/test-task",
      headline: "Test Complete",
    });
    expect(result).toContain("minutes");
    expect(result).not.toContain("below");
  });
});
