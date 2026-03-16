import type { HitlPolicy, HitlPolicyConfig } from './types.js';

/**
 * Matches an action string against a single dot-notation pattern.
 *
 * Rules:
 * - `"*"` alone matches any action string, regardless of segments.
 * - Exact string: `"email.delete"` matches only `"email.delete"`.
 * - Per-segment wildcard: `"email.*"` matches `"email.send"`, `"email.delete"`, etc.
 *   `"*.delete"` matches `"email.delete"`, `"file.delete"`, etc.
 * - Patterns with different segment counts do NOT match (e.g. `"a.*"` does not
 *   match `"a"` or `"a.b.c"`).
 */
export function matchesActionPattern(pattern: string, action: string): boolean {
  if (pattern === '*') return true;
  if (pattern === action) return true;

  const patternParts = pattern.split('.');
  const actionParts = action.split('.');

  if (patternParts.length !== actionParts.length) return false;

  return patternParts.every((seg, i) => seg === '*' || seg === actionParts[i]);
}

/** Result of evaluating an action against the full HITL policy config. */
export interface HitlCheckResult {
  /** Whether the action matches at least one HITL policy. */
  requiresApproval: boolean;
  /** The first matching policy (in declaration order), if any. */
  matchedPolicy?: HitlPolicy;
}

/**
 * Checks whether an action requires human approval according to the policy config.
 *
 * Policies are evaluated in declaration order; the first policy whose `actions`
 * list contains a pattern that matches `action` is returned as the match.
 * Returns `{ requiresApproval: false }` when no policy matches.
 */
export function checkAction(
  config: HitlPolicyConfig,
  action: string,
): HitlCheckResult {
  for (const policy of config.policies) {
    for (const pattern of policy.actions) {
      if (matchesActionPattern(pattern, action)) {
        return { requiresApproval: true, matchedPolicy: policy };
      }
    }
  }
  return { requiresApproval: false };
}
