#!/usr/bin/env bun
/**
 * test.ts — build the sandbox Docker image and run the full test suite inside it.
 *
 * 1. Builds the base sandbox image from docker/ (tag: occonf-test-base)
 * 2. Builds a test image on top that copies the repo and installs deps
 * 3. Runs `bun test` inside the container
 *
 * The repo is COPY'd (not bind-mounted) so the container gets a clean,
 * isolated snapshot — no host filesystem side-effects.
 *
 * Usage:
 *   bun run scripts/test.ts              # run full suite
 *   bun run scripts/test.ts -- --dots    # pass args to bun test
 */

import { $ } from "bun";
import { mkdtempSync, writeFileSync, rmSync, cpSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const IMAGE_BASE = "occonf-test-base";
const IMAGE_TEST = "occonf-test";
const repoRoot = join(import.meta.dir, "..");

// Forward extra CLI args to bun test (everything after --)
const bunTestArgs = process.argv.slice(2);

// ---------------------------------------------------------------------------
// 1. Build base sandbox image
// ---------------------------------------------------------------------------
console.log("\n==> Building base sandbox image…");
await $`docker build -t ${IMAGE_BASE} docker/`.cwd(repoRoot);

// ---------------------------------------------------------------------------
// 2. Build test image (copies repo, installs deps)
// ---------------------------------------------------------------------------
console.log("\n==> Preparing test image…");

const staging = mkdtempSync(join(tmpdir(), "occonf-test-"));

try {
  // Copy repo to staging (excludes heavy/irrelevant dirs)
  cpSync(repoRoot, join(staging, "repo"), {
    recursive: true,
    filter: (src) => {
      const rel = src.slice(repoRoot.length);
      // Skip .git, node_modules, out/ — they'll be regenerated
      if (
        rel === "/.git" ||
        rel === "/node_modules" ||
        rel === "/out" ||
        rel === "/test.log"
      )
        return false;
      return true;
    },
  });

  // Write test Dockerfile
  const testDockerfile = `
FROM ${IMAGE_BASE}

# Copy repo into the image
COPY repo/ /workspace/

# Install dependencies
WORKDIR /workspace
RUN bun install --frozen-lockfile

# Default command: run the test suite
CMD ["bun", "test"]
`;

  writeFileSync(join(staging, "Dockerfile"), testDockerfile);

  await $`docker build -t ${IMAGE_TEST} .`.cwd(staging);
} finally {
  rmSync(staging, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// 3. Run tests
// ---------------------------------------------------------------------------
console.log("\n==> Running test suite…");

const cmd = ["docker", "run", "--rm", IMAGE_TEST, "bun", "test"];
if (bunTestArgs.length > 0) {
  cmd.push(...bunTestArgs);
}

const proc = Bun.spawn(cmd, {
  stdout: "inherit",
  stderr: "inherit",
});

const exitCode = await proc.exited;
process.exit(exitCode);
