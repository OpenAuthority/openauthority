/**
 * git_log tool implementation.
 *
 * Returns formatted commit history for a git repository by invoking
 * `git log --format=...` via `spawnSync`. Arguments are passed directly
 * to the child process — no shell interpolation occurs.
 *
 * Action class: vcs.read
 */

import { spawnSync } from 'node:child_process';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Input parameters for the git_log tool. */
export interface GitLogParams {
  /** Maximum number of commits to return. Omit for repository default. */
  limit?: number;
  /** Restrict history to commits that touch this file path. */
  path?: string;
}

/** A single commit entry returned by the git_log tool. */
export interface CommitInfo {
  /** Full 40-character commit hash. */
  hash: string;
  /** Subject line of the commit message. */
  message: string;
  /** Commit author name. */
  author: string;
  /** ISO-8601 author date. */
  date: string;
}

/** Successful result from the git_log tool. */
export interface GitLogResult {
  /** Ordered list of commits (newest first). */
  commits: CommitInfo[];
}

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * Typed error thrown by `gitLog`.
 *
 * The `code` discriminant lets callers branch on error type without
 * string-matching the message.
 *
 * - `git-error` — `git log` exited with a non-zero status.
 */
export class GitLogError extends Error {
  constructor(
    message: string,
    public readonly code: 'git-error',
  ) {
    super(message);
    this.name = 'GitLogError';
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Unit separator used to delimit fields within a single commit line. */
const FIELD_SEP = '\x1f';

/** git pretty-format string — each commit is emitted as one line. */
const FORMAT = `%H${FIELD_SEP}%s${FIELD_SEP}%an${FIELD_SEP}%aI`;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns commit history from the git repository rooted at `options.cwd`.
 *
 * Each commit is represented as `{ hash, message, author, date }`. Results
 * are ordered newest-first, consistent with `git log` defaults.
 *
 * Uses `spawnSync` with an explicit argument array — no shell is involved,
 * so path strings containing spaces or special characters are safe.
 *
 * @param params          `{ limit?, path? }` — optional constraints.
 * @param options.cwd     Working directory for `git log`. Defaults to
 *                        `process.cwd()` when omitted.
 * @returns               `{ commits }` — array of commit objects.
 *
 * @throws {GitLogError}  code `git-error` when git exits non-zero.
 */
export function gitLog(
  params: GitLogParams = {},
  options: { cwd?: string } = {},
): GitLogResult {
  const { limit, path } = params;
  const effectiveCwd = options.cwd ?? process.cwd();

  const args: string[] = ['log', `--format=${FORMAT}`];

  if (limit !== undefined && limit > 0) {
    args.push(`-${limit}`);
  }

  if (path !== undefined && path !== '') {
    args.push('--', path);
  }

  const result = spawnSync('git', args, {
    cwd: effectiveCwd,
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    const stderr =
      typeof result.stderr === 'string' ? result.stderr.trim() : '';
    // A repo with no commits yet produces a fatal message but is not an error
    // from the caller's perspective — it simply has no history.
    if (stderr.includes('does not have any commits yet')) {
      return { commits: [] };
    }
    throw new GitLogError(
      stderr !== ''
        ? `git log failed: ${stderr}`
        : 'git log exited with a non-zero status.',
      'git-error',
    );
  }

  const output = typeof result.stdout === 'string' ? result.stdout : '';
  const commits: CommitInfo[] = output
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const parts = line.split(FIELD_SEP);
      return {
        hash: parts[0] ?? '',
        message: parts[1] ?? '',
        author: parts[2] ?? '',
        date: parts[3] ?? '',
      };
    });

  return { commits };
}
