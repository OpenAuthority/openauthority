/**
 * move_file tool implementation.
 *
 * Moves a file from a source path to a destination path.
 * The source file is removed after a successful move.
 *
 * Uses `renameSync` for an atomic move on the same filesystem.
 * Falls back to `copyFileSync` + `unlinkSync` for cross-device moves,
 * with rollback of the destination on delete failure.
 *
 * Action class: filesystem.write
 */

import { renameSync, statSync, copyFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Input parameters for the move_file tool. */
export interface MoveFileParams {
  /** Path of the source file to move. */
  from: string;
  /** Path of the destination file. */
  to: string;
}

/** Successful result from the move_file tool. */
export interface MoveFileResult {
  /** Absolute path of the source file (now removed). */
  from: string;
  /** Absolute path of the destination file. */
  to: string;
}

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * Typed error thrown by `moveFile`.
 *
 * The `code` discriminant lets callers branch on error type without
 * string-matching the message.
 *
 * - `not-found`  — the source path does not exist.
 * - `not-a-file` — the source path exists but is a directory, not a file.
 * - `fs-error`   — an unexpected filesystem error occurred during the move.
 */
export class MoveFileError extends Error {
  constructor(
    message: string,
    public readonly code: 'not-found' | 'not-a-file' | 'fs-error',
  ) {
    super(message);
    this.name = 'MoveFileError';
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Moves a file from `from` to `to`.
 *
 * Attempts `renameSync` first for an atomic move. Falls back to
 * `copyFileSync` + `unlinkSync` when moving across devices (EXDEV).
 * On fallback delete failure, the destination copy is rolled back.
 *
 * @param params             `{ from, to }` — source and destination paths.
 * @returns                  `{ from, to }` — resolved absolute paths.
 *
 * @throws {MoveFileError}   code `not-found`  when the source path does not exist.
 * @throws {MoveFileError}   code `not-a-file` when the source path is a directory.
 * @throws {MoveFileError}   code `fs-error`   for unexpected filesystem errors.
 */
export function moveFile(params: MoveFileParams): MoveFileResult {
  const resolvedFrom = resolve(params.from);
  const resolvedTo = resolve(params.to);

  // Validate source path exists and is a file.
  try {
    const stat = statSync(resolvedFrom);
    if (!stat.isFile()) {
      throw new MoveFileError(
        `Source path exists but is not a file: ${resolvedFrom}`,
        'not-a-file',
      );
    }
  } catch (err: unknown) {
    if (err instanceof MoveFileError) throw err;
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new MoveFileError(
        `Source file not found: ${resolvedFrom}`,
        'not-found',
      );
    }
    throw new MoveFileError(
      `Failed to access source path: ${resolvedFrom}`,
      'fs-error',
    );
  }

  // Attempt atomic rename (works on same filesystem).
  try {
    renameSync(resolvedFrom, resolvedTo);
    return { from: resolvedFrom, to: resolvedTo };
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    // EXDEV: cross-device link — fall through to copy+delete.
    if (code !== 'EXDEV') {
      throw new MoveFileError(
        `Failed to move file from ${resolvedFrom} to ${resolvedTo}`,
        'fs-error',
      );
    }
  }

  // Cross-device fallback: copy then delete source.
  try {
    copyFileSync(resolvedFrom, resolvedTo);
  } catch {
    throw new MoveFileError(
      `Failed to copy file during move from ${resolvedFrom} to ${resolvedTo}`,
      'fs-error',
    );
  }

  try {
    unlinkSync(resolvedFrom);
  } catch {
    // Rollback: remove the destination we just created.
    try {
      unlinkSync(resolvedTo);
    } catch {
      // Best-effort rollback; ignore secondary failure.
    }
    throw new MoveFileError(
      `Failed to delete source after copy during move: ${resolvedFrom}`,
      'fs-error',
    );
  }

  return { from: resolvedFrom, to: resolvedTo };
}
