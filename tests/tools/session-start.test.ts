import { describe, it, expect } from "bun:test";
import session_start from "../../src/tools/notify/start";
import { execute_tool } from "./_lib";

describe("session_start (notify_start)", () => {
  it("has the correct description", () => {
    expect(session_start.description).toContain("session start");
  });

  it("returns a recorded epoch", async () => {
    const before = Math.floor(Date.now() / 1000);
    const result = await execute_tool(session_start, {});
    const after = Math.floor(Date.now() / 1000);

    expect(result).toContain("Session start recorded");
    const match = result.match(/recorded: (\d+)/);
    expect(match).not.toBeNull();
    const epoch = parseInt(match![1]!, 10);
    expect(epoch).toBeGreaterThanOrEqual(before);
    expect(epoch).toBeLessThanOrEqual(after);
  });
});
