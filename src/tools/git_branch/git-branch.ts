/**
 * git_branch tool implementation.
 *
 * Creates a new branch in a git repository by invoking
 * `git branch <name> [<from>]` via `spawnSync`. Arguments are passed
 * directly to the child process — no shell interpolation occurs.
 *
 * Action class: vcs.write
 */

import { spawnSync } from 'node:child_process';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Input parameters for the git_branch tool. */
export interface GitBranchParams {
  /** Name of the new branch to create. */
  name: string;
  /** Optional starting point (branch name, tag, or commit hash). Defaults to HEAD. */
  from?: string;
}

/** Successful result from the git_branch tool. */
export interface GitBranchResult {
  /** The name of the branch that was created. */
  name: string;
  /** Human-readable status message. */
  message: string;
}

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * Typed error thrown by `gitBranch`.
 *
 * The `code` discriminant lets callers branch on error type without
 * string-matching the message.
 *
 * - `branch-already-exists` — a branch with the given name already exists.
 * - `from-not-found`        — the specified starting point does not exist.
 * - `git-error`             — `git branch` exited with a non-zero status for another reason.
 */
export class GitBranchError extends Error {
  constructor(
    message: string,
    public readonly code: 'branch-already-exists' | 'from-not-found' | 'git-error',
  ) {
    super(message);
    this.name = 'GitBranchError';
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Creates a new branch via `git branch <name> [<from>]`.
 *
 * Uses `spawnSync` with an explicit argument array — no shell is involved,
 * so branch names containing special characters are safe.
 *
 * @param params          `{ name, from? }` — new branch name and optional starting point.
 * @param options.cwd     Working directory for `git branch`. Defaults to
 *                        `process.cwd()` when omitted.
 * @returns               `{ name, message }` on successful branch creation.
 *
 * @throws {GitBranchError}  code `branch-already-exists` when a branch with that name already exists.
 * @throws {GitBranchError}  code `from-not-found` when the starting point does not exist.
 * @throws {GitBranchError}  code `git-error` when git exits non-zero for another reason.
 */
export function gitBranch(
  params: GitBranchParams,
  options: { cwd?: string } = {},
): GitBranchResult {
  const { name, from } = params;
  const effectiveCwd = options.cwd ?? process.cwd();

  const args = from !== undefined ? ['branch', name, from] : ['branch', name];

  const result = spawnSync('git', args, {
    cwd: effectiveCwd,
    encoding: 'utf-8',
  });

  if (result.status === 0) {
    return {
      name,
      message: `Branch '${name}' created${from !== undefined ? ` from '${from}'` : ''}.`,
    };
  }

  const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';

  // Branch already exists.
  if (stderr.includes('already exists')) {
    throw new GitBranchError(
      `Branch '${name}' already exists.`,
      'branch-already-exists',
    );
  }

  // Starting point not found.
  if (
    stderr.includes('Not a valid object name') ||
    stderr.includes('not found') ||
    stderr.includes('unknown revision') ||
    (result.status === 128 && from !== undefined && stderr.includes('fatal'))
  ) {
    throw new GitBranchError(
      `Starting point not found: '${from}'.`,
      'from-not-found',
    );
  }

  // Generic git error.
  throw new GitBranchError(
    stderr !== ''
      ? `git branch failed: ${stderr}`
      : 'git branch exited with a non-zero status.',
    'git-error',
  );
}
