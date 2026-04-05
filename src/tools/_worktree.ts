import { stat } from "node:fs/promises";
import path from "node:path";

/**
 * Returns "clone" | "worktree" | "bare" | "unknown"
 * - clone:    .git/ is a directory (traditional git clone)
 * - worktree: .git is a file (gitdir pointer — part of a bare repo + worktree setup)
 * - bare:     path itself is a bare repo (has HEAD file and refs/ directory)
 * - unknown:  not a recognisable git repository
 */
export async function wtDetect(
  p: string,
): Promise<"clone" | "worktree" | "bare" | "unknown"> {
  try {
    const gitStat = await stat(path.join(p, ".git")).catch(() => null);
    if (gitStat?.isDirectory()) return "clone";
    if (gitStat?.isFile()) return "worktree";

    const headStat = await stat(path.join(p, "HEAD")).catch(() => null);
    const refsStat = await stat(path.join(p, "refs")).catch(() => null);
    if (headStat?.isFile() && refsStat?.isDirectory()) return "bare";

    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Given a worktree path, returns the bare repo root (parent of .bare/).
 * Runs: git -C <wtPath> rev-parse --git-common-dir
 * Resolves to absolute path, then strips the /.bare suffix via dirname.
 * Throws if it cannot determine the root.
 */
export async function wtBareRoot(wtPath: string): Promise<string> {
  const result =
    await Bun.$`git -C ${wtPath} rev-parse --git-common-dir`.text();
  const commonDir = result.trim();
  if (!commonDir) {
    throw new Error(`wtBareRoot: cannot determine bare root for '${wtPath}'`);
  }
  // commonDir may be relative to wtPath — resolve to absolute, then take parent
  const absCommon = path.resolve(wtPath, commonDir);
  return path.dirname(absCommon);
}
