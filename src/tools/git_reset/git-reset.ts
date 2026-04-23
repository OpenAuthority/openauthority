/**
 * git_reset tool implementation.
 *
 * Resets the current HEAD to a specified commit with a chosen reset mode
 * (soft, mixed, or hard) by invoking `git reset --<mode> <ref>` via
 * `spawnSync`. Arguments are passed directly to the child process — no shell
 * interpolation occurs.
 *
 * Action class: vcs.write
 *
 * > **Warning:** Hard resets (`mode: 'hard'`) permanently discard uncommitted
 * > changes in the index and working tree. This operation is irreversible
 * > without a reflog recovery.
 */

import { spawnSync } from 'node:child_process';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Reset mode passed to `git reset`. */
export type GitResetMode = 'soft' | 'mixed' | 'hard';

/** Input parameters for the git_reset tool. */
export interface GitResetParams {
  /** Reset mode: soft (HEAD only), mixed (HEAD + index), or hard (HEAD + index + working tree). */
  mode: GitResetMode;
  /** Commit reference (branch name, tag, or commit hash) to reset to. */
  ref: string;
}

/** Successful result from the git_reset tool. */
export interface GitResetResult {
  /** The reset mode that was applied. */
  mode: GitResetMode;
  /** The commit reference that was reset to. */
  ref: string;
  /** Human-readable status message. */
  message: string;
  /**
   * Present only when `mode` is `'hard'`. Reminds the caller that uncommitted
   * changes to tracked files have been permanently discarded.
   */
  warning?: string;
}

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * Typed error thrown by `gitReset`.
 *
 * The `code` discriminant lets callers branch on error type without
 * string-matching the message.
 *
 * - `invalid-ref`  — the specified commit reference does not exist.
 * - `git-error`    — `git reset` exited with a non-zero status for another reason.
 */
export class GitResetError extends Error {
  constructor(
    message: string,
    public readonly code: 'invalid-ref' | 'git-error',
  ) {
    super(message);
    this.name = 'GitResetError';
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resets the current HEAD to the specified commit via `git reset --<mode> <ref>`.
 *
 * Uses `spawnSync` with an explicit argument array — no shell is involved,
 * so ref names containing special characters are safe.
 *
 * @param params          `{ mode, ref }` — reset mode and target commit reference.
 * @param options.cwd     Working directory for `git reset`. Defaults to
 *                        `process.cwd()` when omitted.
 * @returns               `{ mode, ref, message[, warning] }` on success.
 *                        The `warning` field is included for hard resets.
 *
 * @throws {GitResetError}  code `invalid-ref` when the ref does not exist.
 * @throws {GitResetError}  code `git-error` when git exits non-zero for another reason.
 */
export function gitReset(
  params: GitResetParams,
  options: { cwd?: string } = {},
): GitResetResult {
  const { mode, ref } = params;
  const effectiveCwd = options.cwd ?? process.cwd();

  const result = spawnSync('git', ['reset', `--${mode}`, ref], {
    cwd: effectiveCwd,
    encoding: 'utf-8',
  });

  if (result.status === 0) {
    const stdout = typeof result.stdout === 'string' ? result.stdout.trim() : '';
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    const message =
      stdout !== ''
        ? stdout
        : stderr !== ''
          ? stderr
          : `Reset to '${ref}' (${mode}).`;

    const output: GitResetResult = { mode, ref, message };

    if (mode === 'hard') {
      output.warning =
        'Hard reset permanently discards all uncommitted changes to tracked files. ' +
        'Use `git reflog` to recover commits if needed.';
    }

    return output;
  }

  const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';

  // Ref does not exist or cannot be resolved.
  if (
    stderr.includes('unknown revision') ||
    stderr.includes('ambiguous argument') ||
    stderr.includes('not a valid object name') ||
    stderr.includes('bad revision') ||
    (result.status === 128 && stderr.includes('fatal'))
  ) {
    throw new GitResetError(`Ref not found: '${ref}'`, 'invalid-ref');
  }

  // Generic git error.
  throw new GitResetError(
    stderr !== ''
      ? `git reset failed: ${stderr}`
      : 'git reset exited with a non-zero status.',
    'git-error',
  );
}
