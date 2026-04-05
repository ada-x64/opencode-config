import { tool } from "@opencode-ai/plugin";

export default tool({
  description:
    "Run and debug GitHub Actions workflows locally using gh act. " +
    "Starts a Docker artifact server and passes arguments through " +
    "to gh act. Use this to test CI locally before pushing.",
  args: {
    workflow: tool.schema
      .string()
      .optional()
      .describe("Workflow file path (e.g. '.github/workflows/lint.yml')"),
    job: tool.schema
      .string()
      .optional()
      .describe("Specific job ID to run (e.g. 'lint')"),
    event_file: tool.schema
      .string()
      .optional()
      .describe(
        "Path to a JSON event payload file to pass to gh act via -e " +
          "(e.g. 'event.json'). Must be a file path, not an event name.",
      ),
    extra_args: tool.schema
      .string()
      .optional()
      .describe("Additional arguments to pass to gh act (space-separated)"),
  },
  async execute(args) {
    // Start artifact server — nothrow because an already-running container is fine
    await Bun.$`docker run --name artifact-server -d -p 8080:8080 --add-host artifacts.docker.internal:host-gateway -e AUTH_KEY=foo ghcr.io/jefuller/artifact-server:latest`.nothrow();

    // Build gh act args
    const actArgs: string[] = [
      "--env",
      "ACTIONS_RUNTIME_URL=http://artifacts.docker.internal:8080/",
      "--env",
      "ACTIONS_RUNTIME_TOKEN=foo",
      "--env",
      "ACTIONS_CACHE_URL=http://artifacts.docker.internal:8080/",
      "--artifact-server-path",
      "../artifacts",
    ];

    if (args.workflow) {
      actArgs.push("-W", args.workflow);
    }
    if (args.job) {
      actArgs.push("-j", args.job);
    }
    if (args.event_file) {
      actArgs.push("-e", args.event_file);
    }
    if (args.extra_args) {
      actArgs.push(...args.extra_args.split(" ").filter(Boolean));
    }

    const result = await Bun.$`gh act ${actArgs}`.text();
    return result.trim();
  },
});
