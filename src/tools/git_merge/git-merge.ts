/**
 * git_merge tool implementation.
 *
 * Merges a specified branch into the current branch in a git repository
 * by invoking `git merge <branch>` via `spawnSync`. Arguments are passed
 * directly to the child process — no shell interpolation occurs.
 *
 * Action class: vcs.write
 */

import { spawnSync } from 'node:child_process';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Input parameters for the git_merge tool. */
export interface GitMergeParams {
  /** Name of the branch to merge into the current branch. */
  branch: string;
}

/** Successful result from the git_merge tool. */
export interface GitMergeResult {
  /** Whether the merge completed without conflicts. */
  merged: boolean;
  /** Human-readable status message from git merge. */
  message: string;
}

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * Typed error thrown by `gitMerge`.
 *
 * The `code` discriminant lets callers branch on error type without
 * string-matching the message.
 *
 * - `branch-not-found` — the specified branch does not exist.
 * - `merge-conflict`   — the merge produced conflicts that must be resolved.
 * - `git-error`        — `git merge` exited with a non-zero status for another reason.
 *
 * When `code` is `merge-conflict`, the `conflicts` array lists the file paths
 * that have conflicts.
 */
export class GitMergeError extends Error {
  constructor(
    message: string,
    public readonly code: 'branch-not-found' | 'merge-conflict' | 'git-error',
    public readonly conflicts?: string[],
  ) {
    super(message);
    this.name = 'GitMergeError';
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Parses conflicted file paths from `git merge` stdout/stderr output.
 * Looks for lines of the form:
 *   CONFLICT (content): Merge conflict in <file>
 */
function parseConflicts(output: string): string[] {
  return output
    .split('\n')
    .filter((line) => line.includes('CONFLICT') && line.includes('Merge conflict in'))
    .map((line) => {
      const match = line.match(/Merge conflict in (.+)$/);
      return match && match[1] !== undefined ? match[1].trim() : line.trim();
    });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Merges the specified branch into the current branch via `git merge <branch>`.
 *
 * Uses `spawnSync` with an explicit argument array — no shell is involved,
 * so branch names containing special characters are safe.
 *
 * @param params          `{ branch }` — name of the branch to merge.
 * @param options.cwd     Working directory for `git merge`. Defaults to
 *                        `process.cwd()` when omitted.
 * @returns               `{ merged: true, message }` on a successful merge.
 *
 * @throws {GitMergeError}  code `branch-not-found` when the branch does not exist.
 * @throws {GitMergeError}  code `merge-conflict` when conflicts are detected;
 *                          the `conflicts` property lists affected file paths.
 * @throws {GitMergeError}  code `git-error` when git exits non-zero for another reason.
 */
export function gitMerge(
  params: GitMergeParams,
  options: { cwd?: string } = {},
): GitMergeResult {
  const { branch } = params;
  const effectiveCwd = options.cwd ?? process.cwd();

  const result = spawnSync('git', ['merge', branch], {
    cwd: effectiveCwd,
    encoding: 'utf-8',
  });

  if (result.status === 0) {
    const message =
      typeof result.stdout === 'string' && result.stdout.trim() !== ''
        ? result.stdout.trim()
        : 'Merge successful.';
    return { merged: true, message };
  }

  const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
  const stdout = typeof result.stdout === 'string' ? result.stdout.trim() : '';

  // Branch not found: git reports "not something we can merge" in stderr (exit 1),
  // or exits with status 128 for other invalid-ref scenarios.
  if (
    stderr.includes('not something we can merge') ||
    stderr.includes('not found') ||
    stderr.includes('invalid reference') ||
    stderr.includes("doesn't exist") ||
    (result.status === 128 && stderr.includes('unknown revision'))
  ) {
    throw new GitMergeError(`Branch not found: ${branch}`, 'branch-not-found');
  }

  // Merge conflict: git exits with status 1 and emits CONFLICT lines in stdout.
  if (result.status === 1) {
    const combined = `${stdout}\n${stderr}`;
    const conflicts = parseConflicts(combined);
    throw new GitMergeError(
      'Merge conflict detected; manual resolution required.',
      'merge-conflict',
      conflicts,
    );
  }

  // Generic git error.
  throw new GitMergeError(
    stderr !== ''
      ? `git merge failed: ${stderr}`
      : 'git merge exited with a non-zero status.',
    'git-error',
  );
}
