/**
 * make_dir tool implementation.
 *
 * Creates a directory at the specified path, including any missing parent
 * directories. Returns gracefully if the directory already exists.
 *
 * Action class: filesystem.write
 */

import { mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Input parameters for the make_dir tool. */
export interface MakeDirParams {
  /** Path of the directory to create. */
  path: string;
}

/** Successful result from the make_dir tool. */
export interface MakeDirResult {
  /** Absolute path of the created (or already existing) directory. */
  path: string;
}

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * Typed error thrown by `makeDir`.
 *
 * The `code` discriminant lets callers branch on error type without
 * string-matching the message.
 *
 * - `not-a-dir` — the specified path exists but is a file, not a directory.
 * - `fs-error`  — an unexpected filesystem error occurred while creating the directory.
 */
export class MakeDirError extends Error {
  constructor(
    message: string,
    public readonly code: 'not-a-dir' | 'fs-error',
  ) {
    super(message);
    this.name = 'MakeDirError';
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Creates a directory at the specified path.
 *
 * Creates all missing parent directories automatically. If the directory
 * already exists, returns successfully without modification.
 *
 * Uses `mkdirSync` with `{ recursive: true }` — no shell is involved, so
 * paths with spaces or special characters are safe.
 *
 * @param params            `{ path }` — path of the directory to create.
 * @returns                 `{ path }` — absolute path of the created directory.
 *
 * @throws {MakeDirError}   code `not-a-dir` when `path` exists but is a file.
 * @throws {MakeDirError}   code `fs-error` for unexpected filesystem errors.
 */
export function makeDir(params: MakeDirParams): MakeDirResult {
  const resolvedPath = resolve(params.path);

  // Check whether the path already exists.
  try {
    const stat = statSync(resolvedPath);
    if (!stat.isDirectory()) {
      throw new MakeDirError(
        `Path exists but is not a directory: ${resolvedPath}`,
        'not-a-dir',
      );
    }
    // Already a directory — return gracefully without modification.
    return { path: resolvedPath };
  } catch (err: unknown) {
    if (err instanceof MakeDirError) throw err;
    const code = (err as NodeJS.ErrnoException).code;
    // ENOENT is expected — the directory does not exist yet; proceed to create it.
    if (code !== 'ENOENT') {
      throw new MakeDirError(`Failed to access path: ${resolvedPath}`, 'fs-error');
    }
  }

  // Create the directory and all missing parent directories.
  try {
    mkdirSync(resolvedPath, { recursive: true });
  } catch {
    throw new MakeDirError(`Failed to create directory: ${resolvedPath}`, 'fs-error');
  }

  return { path: resolvedPath };
}
