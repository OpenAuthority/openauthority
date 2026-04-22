/**
 * find_files tool implementation.
 *
 * Searches a directory tree recursively for files whose relative path
 * matches the supplied glob pattern, returning an array of absolute paths.
 *
 * Action class: filesystem.read
 */

import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Input parameters for the find_files tool. */
export interface FindFilesParams {
  /**
   * Glob pattern matched against each file's relative path from the search
   * root. Supports `*` (any chars except `/`), `**` (any path depth),
   * `?` (single char except `/`), and `{a,b}` alternation.
   */
  pattern: string;
  /**
   * Absolute path of the directory to search. Defaults to `process.cwd()`
   * when omitted.
   */
  path?: string;
}

/** Successful result from the find_files tool. */
export interface FindFilesResult {
  /** Array of absolute file paths that matched the pattern. */
  paths: string[];
}

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * Typed error thrown by `findFiles`.
 *
 * - `not-found`  — the specified path does not exist.
 * - `not-a-dir`  — the specified path exists but is not a directory.
 * - `fs-error`   — an unexpected filesystem error occurred.
 */
export class FindFilesError extends Error {
  constructor(
    message: string,
    public readonly code: 'not-found' | 'not-a-dir' | 'fs-error',
  ) {
    super(message);
    this.name = 'FindFilesError';
  }
}

// ─── Glob pattern matching ────────────────────────────────────────────────────

/**
 * Escapes all regex metacharacters in a literal string segment.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

/**
 * Converts a glob pattern to a RegExp that matches relative file paths.
 *
 * Supported syntax:
 *   *       — zero or more characters, excluding /
 *   **      — zero or more path segments (used as "**\/" prefix or at end)
 *   ?       — exactly one character, excluding /
 *   {a,b}   — alternation; each alternative is treated as a literal segment
 */
function globToRegex(pattern: string): RegExp {
  let src = '';
  let i = 0;

  while (i < pattern.length) {
    const c = pattern[i]!;

    if (c === '*') {
      if (pattern[i + 1] === '*') {
        i += 2;
        if (pattern[i] === '/') {
          // **/ → zero or more path segments (each ending with /)
          src += '(?:.*/)?';
          i++;
        } else {
          // ** at end of pattern → matches anything including slashes
          src += '.*';
        }
      } else {
        // * → zero or more chars, not crossing directory boundary
        src += '[^/]*';
        i++;
      }
    } else if (c === '?') {
      src += '[^/]';
      i++;
    } else if (c === '{') {
      const end = pattern.indexOf('}', i + 1);
      if (end === -1) {
        // Malformed brace — treat as literal
        src += escapeRegex(c);
        i++;
      } else {
        const alts = pattern.slice(i + 1, end).split(',').map(escapeRegex);
        src += `(?:${alts.join('|')})`;
        i = end + 1;
      }
    } else {
      src += escapeRegex(c);
      i++;
    }
  }

  return new RegExp(`^${src}$`);
}

// ─── Directory traversal ──────────────────────────────────────────────────────

/**
 * Recursively walks `base/rel`, testing each non-directory entry's relative
 * path against `regex`. Matching absolute paths are pushed to `results`.
 *
 * Errors from `readdirSync` or `statSync` on individual entries are silently
 * skipped so that a single inaccessible entry does not abort the walk.
 */
function walkDir(base: string, rel: string, regex: RegExp, results: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(rel === '' ? base : join(base, rel));
  } catch {
    return;
  }

  for (const name of entries) {
    const relPath = rel === '' ? name : `${rel}/${name}`;
    const absPath = join(base, relPath);

    let isDir = false;
    try {
      isDir = statSync(absPath).isDirectory();
    } catch {
      continue;
    }

    if (isDir) {
      walkDir(base, relPath, regex, results);
    } else if (regex.test(relPath)) {
      results.push(absPath);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Searches a directory tree recursively for files matching a glob pattern.
 *
 * The pattern is matched against each file's **relative path** from the
 * search root, using forward slashes as separators regardless of platform.
 * Absolute paths are returned in the result array.
 *
 * Uses synchronous filesystem APIs — no shell is involved, so paths with
 * spaces or special characters are safe.
 *
 * @param params  `{ pattern, path? }` — glob to match and optional search root.
 * @returns       `{ paths }` — array of absolute paths of matching files.
 *
 * @throws {FindFilesError} code `not-found` when `path` does not exist.
 * @throws {FindFilesError} code `not-a-dir` when `path` is not a directory.
 * @throws {FindFilesError} code `fs-error` for unexpected filesystem errors.
 */
export function findFiles(params: FindFilesParams): FindFilesResult {
  const { pattern, path: searchPath } = params;
  const root = resolve(searchPath ?? process.cwd());

  // Validate root path exists and is a directory.
  let rootStat: ReturnType<typeof statSync>;
  try {
    rootStat = statSync(root);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new FindFilesError(`Directory not found: ${root}`, 'not-found');
    }
    throw new FindFilesError(`Failed to access path: ${root}`, 'fs-error');
  }

  if (!rootStat.isDirectory()) {
    throw new FindFilesError(`Path is not a directory: ${root}`, 'not-a-dir');
  }

  const regex = globToRegex(pattern);
  const paths: string[] = [];
  walkDir(root, '', regex, paths);

  return { paths };
}
