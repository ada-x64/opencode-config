import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import {
  extractFrontmatter,
  fmGet,
  rebuildContent,
  resolveIncludes,
  resolveAgentVars,
  stampAgentModels,
  stampBashPermissions,
  stampExternalDirs,
  convertAskToAllow,
  resolveConfigDir,
  buildBashBlock,
} from "../../scripts/build.ts";

// ---------------------------------------------------------------------------
// Pure unit tests — no filesystem
// ---------------------------------------------------------------------------

describe("extractFrontmatter", () => {
  it("returns [fmStr, rest] for valid frontmatter", () => {
    const doc = "---\nkey: value\n---\n\n# Body";
    const result = extractFrontmatter(doc);
    expect(result).not.toBeNull();
    const [fm, rest] = result!;
    expect(fm).toBe("key: value");
    expect(rest).toBe("\n\n# Body");
  });

  it("returns null when no frontmatter", () => {
    expect(extractFrontmatter("# Just a heading")).toBeNull();
  });

  it("handles multiline frontmatter", () => {
    const doc = "---\na: 1\nb: 2\n---\nbody";
    const [fm] = extractFrontmatter(doc)!;
    expect(fm).toBe("a: 1\nb: 2");
  });

  it("rest is empty string for no body", () => {
    const doc = "---\nkey: val\n---";
    const [, rest] = extractFrontmatter(doc)!;
    expect(rest).toBe("");
  });
});

describe("fmGet", () => {
  const fm = "status: todo\nrepo: owner/repo\ntier: execute";

  it("reads a simple value", () => {
    expect(fmGet(fm, "status")).toBe("todo");
  });

  it("reads a value with slashes", () => {
    expect(fmGet(fm, "repo")).toBe("owner/repo");
  });

  it("returns null for missing key", () => {
    expect(fmGet(fm, "missing")).toBeNull();
  });

  it("does not match partial key names", () => {
    expect(fmGet(fm, "stat")).toBeNull();
  });

  it("trims leading whitespace from value", () => {
    expect(fmGet("key:   spaced", "key")).toBe("spaced");
  });
});

describe("rebuildContent", () => {
  it("wraps lines in frontmatter delimiters", () => {
    const result = rebuildContent(["a: 1", "b: 2"], "\n\nbody");
    expect(result).toBe("---\na: 1\nb: 2\n---\n\nbody");
  });

  it("round-trips with extractFrontmatter", () => {
    const original = "---\nkey: val\n---\n\n# Hello";
    const [fm, rest] = extractFrontmatter(original)!;
    expect(rebuildContent(fm.split("\n"), rest)).toBe(original);
  });

  it("handles empty rest", () => {
    const result = rebuildContent(["x: y"], "");
    expect(result).toBe("---\nx: y\n---");
  });
});

// ---------------------------------------------------------------------------
// Integration tests — filesystem
// ---------------------------------------------------------------------------

let tmp: string;

beforeAll(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "build-test-"));
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------

describe("resolveIncludes", () => {
  it("inlines the content of an {{include:}} directive", async () => {
    const dir = path.join(tmp, "includes-basic");
    const srcDir = path.join(tmp, "includes-basic-src");
    await mkdir(dir, { recursive: true });
    await mkdir(srcDir, { recursive: true });

    await writeFile(
      path.join(srcDir, "snippet.md"),
      "## Shared Section\n\nShared content here.\n",
    );
    await writeFile(
      path.join(dir, "agent.md"),
      "# Agent\n\n{{include:snippet.md}}\n",
    );

    resolveIncludes(dir, srcDir);

    const result = await readFile(path.join(dir, "agent.md"), "utf-8");
    expect(result).toContain("## Shared Section");
    expect(result).toContain("Shared content here.");
    expect(result).not.toContain("{{include:");
  });

  it("preserves indentation when the directive is indented", async () => {
    const dir = path.join(tmp, "includes-indent");
    const srcDir = path.join(tmp, "includes-indent-src");
    await mkdir(dir, { recursive: true });
    await mkdir(srcDir, { recursive: true });

    await writeFile(path.join(srcDir, "frag.md"), "line one\nline two\n");
    await writeFile(
      path.join(dir, "agent.md"),
      "top:\n  {{include:frag.md}}\n",
    );

    resolveIncludes(dir, srcDir);

    const result = await readFile(path.join(dir, "agent.md"), "utf-8");
    expect(result).toContain("  line one");
    expect(result).toContain("  line two");
  });

  it("warns but keeps placeholder when include file is missing", async () => {
    const dir = path.join(tmp, "includes-missing");
    const srcDir = path.join(tmp, "includes-missing-src");
    await mkdir(dir, { recursive: true });
    await mkdir(srcDir, { recursive: true });

    await writeFile(path.join(dir, "agent.md"), "{{include:nonexistent.md}}\n");

    resolveIncludes(dir, srcDir);

    const result = await readFile(path.join(dir, "agent.md"), "utf-8");
    expect(result).toContain("{{include:nonexistent.md}}");
  });

  it("leaves files without placeholders unchanged", async () => {
    const dir = path.join(tmp, "includes-noop");
    const srcDir = path.join(tmp, "includes-noop-src");
    await mkdir(dir, { recursive: true });
    await mkdir(srcDir, { recursive: true });

    const content = "# No includes here\n";
    await writeFile(path.join(dir, "agent.md"), content);

    resolveIncludes(dir, srcDir);

    const result = await readFile(path.join(dir, "agent.md"), "utf-8");
    expect(result).toBe(content);
  });
});

