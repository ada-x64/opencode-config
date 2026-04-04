import { tool } from "@opencode-ai/plugin";
import os from "os";
import path from "path";

export const configDir =
  process.env.OPENCODE_CONFIG_SRC ||
  path.join(os.homedir(), ".config/opencode");

type ToolArgs = Parameters<typeof tool>[0]["args"];

interface LibToolOpts<A extends ToolArgs> {
  description: string;
  args: A;
  lib: string;
  fn: string;
  /**
   * Map args to positional params for the bash function.
   * Defaults to Object.values(args) — relies on JS insertion-order, which
   * matches declaration order in all current tools. If the shell function's
   * parameter order doesn't match the args declaration order, provide an
   * explicit `params` function to avoid silent argument mismatches.
   */
  params?: (args: any) => string[];
  /** Use .nothrow() on the shell command */
  nothrow?: boolean;
  /** Catch errors and return this fallback string instead */
  catchMessage?: string;
  /** Post-process the result before returning */
  postProcess?: (result: string, args: any) => string;
}

interface ScriptToolOpts<A extends ToolArgs> {
  description: string;
  args: A;
  script: string;
  /** Build the argument list from the parsed args */
  buildArgs: (args: any) => string[];
}

export function libTool<A extends ToolArgs>(opts: LibToolOpts<A>) {
  return tool({
    description: opts.description,
    args: opts.args,
    async execute(args) {
      const libPath = path.join(configDir, opts.lib);
      const params = opts.params
        ? opts.params(args)
        : Object.values(args as Record<string, unknown>).map((v) =>
            String(v ?? ""),
          );
      // Build: bash -c 'source "$1" && fn "$2" "$3" ...' _ "$libPath" ...params
      // Under `bash -c SCRIPT _ libPath p1 p2`: $0=_, $1=libPath, $2=p1, $3=p2, ...
      const quotedParams = params.map((_, i) => `"$${i + 2}"`).join(" ");
      const script = `source "$1" && ${opts.fn} ${quotedParams}`;
      const shellArgs = [libPath, ...params];

      let cmd = Bun.$`bash -c ${script} _ ${shellArgs}`;
      if (opts.nothrow) cmd = cmd.nothrow();

      let result: string;
      if (opts.catchMessage) {
        result = await cmd.text().catch(() => opts.catchMessage!);
      } else {
        result = await cmd.text();
      }

      result = result.trim();
      if (opts.postProcess) return opts.postProcess(result, args);
      return result;
    },
  });
}

export function scriptTool<A extends ToolArgs>(opts: ScriptToolOpts<A>) {
  return tool({
    description: opts.description,
    args: opts.args,
    async execute(args) {
      const scriptPath = path.join(configDir, opts.script);
      const cmdArgs = opts.buildArgs(args);
      const result = await Bun.$`bash ${scriptPath} ${cmdArgs}`.text();
      return result.trim();
    },
  });
}
