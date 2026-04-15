/**
 * UI-side type definitions mirroring the backend policy types.
 *
 * RegExp fields (match, target_match) are represented as strings here
 * since they arrive serialised from the API.
 */

export type Effect = 'permit' | 'forbid';

export type Resource =
  | 'tool'
  | 'command'
  | 'channel'
  | 'prompt'
  | 'model'
  | 'file'
  | 'external'
  | 'payment'
  | 'system'
  | 'credential'
  | 'web'
  | 'memory'
  | 'unknown';

export interface RateLimit {
  maxCalls: number;
  windowSeconds: number;
}

export interface Rule {
  effect: Effect;
  resource?: Resource;
  /** String pattern matched against the resource name. */
  match?: string;
  reason?: string;
  tags?: string[];
  rateLimit?: RateLimit;
  action_class?: string;
  intent_group?: string;
  /** String or regex pattern matched against the specific target of the action. */
  target_match?: string;
  /** Exhaustive list of specific target values this rule applies to. */
  target_in?: string[];
  priority?: number;
}

/**
 * A single record of the rule being triggered in the audit log.
 * Surfaced in the deletion confirmation dialog to show impact.
 */
export interface AuditHit {
  /** ISO 8601 timestamp of when the rule was matched. */
  timestamp: string;
  /** The action or tool call that matched this rule. */
  action: string;
  /** The effect the rule applied. */
  effect: 'permit' | 'forbid';
  /** Optional agent ID that triggered the match. */
  agentId?: string;
}

/** A single labelled field in the formatted rule display. */
export interface RuleField {
  label: string;
  value: string;
  ariaLabel: string;
}
