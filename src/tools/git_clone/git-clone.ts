/**
 * git_clone tool implementation.
 *
 * Clones a remote git repository to a specified local path by invoking
 * `git clone <url> <path>` via `spawnSync`. Arguments are passed directly
 * to the child process — no shell interpolation occurs.
 *
 * Action class: vcs.remote
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Input parameters for the git_clone tool. */
export interface GitCloneParams {
  /** URL of the remote repository to clone. */
  url: string;
  /** Local filesystem path where the repository will be cloned. */
  path: string;
}

/** Successful result from the git_clone tool. */
export interface GitCloneResult {
  /** The remote URL that was cloned. */
  url: string;
  /** The local path where the repository was cloned. */
  path: string;
  /** Human-readable status message. */
  message: string;
}

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * Typed error thrown by `gitClone`.
 *
 * The `code` discriminant lets callers branch on error type without
 * string-matching the message.
 *
 * - `invalid-url`  — the URL does not match a recognized git URL pattern.
 * - `path-exists`  — the destination path already exists on the filesystem.
 * - `git-error`    — `git clone` exited with a non-zero status for another reason.
 */
export class GitCloneError extends Error {
  constructor(
    message: string,
    public readonly code: 'invalid-url' | 'path-exists' | 'git-error',
  ) {
    super(message);
    this.name = 'GitCloneError';
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Returns `true` when `url` matches a recognized git URL pattern:
 *   - HTTPS / HTTP:  https://host/path  or  http://host/path
 *   - SSH shorthand: git@host:path
 *   - SSH scheme:    ssh://host/path
 *   - Git scheme:    git://host/path
 *   - File scheme:   file:///path
 */
function isValidGitUrl(url: string): boolean {
  return (
    /^https?:\/\/.+/.test(url) ||
    /^git@[^:]+:.+/.test(url) ||
    /^ssh:\/\/.+/.test(url) ||
    /^git:\/\/.+/.test(url) ||
    /^file:\/\/.+/.test(url)
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Clones the repository at `url` into `path` via `git clone <url> <path>`.
 *
 * Uses `spawnSync` with an explicit argument array — no shell is involved,
 * so URLs and paths containing special characters are safe.
 *
 * Pre-flight checks:
 *   1. `url` is validated against known git URL patterns.
 *   2. `path` must not already exist on the filesystem.
 *
 * @param params          `{ url, path }` — source URL and destination path.
 * @param options.cwd     Working directory for the spawned process. Defaults to
 *                        `process.cwd()` when omitted (the destination path is
 *                        always absolute as supplied by the caller).
 * @returns               `{ url, path, message }` on a successful clone.
 *
 * @throws {GitCloneError}  code `invalid-url`  when the URL pattern is unrecognized.
 * @throws {GitCloneError}  code `path-exists`  when the destination path already exists.
 * @throws {GitCloneError}  code `git-error`    when git exits non-zero for another reason.
 */
export function gitClone(
  params: GitCloneParams,
  options: { cwd?: string } = {},
): GitCloneResult {
  const { url, path } = params;
  const effectiveCwd = options.cwd ?? process.cwd();

  // Pre-flight: URL format validation.
  if (!isValidGitUrl(url)) {
    throw new GitCloneError(
      `Invalid git URL: "${url}". Expected https://, http://, git@, ssh://, git://, or file:// scheme.`,
      'invalid-url',
    );
  }

  // Pre-flight: destination must not already exist.
  if (existsSync(path)) {
    throw new GitCloneError(
      `Destination path already exists: "${path}". Remove it or choose a different path.`,
      'path-exists',
    );
  }

  const result = spawnSync('git', ['clone', url, path], {
    cwd: effectiveCwd,
    encoding: 'utf-8',
  });

  if (result.status === 0) {
    const message =
      typeof result.stderr === 'string' && result.stderr.trim() !== ''
        ? result.stderr.trim()
        : `Cloned ${url} into ${path}.`;
    return { url, path, message };
  }

  const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';

  throw new GitCloneError(
    stderr !== '' ? `git clone failed: ${stderr}` : 'git clone exited with a non-zero status.',
    'git-error',
  );
}
