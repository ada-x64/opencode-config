import { tool } from "@opencode-ai/plugin";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export default tool({
  description:
    "Refresh the GitHub metadata cache (projects, milestones, labels) " +
    "for repositories with vault content. Use this tool when the cache " +
    "is stale, after creating new milestones or labels, or before planning " +
    "sessions that need up-to-date project board or milestone information.",
  args: {
    filter: tool.schema
      .string()
      .optional()
      .describe(
        "Filter to a specific owner/repo (e.g. 'ada-x64/opencode-config'). " +
          "Default: all repos with vault content.",
      ),
  },
  async execute(args) {
    const vault = process.env.AGENT_VAULT;
    if (!vault) throw new Error("AGENT_VAULT is not set");

    // Discover owner/repo pairs across vault sections
    const repos = new Set<string>();
    for (const section of ["tasks", "repo-notes"]) {
      const sectionDir = join(vault, section);
      let ownerEntries;
      try {
        ownerEntries = await readdir(sectionDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const ownerEntry of ownerEntries) {
        if (!ownerEntry.isDirectory()) continue;
        const owner = ownerEntry.name;
        if (owner === "_fleet" || owner === "_activity") continue;
        const ownerDir = join(sectionDir, owner);
        let repoEntries;
        try {
          repoEntries = await readdir(ownerDir, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const repoEntry of repoEntries) {
          if (!repoEntry.isDirectory()) continue;
          repos.add(`${owner}/${repoEntry.name}`);
        }
      }
    }

    // Apply filter
    let targets: Set<string>;
    if (args.filter) {
      if (!repos.has(args.filter)) {
        throw new Error(`No vault content found for ${args.filter}`);
      }
      targets = new Set([args.filter]);
    } else {
      targets = repos;
    }

    // Ensure cache directory exists
    const cacheDir = join(vault, "_misc", "cache");
    await mkdir(cacheDir, { recursive: true });

    const lines: string[] = [`Refreshing cache for ${targets.size} repo(s)...`];
    const ownersSeen = new Set<string>();

    for (const key of targets) {
      const slashIdx = key.indexOf("/");
      const owner = key.slice(0, slashIdx);
      const repo = key.slice(slashIdx + 1);
      const cacheFile = join(cacheDir, `${owner}.json`);

      lines.push(`  ${owner}/${repo}...`);

      // Read or initialize cache
      let cache: Record<string, unknown>;
      try {
        const raw = await readFile(cacheFile, "utf-8");
        cache = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        cache = {};
      }

      // Fetch projects once per owner
      if (!ownersSeen.has(owner)) {
        ownersSeen.add(owner);
        lines.push(`    fetching projects for ${owner}...`);
        const projectsRaw =
          await Bun.$`gh project list --owner ${owner} --format json --limit 100`
            .nothrow()
            .text();
        try {
          const projectsJson = JSON.parse(
            projectsRaw.trim() || '{"projects":[]}',
          ) as { projects?: unknown[] };
          cache.projects = projectsJson.projects ?? [];
        } catch {
          cache.projects = [];
        }
      }

      // Fetch milestones
      lines.push(`    fetching milestones for ${owner}/${repo}...`);
      const milestonesUrl = `repos/${owner}/${repo}/milestones?state=all&per_page=100`;
      const milestonesRaw = await Bun.$`gh api ${milestonesUrl}`
        .nothrow()
        .text();
      let milestones: unknown[] = [];
      try {
        milestones = JSON.parse(milestonesRaw.trim() || "[]") as unknown[];
      } catch {
        milestones = [];
      }

      // Fetch labels
      lines.push(`    fetching labels for ${owner}/${repo}...`);
      const labelsUrl = `repos/${owner}/${repo}/labels?per_page=100`;
      const labelsRaw = await Bun.$`gh api ${labelsUrl}`.nothrow().text();
      let labels: unknown[] = [];
      try {
        labels = JSON.parse(labelsRaw.trim() || "[]") as unknown[];
      } catch {
        labels = [];
      }

      // Merge repos subtree into cache
      if (!cache.repos || typeof cache.repos !== "object") {
        cache.repos = {} as Record<string, unknown>;
      }
      (cache.repos as Record<string, unknown>)[repo] = { milestones, labels };

      // Write updated cache back
      await writeFile(cacheFile, JSON.stringify(cache, null, 2), "utf-8");
    }

    lines.push(`Done. Cache files at ${cacheDir}`);
    return lines.join("\n");
  },
});
