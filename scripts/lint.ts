#!/usr/bin/env bun
/**
 * lint.ts -- run the same checks as CI (.github/workflows/lint.yml)
 * Exit codes: 0 = all passed, 1 = one or more checks failed
 */

import { $ } from "bun";

const root = (await $`git rev-parse --show-toplevel`.text()).trim();
process.chdir(root);

type Result = { name: string; passed: boolean };
const results: Result[] = [];

function header(name: string): void {
  console.log(`\n\x1b[1;34m==> ${name}\x1b[0m`);
}

async function run(name: string, fn: () => Promise<boolean>): Promise<void> {
  header(name);
  results.push({ name, passed: await fn() });
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

await run("prettier", async () => {
  const proc = await $`bunx prettier --check .`.nothrow();
  return proc.exitCode === 0;
});

await run("oxlint", async () => {
  const files = (
    await $`find . -name '*.ts' -not -path '*/node_modules/*' -not -path '*/out/*'`
      .quiet()
      .text()
  )
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);

  if (files.length === 0) {
    console.log("(no .ts files found)");
    return true;
  }

  const proc = await $`bunx oxlint ${files}`.nothrow();
  return proc.exitCode === 0;
});

await run("shellcheck", async () => {
  // Check if shellcheck is available
  const which = await $`which shellcheck`.nothrow().quiet();
  if (which.exitCode !== 0) {
    console.log("(shellcheck not installed, skipping)");
    return true;
  }

  const files = (
    await $`find . -name '*.sh' -not -path '*/node_modules/*' -not -path '*/out/*'`
      .quiet()
      .text()
  )
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);

  if (files.length === 0) {
    console.log("(no .sh files found)");
    return true;
  }

  const proc = await $`shellcheck ${files}`.nothrow();
  return proc.exitCode === 0;
});

await run("bun test", async () => {
  const reporter = !process.env["CI"] ? "--dots" : "";
  const proc = await $`LOG_LEVEL=error bun test ${reporter}`
    .env({ ...process.env, OPENCODE_CONFIG_SRC: `${root}/src` })
    .nothrow();
  return proc.exitCode === 0;
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const failed = results.filter((r) => !r.passed);

console.log();
console.log("─".repeat(50));
for (const r of results) {
  const mark = r.passed ? "\x1b[1;32m✓\x1b[0m" : "\x1b[1;31m✗\x1b[0m";
  console.log(`  ${mark}  ${r.name}`);
}
console.log("─".repeat(50));

if (failed.length > 0) {
  console.log(
    `\n\x1b[1;31mFailed (${failed.length}/${results.length}): ${failed.map((r) => r.name).join(", ")}\x1b[0m`,
  );
  process.exit(1);
} else {
  console.log(`\n\x1b[1;32mAll ${results.length} checks passed.\x1b[0m`);
}