// ---------------------------------------------------------------------------

describe("resolveAgentVars", () => {
  const makeDoc = (icon: string, events: string) =>
    [
      `<!-- triage_icon: ${icon} -->`,
      `<!-- triage_events:`,
      events,
      `-->`,
      "",
      "# Agent",
      "",
      "Icon: {{TRIAGE_ICON}}",
      "",
      "Events:",
      "{{TRIAGE_EVENTS}}",
    ].join("\n");

  it("replaces {{TRIAGE_ICON}} with the comment value", async () => {
    const dir = path.join(tmp, "vars-icon");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "agent.md"), makeDoc("planner", "- plan"));

    resolveAgentVars(dir);

    const result = await readFile(path.join(dir, "agent.md"), "utf-8");
    expect(result).toContain("Icon: planner");
    expect(result).not.toContain("{{TRIAGE_ICON}}");
    expect(result).not.toContain("triage_icon:");
  });

  it("replaces {{TRIAGE_EVENTS}} with the comment block", async () => {
    const dir = path.join(tmp, "vars-events");
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "agent.md"),
      makeDoc("reviewer", "- schema_written\n- review_done"),
    );

    resolveAgentVars(dir);

    const result = await readFile(path.join(dir, "agent.md"), "utf-8");
    expect(result).toContain("schema_written");
    expect(result).toContain("review_done");
    expect(result).not.toContain("{{TRIAGE_EVENTS}}");
  });

  it("skips files in _shared/ directories", async () => {
    const dir = path.join(tmp, "vars-shared");
    const sharedDir = path.join(dir, "_shared");
    await mkdir(sharedDir, { recursive: true });

    const content = makeDoc("x", "- e");
    await writeFile(path.join(sharedDir, "fragment.md"), content);

    resolveAgentVars(dir);

    const result = await readFile(path.join(sharedDir, "fragment.md"), "utf-8");
    expect(result).toContain("{{TRIAGE_ICON}}");
  });
});

// ---------------------------------------------------------------------------

describe("stampAgentModels", () => {
  const makeAgent = (tier: string, model?: string) =>
    [
      "---",
      `name: test-agent`,
      `tier: ${tier}`,
      model ? `model: ${model}` : null,
      "---",
      "",
      "# Agent",
    ]
      .filter((l) => l !== null)
      .join("\n");

  const config = {
    global: {
      model: "global-model",
      external_directory: [],
    },
    tiers: {
      execute: { model: "execute-model" },
      design: { model: null },
    },
  };

  it("stamps the tier model onto an agent file", async () => {
    const dir = path.join(tmp, "models-stamp");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "agent.md"), makeAgent("execute"));

    stampAgentModels(dir, config);

    const result = await readFile(path.join(dir, "agent.md"), "utf-8");
    expect(result).toContain("model: execute-model");
  });

  it("removes model line for tiers that inherit global (model: null)", async () => {
    const dir = path.join(tmp, "models-remove");
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "agent.md"),
      makeAgent("design", "old-model"),
    );

    stampAgentModels(dir, config);

    const result = await readFile(path.join(dir, "agent.md"), "utf-8");
    expect(result).not.toContain("model:");
  });

  it("updates an existing model line in place", async () => {
    const dir = path.join(tmp, "models-update");
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "agent.md"),
      makeAgent("execute", "stale-model"),
    );

    stampAgentModels(dir, config);

    const result = await readFile(path.join(dir, "agent.md"), "utf-8");
    expect(result).toContain("model: execute-model");
    expect(result).not.toContain("stale-model");
  });

  it("skips agents with no tier field", async () => {
    const dir = path.join(tmp, "models-notier");
    await mkdir(dir, { recursive: true });
    const content = "---\nname: notier\n---\n# Agent\n";
    await writeFile(path.join(dir, "agent.md"), content);

    stampAgentModels(dir, config);

    const result = await readFile(path.join(dir, "agent.md"), "utf-8");
    expect(result).toBe(content);
  });
});

// ---------------------------------------------------------------------------

