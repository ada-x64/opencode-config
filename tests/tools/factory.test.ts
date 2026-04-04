import { describe, it, expect } from "bun:test";
import { configDir, libTool, scriptTool } from "../../src/tools/_lib";
import { tool } from "@opencode-ai/plugin";

describe("_lib exports", () => {
  it("exports configDir", () => {
    expect(typeof configDir).toBe("string");
    expect(configDir.length).toBeGreaterThan(0);
  });

  it("libTool returns a tool-shaped object", () => {
    const t = libTool({
      description: "test",
      args: { name: tool.schema.string().describe("test") },
      lib: "nonexistent.sh",
      fn: "noop",
    });
    expect(t).toHaveProperty("description");
    expect(t).toHaveProperty("args");
    expect(t).toHaveProperty("execute");
  });

  it("scriptTool returns a tool-shaped object", () => {
    const t = scriptTool({
      description: "test",
      args: { name: tool.schema.string().describe("test") },
      script: "nonexistent.sh",
      buildArgs: () => [],
    });
    expect(t).toHaveProperty("description");
    expect(t).toHaveProperty("args");
    expect(t).toHaveProperty("execute");
  });
});
