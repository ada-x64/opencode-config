import { describe, it, expect } from "bun:test";
import local_ci from "../../src/tools/local_ci";

// act.sh requires Docker — shape-only tests.

describe("local_ci", () => {
  it("has correct shape", () => {
    expect(local_ci.description).toContain("GitHub Actions");
    expect(local_ci.args).toHaveProperty("workflow");
    expect(local_ci.args).toHaveProperty("job");
    expect(local_ci.args).toHaveProperty("event_file");
    expect(local_ci.args).toHaveProperty("extra_args");
  });

  it("uses event_file not event", () => {
    expect(local_ci.args).not.toHaveProperty("event");
  });
});