describe("buildBashBlock", () => {
  it("returns a string for a known host agent", () => {
    const block = buildBashBlock("planner", "host");
    expect(block).not.toBeNull();
    expect(block).toContain("bash:");
  });

  it("includes baseline entries in host block", () => {
    const block = buildBashBlock("planner", "host");
    // Baseline contains common entries like cat, echo, etc.
    expect(block).toMatch(/cat \*/);
  });

  it("returns a string for sandbox variant", () => {
    const block = buildBashBlock("planner", "sandbox");
    expect(block).not.toBeNull();
    expect(block).toContain("bash:");
  });

  it("indents every line by 2 spaces", () => {
    const block = buildBashBlock("planner", "host")!;
    for (const line of block.split("\n")) {
      expect(line).toMatch(/^  /);
    }
  });

  it("returns null for an unknown host agent", () => {
    const block = buildBashBlock("nonexistent-agent", "host");
    expect(block).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("stampBashPermissions", () => {
  const makeAgent = (name: string) =>
    `---\nname: ${name}\npermission:\n{{BASH_PERMISSIONS}}\n---\n# ${name}\n`;

  it("replaces {{BASH_PERMISSIONS}} placeholder in a host agent", async () => {
    const dir = path.join(tmp, "bash-host");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "planner.md"), makeAgent("planner"));

    stampBashPermissions(dir, "host");

    const result = await readFile(path.join(dir, "planner.md"), "utf-8");
    expect(result).not.toContain("{{BASH_PERMISSIONS}}");
    expect(result).toContain("bash:");
  });

  it("replaces {{BASH_PERMISSIONS}} placeholder in sandbox variant", async () => {
    const dir = path.join(tmp, "bash-sandbox");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "planner.md"), makeAgent("planner"));

    stampBashPermissions(dir, "sandbox");

    const result = await readFile(path.join(dir, "planner.md"), "utf-8");
    expect(result).not.toContain("{{BASH_PERMISSIONS}}");
    expect(result).toContain("bash:");
  });

  it("leaves files without the placeholder unchanged", async () => {
    const dir = path.join(tmp, "bash-noop");
    await mkdir(dir, { recursive: true });
    const content = "---\nname: planner\n---\n# planner\n";
    await writeFile(path.join(dir, "planner.md"), content);

    stampBashPermissions(dir, "host");

    const result = await readFile(path.join(dir, "planner.md"), "utf-8");
    expect(result).toBe(content);
  });
});

// ---------------------------------------------------------------------------

describe("stampExternalDirs", () => {
  const extDirs = ["{env:AGENT_REPOS}/**", "{env:AGENT_VAULT}/**"];

  const makeAgent = (withExisting = false) =>
    [
      "---",
      "name: agent",
      "permission:",
      ...(withExisting
        ? ["  external_directory:", '    "old/path/**": allow', "  task:"]
        : ["  task:"]),
      "---",
      "# Agent",
    ].join("\n");

  it("inserts external_directory block before task: in host variant", async () => {
    const dir = path.join(tmp, "extdirs-insert");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "agent.md"), makeAgent(false));

    stampExternalDirs(dir, extDirs, "host");

    const result = await readFile(path.join(dir, "agent.md"), "utf-8");
    expect(result).toContain("external_directory:");
    expect(result).toContain("{env:AGENT_REPOS}/**");
    expect(result).toContain("{env:AGENT_VAULT}/**");
  });

  it("replaces existing external_directory block in host variant", async () => {
    const dir = path.join(tmp, "extdirs-replace");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "agent.md"), makeAgent(true));

    stampExternalDirs(dir, extDirs, "host");

    const result = await readFile(path.join(dir, "agent.md"), "utf-8");
    expect(result).not.toContain("old/path/**");
    expect(result).toContain("{env:AGENT_REPOS}/**");
  });

  it("removes external_directory block entirely in sandbox variant", async () => {
    const dir = path.join(tmp, "extdirs-sandbox");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "agent.md"), makeAgent(true));

    stampExternalDirs(dir, extDirs, "sandbox");

    const result = await readFile(path.join(dir, "agent.md"), "utf-8");
    expect(result).not.toContain("external_directory:");
    expect(result).not.toContain("old/path/**");
  });
});

// ---------------------------------------------------------------------------

describe("convertAskToAllow", () => {
  it("converts ask rules to allow", async () => {
    const dir = path.join(tmp, "ask-convert");
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "agent.md"),
      '---\npermission:\n  bash:\n    "gh pr create*": ask\n    "cat *": allow\n---\n# Agent\n',
    );

    convertAskToAllow(dir);

    const result = await readFile(path.join(dir, "agent.md"), "utf-8");
    expect(result).not.toContain(": ask");
    expect(result).toContain('"gh pr create*": allow');
    expect(result).toContain('"cat *": allow');
  });

  it("leaves files with no ask rules unchanged", async () => {
    const dir = path.join(tmp, "ask-noop");
    await mkdir(dir, { recursive: true });
    const content =
      '---\npermission:\n  bash:\n    "cat *": allow\n---\n# Agent\n';
    await writeFile(path.join(dir, "agent.md"), content);

    convertAskToAllow(dir);

    const result = await readFile(path.join(dir, "agent.md"), "utf-8");
    expect(result).toBe(content);
  });
});
