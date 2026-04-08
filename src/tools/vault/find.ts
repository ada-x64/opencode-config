import { tool } from "@opencode-ai/plugin";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// Parse all key: value pairs from the YAML frontmatter block
function parseFrontmatter(content: string): Record<string, string> {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return {};

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") {
      endIndex = i;
      break;
    }
  }
  if (endIndex === -1) return {};

  const result: Record<string, string> = {};
  for (let i = 1; i < endIndex; i++) {
    const line = lines[i] ?? "";
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    if (!key) continue;
    let value = line.slice(colonIdx + 1).trimStart();
    // Strip surrounding single or double quotes
    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

interface FindResult {
  path: string;
  title: string;
  frontmatter: Record<string, string>;
}

export default tool({
  description:
    "Search the agent vault for schemas, reviews, notes, archive, " +
    "triage, design docs, or all sections. Returns a JSON " +
    "array of { path, title, frontmatter } objects.",
  args: {
    section: tool.schema
      .enum([
        "schemas",
        "reviews",
        "notes",
        "archive",
        "triage",
        "design",
        "all",
      ])
      .describe("Vault section to search"),
    repo: tool.schema
      .string()
      .optional()
      .describe(
        "Filter to a specific owner/repo (e.g. 'ada-x64/opencode-config')",
      ),
    pattern: tool.schema
      .string()
      .optional()
      .describe("Filename glob pattern override (e.g. '*.md')"),
    content_grep: tool.schema
      .string()
      .optional()
      .describe("Filter results to files containing this regex pattern"),
  },
  async execute(args) {
    const vault = process.env.AGENT_VAULT;
    if (!vault) return "Error: AGENT_VAULT is not set.";

    type FileFilter = (relToVault: string) => boolean;

    interface SectionConfig {
      roots: string[];
      filter: FileFilter;
    }

    async function buildConfig(): Promise<SectionConfig> {
      switch (args.section) {
        case "schemas":
          return {
            roots: [path.join(vault!, "tasks")],
            filter: (rel) => path.basename(rel) === "schema.md",
          };

        case "reviews":
          return {
            roots: [path.join(vault!, "tasks")],
            filter: (rel) => {
              const base = path.basename(rel);
              const parentDir = path.basename(path.dirname(rel));
              return (
                base.startsWith("review") &&
                base.endsWith(".md") &&
                parentDir === "reviews"
              );
            },
          };

        case "notes":
          return {
            roots: [path.join(vault!, "notes")],
            filter: () => true,
          };

        case "archive":
          return {
            roots: [path.join(vault!, "_misc/archive")],
            filter: () => true,
          };

        case "triage": {
          return {
            roots: [path.join(vault!, "_misc/activity")],
            filter: () => true,
          };
        }

        case "design":
          return {
            roots: [path.join(vault!, "designs")],
            filter: () => true,
          };

        case "all":
          return {
            roots: [vault!],
            filter: (rel) => !rel.includes("/.obsidian/"),
          };

        default:
          return { roots: [], filter: () => false };
      }
    }

    const config = await buildConfig();

    // Collect all .md files from every root
    const allFiles: string[] = [];
    for (const root of config.roots) {
      let entries: string[];
      try {
        const raw = await readdir(root, { recursive: true });
        entries = raw.map((e) => String(e));
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (!entry.endsWith(".md")) continue;
        const fullPath = path.join(root, entry);
        // Build a vault-relative path (with leading /) for filter checks
        const relToVault = fullPath.slice(vault.length);
        if (!config.filter(relToVault)) continue;
        allFiles.push(fullPath);
      }
    }

    // Apply optional pattern override (matches against basename)
    let filtered = allFiles;
    if (args.pattern) {
      const glob = new Bun.Glob(args.pattern);
      filtered = filtered.filter((f) => glob.match(path.basename(f)));
    }

    // Apply optional repo filter — read frontmatter and check repo field
    if (args.repo) {
      const matches = await Promise.all(
        filtered.map(async (f) => {
          try {
            const content = await readFile(f, "utf-8");
            const fm = parseFrontmatter(content);
            return fm["repo"] === args.repo ? f : null;
          } catch {
            return null;
          }
        }),
      );
      filtered = matches.filter((f): f is string => f !== null);
    }

    // Apply optional content_grep filter
    if (args.content_grep) {
      const re = new RegExp(args.content_grep);
      const matches = await Promise.all(
        filtered.map(async (f) => {
          try {
            const content = await readFile(f, "utf-8");
            return re.test(content) ? f : null;
          } catch {
            return null;
          }
        }),
      );
      filtered = matches.filter((f): f is string => f !== null);
    }

    // Parse each matching file into a FindResult
    const results: FindResult[] = await Promise.all(
      filtered.map(async (f) => {
        let content = "";
        try {
          content = await readFile(f, "utf-8");
        } catch {
          // leave content empty — frontmatter and title will be empty
        }

        const titleMatch = content.match(/^# (.+)/m);
        const title = titleMatch?.[1] ?? "";
        const frontmatter = parseFrontmatter(content);
        // Strip vault prefix and any leading separator for the returned path
        const relPath = f.slice(vault.length).replace(/^\//, "");

        return { path: relPath, title, frontmatter };
      }),
    );

    return JSON.stringify(results, null, 2);
  },
});
