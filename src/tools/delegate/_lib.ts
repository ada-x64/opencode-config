import path from "path";

export const configDir =
  process.env.OPENCODE_CONFIG_SRC ||
  path.join(process.env.HOME || "~", ".config/opencode");

export const scriptPath = path.join(configDir, "skills/delegate/delegate.sh");
