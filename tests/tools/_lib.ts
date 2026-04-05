import type { ToolContext, ToolDefinition } from "@opencode-ai/plugin";

type ToolArgs<T extends ToolDefinition> = T["execute"] extends (
  args: infer A,
  ctx: any,
) => any
  ? A
  : never;

export function execute_tool<T extends ToolDefinition>(
  tool: T,
  args: ToolArgs<T>,
): Promise<string> {
  return (
    tool.execute as (args: ToolArgs<T>, ctx: ToolContext) => Promise<string>
  )(args, {} as ToolContext);
}
