import { describe, it, expect } from "bun:test";
import vault_cache from "../../src/tools/vault_cache";
import vault_init from "../../src/tools/vault_init";
import local_ci from "../../src/tools/local_ci";
import session_notify from "../../src/tools/session_notify";

describe("vault_cache", () => {
  it("has correct shape", () => {
    expect(vault_cache.description).toContain("metadata cache");
    expect(vault_cache.args).toHaveProperty("filter");
  });
});

describe("vault_init", () => {
  it("has correct shape", () => {
    expect(vault_init.description).toContain("vault directory structure");
    expect(vault_init.args).toHaveProperty("vault_path");
  });
});

describe("local_ci", () => {
  it("has correct shape", () => {
    expect(local_ci.description).toContain("GitHub Actions");
    expect(local_ci.args).toHaveProperty("workflow");
    expect(local_ci.args).toHaveProperty("job");
    // Verify event arg is event_file (file path, not event name)
    expect(local_ci.args).toHaveProperty("event_file");
    expect(local_ci.args).not.toHaveProperty("event");
  });
});

describe("session_notify", () => {
  it("has correct shape", () => {
    expect(session_notify.description).toContain("3 minutes");
    expect(session_notify.args).toHaveProperty("start_epoch");
    expect(session_notify.args).toHaveProperty("icon");
    expect(session_notify.args).toHaveProperty("task");
    expect(session_notify.args).toHaveProperty("headline");
  });

  it("returns below-threshold for recent start", async () => {
    const now = Math.floor(Date.now() / 1000).toString();
    const result = await session_notify.execute({
      start_epoch: now,
      icon: "build",
    });
    expect(result).toContain("below");
  });
});
