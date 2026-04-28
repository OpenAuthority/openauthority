/**
 * Auto-permit store — persistence layer for auto-permit rules.
 *
 * Provides atomic read/write access to the auto-permit JSON store file and
 * a debounced file-system watcher for hot-reloading rules when the store is
 * modified externally.
 *
 * @module
 */

import { readFile, writeFile, rename, chmod } from 'node:fs/promises';
import chokidar from 'chokidar';
import { isAutoPermit } from '../models/auto-permit.js';
import type { AutoPermit } from '../models/auto-permit.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Result returned by {@link loadAutoPermitRulesFromFile}.
 *
 * When `found` is `false` the store file did not exist (ENOENT) and
 * `rules` / `skipped` will both be zero.  Callers should treat the absent
 * file as an empty store without logging an error.
 */
export interface LoadResult {
  /** Validated auto-permit records parsed from the file. */
  rules: AutoPermit[];
  /** Number of records that failed `isAutoPermit` validation and were skipped. */
  skipped: number;
  /** Absolute path of the store file that was (attempted to be) read. */
  path: string;
  /** Whether the store file was found on disk. */
  found: boolean;
}

/**
 * Handle returned by {@link watchAutoPermitStore}.
 *
 * Call {@link stop} to close the underlying chokidar watcher and cancel any
 * pending debounce timer.
 */
export interface AutoPermitWatchHandle {
  /** Stops watching the store file and clears any pending debounce timer. */
  stop(): void;
}

// ── loadAutoPermitRulesFromFile ───────────────────────────────────────────────

/**
 * Loads auto-permit rules from a JSON store file.
 *
 * Reads and parses the file at `storePath`.  If the file does not exist
 * (ENOENT) the function returns a {@link LoadResult} with `found: false` and
 * empty `rules` — this is not treated as an error.  All other I/O errors are
 * re-thrown.
 *
 * Records that fail the {@link isAutoPermit} type-guard are silently skipped;
 * their count is reflected in `skipped` so callers can emit a warning.
 *
 * @param storePath Absolute path to the auto-permit JSON store file.
 * @returns A {@link LoadResult} describing the loaded rules and metadata.
 */
export async function loadAutoPermitRulesFromFile(storePath: string): Promise<LoadResult> {
  let raw: string;
  try {
    raw = await readFile(storePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { rules: [], skipped: 0, path: storePath, found: false };
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { rules: [], skipped: 0, path: storePath, found: true };
  }

  if (!Array.isArray(parsed)) {
    return { rules: [], skipped: 0, path: storePath, found: true };
  }

  const rules = parsed.filter(isAutoPermit);
  const skipped = parsed.length - rules.length;
  return { rules, skipped, path: storePath, found: true };
}

// ── saveAutoPermitRules ───────────────────────────────────────────────────────

/**
 * Atomically writes `rules` to the auto-permit store file at `storePath`.
 *
 * Uses a write-to-temp-then-rename pattern to ensure the file is never left
 * in a partially written state.  The file (and the temp file) are created
 * with mode `0o644`.
 *
 * @param storePath Absolute path to the target auto-permit JSON store file.
 * @param rules     Array of {@link AutoPermit} records to persist.
 */
export async function saveAutoPermitRules(storePath: string, rules: AutoPermit[]): Promise<void> {
  const tmpPath = `${storePath}.tmp`;
  const content = JSON.stringify(rules, null, 2) + '\n';
  await writeFile(tmpPath, content, { mode: 0o644 });
  await rename(tmpPath, storePath);
  await chmod(storePath, 0o644);
}

// ── watchAutoPermitStore ──────────────────────────────────────────────────────

/** Options for {@link watchAutoPermitStore}. */
export interface WatchAutoPermitStoreOpts {
  /** Debounce window in milliseconds (default: `300`). */
  debounceMs?: number;
}

/**
 * Starts a file-system watcher on the auto-permit store file.
 *
 * Both `add` and `change` chokidar events trigger `callback` after the
 * debounce window expires.  Rapid successive events (e.g. write + chmod from
 * {@link saveAutoPermitRules}) collapse into a single callback invocation.
 *
 * The watcher is created with `persistent: false` so it does not prevent the
 * Node.js process from exiting naturally.
 *
 * @param storePath Absolute path to the auto-permit JSON store file to watch.
 * @param callback  Function to call after a debounced file-system event.
 * @param opts      Optional configuration overrides.
 * @returns An {@link AutoPermitWatchHandle} whose `stop()` method closes the watcher.
 */
export function watchAutoPermitStore(
  storePath: string,
  callback: () => void,
  opts: WatchAutoPermitStoreOpts = {},
): AutoPermitWatchHandle {
  const debounceMs = opts.debounceMs ?? 300;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const watcher = chokidar.watch(storePath, { persistent: false });

  const handler = () => {
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(callback, debounceMs);
  };

  watcher.on('add', handler);
  watcher.on('change', handler);

  return {
    stop(): void {
      void watcher.close();
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
        debounceTimer = undefined;
      }
    },
  };
}
