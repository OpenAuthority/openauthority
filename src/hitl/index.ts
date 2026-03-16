// ─── Schema + Types ───────────────────────────────────────────────────────────
export {
  HitlFallbackSchema,
  HitlApprovalConfigSchema,
  HitlPolicySchema,
  HitlPolicyConfigSchema,
} from './types.js';
export type {
  HitlFallback,
  HitlApprovalConfig,
  HitlPolicy,
  HitlPolicyConfig,
} from './types.js';

// ─── Pattern matching ─────────────────────────────────────────────────────────
export { matchesActionPattern, checkAction } from './matcher.js';
export type { HitlCheckResult } from './matcher.js';

// ─── File parsing + validation ────────────────────────────────────────────────
export {
  parseHitlPolicyFile,
  validateHitlPolicyConfig,
  HitlPolicyParseError,
  HitlPolicyValidationError,
} from './parser.js';

// ─── Hot-reload watcher ───────────────────────────────────────────────────────
export { startHitlPolicyWatcher } from './watcher.js';
export type { HitlWatcherHandle } from './watcher.js';
