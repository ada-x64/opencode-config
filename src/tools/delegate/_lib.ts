/** Shared helpers for delegate tools (session + fleet). */

import { existsSync } from "node:fs";

// --- Sandbox guard ---

/**
 * Throw if running inside a sandbox (Docker container).
 * Delegate tools require host access to aoe/tmux.
 */
export function assertNotSandbox(): void {
  if (existsSync("/.dockerenv")) {
    throw new Error(
      "delegate tools require host access — cannot run inside a sandbox container",
    );
  }
}

// --- Timing constants (ms) ---

export const OPENCODE_INIT_DELAY_MS = 5000;
export const COPILOT_INIT_DELAY_MS = 8000;
export const COPILOT_POST_PROMPT_DELAY_MS = 2000;
export const COPILOT_POLL_INTERVAL_MS = 5000;
export const COPILOT_POLL_MAX_ATTEMPTS = 18;
export const COPILOT_POST_DELEGATE_DELAY_MS = 5000;
export const FLEET_INIT_DELAY_MS = 15000;
export const FLEET_STAGGER_DELAY_MS = 1000;
export const FLEET_POST_DELEGATE_DELAY_MS = 8000;
export const FLEET_CLEANUP_DELAY_MS = 30000;

// --- Regex patterns ---

export const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
export const CONFIRM_RE = /ready|understood|confirm|will wait/i;

// --- Copilot protocol primitives ---

/**
 * Send the copilot "read this task" prompt prefix via aoe send.
 * Maps to _copilot_send_prompt (delegate.sh:7-12).
 */
export async function copilotSendPrompt(
  sid: string,
  prompt: string,
): Promise<void> {
  const message = `Read this task. Do NOT execute. Confirm understanding, then I will send /delegate.\n\n${prompt}`;
  await Bun.$`aoe send ${sid} ${message}`;
}

/**
 * Find the tmux session name associated with a given aoe session ID.
 * Returns the session name or null if not found.
 * Maps to _copilot_find_tmux (delegate.sh:15-18).
 */
export async function copilotFindTmux(sid: string): Promise<string | null> {
  const result = await Bun.$`tmux list-sessions -F #{session_name}`.nothrow();
  if (result.exitCode !== 0) return null;
  const shortId = sid.slice(0, 8);
  const sessionRe = new RegExp(`^aoe_.*${shortId}`);
  const lines = result.stdout.toString().split("\n");
  const match = lines.find((line) => sessionRe.test(line.trim()));
  return match?.trim() ?? null;
}

/**
 * Check whether the copilot session has confirmed understanding.
 * Maps to _copilot_check_confirmed (delegate.sh:21-25).
 */
export async function copilotCheckConfirmed(sid: string): Promise<boolean> {
  const result =
    await Bun.$`aoe session capture ${sid} --strip-ansi -n 50`.nothrow();
  if (result.exitCode !== 0) return false;
  return CONFIRM_RE.test(result.stdout.toString());
}

// --- Worktree helpers ---

/**
 * Create an isolated git worktree under /tmp/delegate-<uuid>.
 * If branch is provided, tries to check it out; falls back to --detach.
 * Returns the worktree path. Throws on failure.
 * Maps to inline logic in delegate_session (delegate.sh:50-61).
 */
export async function createIsolatedWorktree(
  repo: string,
  branch?: string,
): Promise<string> {
  const uuid = crypto.randomUUID();
  const worktreePath = `/tmp/delegate-${uuid}`;

  // Try with branch first, fall back to plain --detach
  const attempts = branch
    ? [
        Bun.$`git -C ${repo} worktree add ${worktreePath} ${branch} --detach`,
        Bun.$`git -C ${repo} worktree add ${worktreePath} --detach`,
      ]
    : [Bun.$`git -C ${repo} worktree add ${worktreePath} --detach`];

  let lastStderr = "";
  for (const cmd of attempts) {
    const result = await cmd.nothrow();
    if (result.exitCode === 0) return worktreePath;
    lastStderr = result.stderr.toString().trim();
  }

  throw new Error(
    `createIsolatedWorktree: failed to create worktree at '${worktreePath}' for repo '${repo}': ${lastStderr}`,
  );
}

/**
 * Remove a git worktree. Best-effort — never throws.
 * Maps to inline cleanup (delegate.sh:73-75, 90-92).
 */
export async function removeWorktree(
  repo: string,
  worktreePath: string,
): Promise<void> {
  await Bun.$`git -C ${repo} worktree remove ${worktreePath} --force`.nothrow();
}

// --- Session creation ---

/**
 * Create an aoe session and return its session ID.
 * Uses Bun.spawn for dynamic arg construction.
 * Maps to delegate_session aoe add logic (delegate.sh:37-77).
 */
