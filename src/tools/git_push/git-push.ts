/**
 * git_push tool implementation.
 *
 * Pushes the current branch (or a specified branch) to a remote repository
 * by invoking `git push [remote] [branch]` via `spawnSync`. Arguments are
 * passed directly to the child process — no shell interpolation occurs.
 *
 * Action class: vcs.remote
 */

import { spawnSync } from 'node:child_process';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Input parameters for the git_push tool. */
export interface GitPushParams {
  /** Name of the remote to push to. Defaults to the tracking remote when omitted. */
  remote?: string;
  /** Branch to push. Defaults to the current branch when omitted. */
  branch?: string;
}

/** Successful result from the git_push tool. */
export interface GitPushResult {
  /** Whether the push completed successfully. */
  pushed: boolean;
  /** Remote that was pushed to. */
  remote: string;
  /** Branch that was pushed. */
  branch: string;
  /** Human-readable status message from git push. */
  message: string;
}

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * Typed error thrown by `gitPush`.
 *
 * The `code` discriminant lets callers branch on error type without
 * string-matching the message.
 *
 * - `auth-error`       — authentication or permission failure.
 * - `rejected`         — the push was rejected (e.g. non-fast-forward update).
 * - `remote-not-found` — the specified remote does not exist or is unreachable.
 * - `git-error`        — `git push` exited with a non-zero status for another reason.
 */
export class GitPushError extends Error {
  constructor(
    message: string,
    public readonly code: 'auth-error' | 'rejected' | 'remote-not-found' | 'git-error',
  ) {
    super(message);
    this.name = 'GitPushError';
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Returns the name of the currently checked-out branch, or an empty string
 * if it cannot be determined (e.g. detached HEAD or not in a git repo).
 */
function currentBranch(cwd: string): string {
  const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd,
    encoding: 'utf-8',
  });
  if (result.status === 0 && typeof result.stdout === 'string') {
    return result.stdout.trim();
  }
  return '';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Pushes commits to a remote repository via `git push [remote] [branch]`.
 *
 * Uses `spawnSync` with an explicit argument array — no shell is involved,
 * so remote names and branch names containing special characters are safe.
 *
 * Both `remote` and `branch` are appended to the args array only when they
 * are defined and non-empty strings, keeping the invocation to `git push`
 * with no extra args when both are omitted.
 *
 * @param params          `{ remote?, branch? }` — optional remote name and branch.
 * @param options.cwd     Working directory for `git push`. Defaults to
 *                        `process.cwd()` when omitted.
 * @returns               `{ pushed: true, remote, branch, message }` on success.
 *
 * @throws {GitPushError}  code `auth-error`       when authentication fails.
 * @throws {GitPushError}  code `rejected`         when the push is rejected (non-fast-forward).
 * @throws {GitPushError}  code `remote-not-found` when the remote does not exist.
 * @throws {GitPushError}  code `git-error`        when git exits non-zero for another reason.
 */
export function gitPush(
  params: GitPushParams = {},
  options: { cwd?: string } = {},
): GitPushResult {
  const { remote, branch } = params;
  const effectiveCwd = options.cwd ?? process.cwd();

  // Determine the remote and branch that will appear in the result.
  const effectiveRemote = typeof remote === 'string' && remote !== '' ? remote : 'origin';
  const effectiveBranch =
    typeof branch === 'string' && branch !== '' ? branch : currentBranch(effectiveCwd);

  // Build git push args — only append remote/branch when provided.
  const args: string[] = ['push'];
  if (typeof remote === 'string' && remote !== '') {
    args.push(remote);
  }
  if (typeof branch === 'string' && branch !== '') {
    args.push(branch);
  }

  const result = spawnSync('git', args, {
    cwd: effectiveCwd,
    encoding: 'utf-8',
  });

  if (result.status === 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    const stdout = typeof result.stdout === 'string' ? result.stdout.trim() : '';
    const message = stderr !== '' ? stderr : stdout !== '' ? stdout : 'Push successful.';
    return { pushed: true, remote: effectiveRemote, branch: effectiveBranch, message };
  }

  const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';

  // Remote not found: git reports "does not appear to be a git repository" (exit 128)
  // when the remote name is not configured or the URL is unreachable.
  if (
    stderr.includes('does not appear to be a git repository') ||
    stderr.includes('repository not found') ||
    (result.status === 128 &&
      stderr.toLowerCase().includes('remote') &&
      (stderr.toLowerCase().includes('not found') ||
        stderr.toLowerCase().includes('could not read')))
  ) {
    throw new GitPushError(
      remote !== undefined && remote !== ''
        ? `Remote not found: ${remote}. ${stderr}`.trim()
        : `Remote not found. ${stderr}`.trim(),
      'remote-not-found',
    );
  }

  // Authentication error: credentials missing or rejected.
  if (
    stderr.includes('Authentication failed') ||
    stderr.includes('Permission denied') ||
    stderr.includes('could not read Username') ||
    stderr.includes('could not read Password') ||
    stderr.toLowerCase().includes('authorization failed') ||
    stderr.toLowerCase().includes('invalid username or password')
  ) {
    throw new GitPushError(`Authentication failed: ${stderr}`, 'auth-error');
  }

  // Push rejected: remote has commits that are not in the local history.
  if (
    stderr.includes('Updates were rejected') ||
    stderr.includes('[rejected]') ||
    stderr.includes('! [rejected]') ||
    stderr.includes('! [remote rejected]')
  ) {
    throw new GitPushError(`Push rejected: ${stderr}`, 'rejected');
  }

  // Generic git error.
  throw new GitPushError(
    stderr !== '' ? `git push failed: ${stderr}` : 'git push exited with a non-zero status.',
    'git-error',
  );
}
