import { describe } from "bun:test";
import { entrypointTests } from "./entrypoint";
import { toolTests } from "./tools";

/**
 * Docker integration tests — barrel file.
 *
 * Skipped automatically when not running inside the sandbox container
 * (detected via OCCONF_SANDBOX env var set in the Dockerfile).
 */

const IN_CONTAINER = process.env.OCCONF_SANDBOX === "1";

describe.skipIf(!IN_CONTAINER)("docker", () => {
  describe("entrypoint", entrypointTests);
  describe("tools", toolTests);
});