export async function createAoeSession(opts: {
  repo: string;
  title: string;
  tool: string;
  branch?: string;
  newBranch?: boolean;
  group?: string;
  sandbox?: boolean;
}): Promise<string> {
  const { repo, title, tool, branch, newBranch, group, sandbox } = opts;

  const args: string[] = ["aoe", "add", repo, "-t", title, "-c", tool];

  if (group) {
    args.push("-g", group);
  }

  if (branch && tool !== "copilot") {
    args.push("-w", branch);
    if (newBranch) {
      args.push("-b");
    }
  }

  if (sandbox) {
    args.push("-s");
  }

  args.push("-y");

  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;

  const combined = stdout + stderr;
  const match = UUID_RE.exec(combined);

  if (!match) {
    throw new Error(
      `createAoeSession: failed to parse session ID from aoe add output:\n${combined}`,
    );
  }

  return match[0];
}

// --- Internal dispatch functions ---

/**
 * Dispatch an opencode session: wait for init, then send prompt.
 * Maps to _delegate_opencode (delegate.sh:97-103).
 */
async function _delegateOpencode(sid: string, prompt: string): Promise<void> {
  await Bun.sleep(OPENCODE_INIT_DELAY_MS);
  await Bun.$`aoe send ${sid} ${prompt}`;
}

/**
 * Dispatch a copilot session: full confirmation protocol.
 * Maps to _delegate_copilot (delegate.sh:105-140).
 */
async function _delegateCopilot(sid: string, prompt: string): Promise<void> {
  await Bun.sleep(COPILOT_INIT_DELAY_MS);

  await copilotSendPrompt(sid, prompt);
  await Bun.sleep(COPILOT_POST_PROMPT_DELAY_MS);

  const tmuxSession = await copilotFindTmux(sid);
  if (!tmuxSession) {
    console.warn(`WARNING: Could not find tmux session for ${sid}`);
    return;
  }

  await Bun.$`tmux send-keys -t ${tmuxSession} Enter`;

  // Poll for confirmation (up to COPILOT_POLL_MAX_ATTEMPTS * COPILOT_POLL_INTERVAL_MS)
  let confirmed = false;
  for (let i = 0; i < COPILOT_POLL_MAX_ATTEMPTS; i++) {
    await Bun.sleep(COPILOT_POLL_INTERVAL_MS);
    if (await copilotCheckConfirmed(sid)) {
      confirmed = true;
      break;
    }
  }

  if (!confirmed) {
    const timeoutSec = Math.round(
      (COPILOT_POLL_MAX_ATTEMPTS * COPILOT_POLL_INTERVAL_MS) / 1000,
    );
    console.warn(`WARNING: Copilot did not confirm within ${timeoutSec}s`);
  }

  await Bun.$`aoe send ${sid} /delegate`;
  await Bun.sleep(COPILOT_POST_DELEGATE_DELAY_MS);
  await Bun.$`tmux send-keys -t ${tmuxSession} Enter`;
}

// --- Composed delegate session ---

/**
 * Create and dispatch a single AoE session.
 * Maps to delegate_session (delegate.sh:28-95).
 */
export async function delegateSession(args: {
  repo: string;
  prompt: string;
  title: string;
  tool?: string;
  branch?: string;
  newBranch?: boolean;
  group?: string;
}): Promise<string> {
  const tool = args.tool ?? "opencode";
  const isCopilot = tool === "copilot";

  let repo = args.repo;
  let worktreePath: string | null = null;

  // Copilot sessions get an isolated worktree to avoid index.lock conflicts
  if (isCopilot) {
    worktreePath = await createIsolatedWorktree(args.repo, args.branch);
    repo = worktreePath;
  }

  let sessionId: string;
  try {
    sessionId = await createAoeSession({
      repo,
      title: args.title,
      tool,
      branch: args.branch,
      newBranch: args.newBranch,
      group: args.group,
      sandbox: !isCopilot, // opencode gets sandbox; copilot does not
    });
  } catch (err) {
    // Clean up orphaned worktree before re-throwing
    if (worktreePath) {
      await removeWorktree(args.repo, worktreePath);
    }
    throw err;
  }

  await Bun.$`aoe session start ${sessionId}`;

  try {
    if (isCopilot) {
      await _delegateCopilot(sessionId, args.prompt);
    } else {
      await _delegateOpencode(sessionId, args.prompt);
    }
  } finally {
    // Always clean up copilot worktree after dispatch (best-effort)
    if (worktreePath) {
      await removeWorktree(args.repo, worktreePath);
    }
  }

  return sessionId;
}

// --- Internal fleet functions ---

