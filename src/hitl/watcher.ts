import chokidar from 'chokidar';
import { basename } from 'node:path';
import { parseHitlPolicyFile } from './parser.js';
import type { HitlPolicyConfig } from './types.js';

export interface HitlWatcherHandle {
  stop(): Promise<void>;
}

/**
 * Starts a chokidar watcher on a HITL policy file.
 *
 * On each detected change (debounced by `debounceMs`), the file is re-parsed
 * and validated. On success, `configRef.current` is swapped atomically so all
 * subsequent `checkAction` calls pick up the new policies without a restart.
 * On failure, the previous config remains active and an error is logged.
 *
 * @param policyFilePath  Absolute path to the YAML or JSON policy file to watch.
 * @param configRef       Mutable ref whose `.current` is swapped on reload.
 * @param debounceMs      Debounce window in milliseconds (default 300).
 */
export function startHitlPolicyWatcher(
  policyFilePath: string,
  configRef: { current: HitlPolicyConfig },
  debounceMs = 300,
): HitlWatcherHandle {
  const name = basename(policyFilePath);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const reload = async (): Promise<void> => {
    try {
      const config = await parseHitlPolicyFile(policyFilePath);
      configRef.current = config;
      console.log(
        `[hitl-reload] reloaded ${name}: ${config.policies.length} polic${config.policies.length !== 1 ? 'ies' : 'y'} active`,
      );
    } catch (err) {
      console.error(
        `[hitl-reload] failed to reload ${name} (previous config remains active):`,
        err,
      );
    }
  };

  const watcher = chokidar.watch(policyFilePath, {
    persistent: false,
    ignoreInitial: true,
  });

  watcher.on('change', () => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => reload(), debounceMs);
  });

  console.log(`[hitl-reload] watching ${name} for policy changes`);

  return {
    async stop(): Promise<void> {
      if (stopped) return;
      stopped = true;
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      await watcher.close();
      console.log('[hitl-reload] watcher stopped');
    },
  };
}
