import { describe, it, expect } from "bun:test";
import vault_cache from "../../src/tools/vault_cache";

// refresh.sh requires GitHub auth and live network — shape-only tests.

describe("vault_cache", () => {
  it("has correct shape", () => {
    expect(vault_cache.description).toContain("metadata cache");
    expect(vault_cache.args).toHaveProperty("filter");
  });

  it("description mentions refreshing the cache", () => {
    expect(vault_cache.description).toContain("cache");
  });
});