/** A successfully created fleet entry linking session, worktree, and input index. */
interface FleetEntry {
  sid: string;
  worktreePath: string;
  originalIndex: number;
}

/**
 * Create isolated worktrees and aoe sessions for a fleet.
 * Per-session failures are logged and skipped.
 * Maps to _fleet_create_sessions (delegate.sh:144-193).
 */
async function _fleetCreateSessions(
  repo: string,
  group: string | undefined,
  sessions: { title: string; prompt: string; branch?: string }[],
): Promise<FleetEntry[]> {
  const entries: FleetEntry[] = [];

  for (const [i, session] of sessions.entries()) {
    let worktreePath: string;

    try {
      worktreePath = await createIsolatedWorktree(repo, session.branch);
    } catch (err) {
      console.error(
        `ERROR: Failed to create worktree for ${session.title}: ${err}`,
      );
      continue;
    }

    let sid: string;
    try {
      sid = await createAoeSession({
        repo: worktreePath,
        title: session.title,
        tool: "copilot",
        group,
        sandbox: false,
      });
    } catch (err) {
      console.error(
        `ERROR: Failed to create session for ${session.title}: ${err}`,
      );
      await removeWorktree(repo, worktreePath);
      continue;
    }

    entries.push({ sid, worktreePath, originalIndex: i });
  }

  return entries;
}

/**
 * Run the copilot fleet confirmation protocol for all sessions.
 * Maps to _fleet_run_protocol (delegate.sh:196-281).
 */
async function _fleetRunProtocol(
  sessions: { prompt: string }[],
  entries: FleetEntry[],
): Promise<void> {
  // Start all sessions
  for (const { sid } of entries) {
    await Bun.$`aoe session start ${sid}`;
  }

  // Shared init wait
  await Bun.sleep(FLEET_INIT_DELAY_MS);

  // Send prompts with stagger
  for (const { sid, originalIndex } of entries) {
    await copilotSendPrompt(sid, sessions[originalIndex]!.prompt);
    await Bun.sleep(FLEET_STAGGER_DELAY_MS);
  }

  // Find tmux sessions and press Enter
  const tmuxBySid = new Map<string, string>();
  for (const { sid } of entries) {
    const tmuxSession = await copilotFindTmux(sid);
    if (tmuxSession) {
      await Bun.$`tmux send-keys -t ${tmuxSession} Enter`;
      tmuxBySid.set(sid, tmuxSession);
    } else {
      console.warn(`WARNING: Could not find tmux session for ${sid}`);
    }
  }

  // Shared confirmation poll
  const confirmed = new Set<string>();
  for (let attempt = 0; attempt < COPILOT_POLL_MAX_ATTEMPTS; attempt++) {
    await Bun.sleep(COPILOT_POLL_INTERVAL_MS);
    for (const { sid } of entries) {
      if (confirmed.has(sid)) continue;
      if (await copilotCheckConfirmed(sid)) {
        confirmed.add(sid);
      }
    }
    if (confirmed.size === entries.length) break;
  }

  // Send /delegate to all sessions
  for (const { sid } of entries) {
    await Bun.$`aoe send ${sid} /delegate`;
  }

  // Shared post-delegate wait
  await Bun.sleep(FLEET_POST_DELEGATE_DELAY_MS);

  // Press Enter in all tmux sessions to confirm dialog
  for (const { sid } of entries) {
    const tmuxSession = tmuxBySid.get(sid);
    if (tmuxSession) {
      await Bun.$`tmux send-keys -t ${tmuxSession} Enter`;
    }
  }
}

/**
 * Clean up fleet worktrees after a delay.
 * Maps to _fleet_cleanup (delegate.sh:284-292).
 */
async function _fleetCleanup(
  repo: string,
  entries: FleetEntry[],
): Promise<void> {
  // Allow time for copilot post-handoff git operations
  await Bun.sleep(FLEET_CLEANUP_DELAY_MS);
  for (const { worktreePath } of entries) {
    await removeWorktree(repo, worktreePath);
  }
}

// --- Composed delegate fleet ---

/**
 * Create and dispatch a fleet of copilot AoE sessions.
 * Maps to delegate_fleet (delegate.sh:295-338).
 */
export async function delegateFleet(args: {
  repo: string;
  sessions: { title: string; prompt: string; branch?: string }[];
  group?: string;
}): Promise<string[]> {
  const entries = await _fleetCreateSessions(
    args.repo,
    args.group,
    args.sessions,
  );

  if (entries.length === 0) {
    throw new Error("delegateFleet: no sessions were created successfully");
  }

  await _fleetRunProtocol(args.sessions, entries);
  await _fleetCleanup(args.repo, entries);

  return entries.map((e) => e.sid);
}
