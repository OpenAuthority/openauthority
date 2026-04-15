/**
 * Rule structure display utility.
 *
 * Provides `formatRuleStructure` — a pure function that renders a policy Rule
 * as a human-readable, consistently-formatted plain-text block for use in
 * confirmation dialogs and approval messages.
 *
 * Supports resource-based, action-class-based, intent-group-based, and
 * unconditional rules. Each field is labelled for screen-reader accessibility.
 */

import type { Rule, RateLimit } from '../policy/types.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Structural classification of a rule based on its primary matching mechanism.
 *
 * - `'resource'`      — Matched by resource type and optional pattern.
 * - `'action-class'`  — Matched by semantic action class (e.g. 'filesystem.read').
 * - `'intent-group'`  — Matched by intent group (e.g. 'data_exfiltration').
 * - `'unconditional'` — No matching criteria; applies universally.
 */
export type RuleType = 'resource' | 'action-class' | 'intent-group' | 'unconditional';

/**
 * A single labelled field in the formatted rule display.
 *
 * Callers may use `label` and `value` for structured rendering, or `ariaLabel`
 * for screen-reader announcements and accessible `aria-label` attributes.
 */
export interface RuleDisplayField {
  /** Short human-readable label (e.g. `"Effect"`, `"Resource"`). */
  label: string;
  /** The field value as a display string (e.g. `"permit"`, `"tool"`). */
  value: string;
  /**
   * Full ARIA-compatible sentence for this field (e.g. `"Effect is permit"`).
   * Suitable for `aria-label` attributes or screen-reader announcements.
   */
  ariaLabel: string;
}

/**
 * Result returned by `formatRuleStructure` containing the formatted rule.
 */
export interface RuleDisplayResult {
  /** The structural type of this rule. */
  ruleType: RuleType;
  /**
   * Ordered list of labelled fields describing the rule.
   * Fields are omitted when the corresponding property is undefined or empty.
   */
  fields: RuleDisplayField[];
  /**
   * Plain-text multi-line representation of the rule, suitable for display in
   * confirmation dialogs, terminal output, or approval messages.
   * Each field is rendered as `Label: value` on its own line, with values
   * column-aligned under the widest label.
   */
  text: string;
  /**
   * A single screen-reader-friendly sentence summarising the entire rule.
   * Suitable for use as an `aria-label` on the rule container element.
   */
  ariaDescription: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function classifyRule(rule: Rule): RuleType {
  if (rule.action_class !== undefined) return 'action-class';
  if (rule.intent_group !== undefined) return 'intent-group';
  if (rule.resource !== undefined) return 'resource';
  return 'unconditional';
}

function formatMatch(match: string | RegExp): string {
  return match instanceof RegExp ? match.toString() : match;
}

function formatRateLimit(rateLimit: RateLimit): string {
  return `${rateLimit.maxCalls} / ${rateLimit.windowSeconds}s`;
}

function makeField(label: string, value: string): RuleDisplayField {
  return { label, value, ariaLabel: `${label} is ${value}` };
}

function buildText(fields: RuleDisplayField[]): string {
  if (fields.length === 0) return '';
  const labelWidth = Math.max(...fields.map((f) => f.label.length));
  return fields.map((f) => `${f.label.padEnd(labelWidth)}: ${f.value}`).join('\n');
}

function buildAriaDescription(effect: string, fields: RuleDisplayField[]): string {
  const criterionField = fields.find((f) =>
    ['Resource', 'Action class', 'Intent group'].includes(f.label),
  );
  const matchField = fields.find((f) => f.label === 'Match');
  const targetPatternField = fields.find((f) => f.label === 'Target pattern');
  const targetListField = fields.find((f) => f.label === 'Target list');
  const condField = fields.find((f) => f.label === 'Condition');
  const rateLimitField = fields.find((f) => f.label === 'Rate limit');

  let desc = `Rule ${effect}s`;
  if (criterionField !== undefined) {
    desc += ` ${criterionField.label.toLowerCase()} ${criterionField.value}`;
  }
  if (matchField !== undefined) {
    desc += ` matching ${matchField.value}`;
  }
  if (targetPatternField !== undefined) {
    desc += ` targeting ${targetPatternField.value}`;
  }
  if (targetListField !== undefined) {
    desc += ` targeting listed addresses`;
  }
  if (condField !== undefined) {
    desc += ` with custom condition`;
  }
  if (rateLimitField !== undefined) {
    desc += `, rate limited to ${rateLimitField.value}`;
  }
  return desc;
}

// ─── Formatter ────────────────────────────────────────────────────────────────

/**
 * Formats a policy rule as a structured, human-readable display block.
 *
 * The output is intended for confirmation dialogs, HITL approval messages, and
 * other contexts where rule details must be communicated clearly and accessibly.
 * All fields are individually labelled for screen-reader compatibility.
 *
 * Supported rule types:
 *   - Resource rules       — matched by resource type and optional pattern
 *   - Action-class rules   — matched by semantic action class
 *   - Intent-group rules   — matched by intent group
 *   - Unconditional rules  — apply without criteria
 *
 * Fields are omitted when undefined or empty. The primary matching criterion
 * (action_class → intent_group → resource) is listed immediately after Effect.
 * All values are column-aligned in the plain-text output.
 *
 * @param rule  The policy rule to format.
 * @returns     A `RuleDisplayResult` with structured fields, plain text, and ARIA description.
 *
 * @example
 * const result = formatRuleStructure({
 *   effect: 'forbid',
 *   resource: 'file',
 *   match: '/etc/*',
 *   reason: 'Protect system files',
 * });
 * console.log(result.text);
 * // Effect  : forbid
 * // Resource: file
 * // Match   : /etc/*
 * // Reason  : Protect system files
 */
export function formatRuleStructure(rule: Rule): RuleDisplayResult {
  const ruleType = classifyRule(rule);
  const fields: RuleDisplayField[] = [];

  // ── Effect (always present) ───────────────────────────────────────────────
  fields.push(makeField('Effect', rule.effect));

  // ── Primary matching criterion ────────────────────────────────────────────
  if (ruleType === 'action-class' && rule.action_class !== undefined) {
    fields.push(makeField('Action class', rule.action_class));
  } else if (ruleType === 'intent-group' && rule.intent_group !== undefined) {
    fields.push(makeField('Intent group', rule.intent_group));
  } else if (rule.resource !== undefined) {
    fields.push(makeField('Resource', rule.resource));
  }

  // ── Match pattern ─────────────────────────────────────────────────────────
  if (rule.match !== undefined) {
    fields.push(makeField('Match', formatMatch(rule.match)));
  }

  // ── Target pattern (target_match) ─────────────────────────────────────────
  if (rule.target_match !== undefined) {
    fields.push(makeField('Target pattern', formatMatch(rule.target_match)));
  }

  // ── Target list (target_in) ───────────────────────────────────────────────
  if (rule.target_in !== undefined && rule.target_in.length > 0) {
    fields.push(makeField('Target list', rule.target_in.join(', ')));
  }

  // ── Condition (presence only — functions are not serialisable) ────────────
  if (rule.condition !== undefined) {
    fields.push(makeField('Condition', 'custom function'));
  }

  // ── Rate limit ────────────────────────────────────────────────────────────
  if (rule.rateLimit !== undefined) {
    fields.push(makeField('Rate limit', formatRateLimit(rule.rateLimit)));
  }

  // ── Priority ──────────────────────────────────────────────────────────────
  if (rule.priority !== undefined) {
    fields.push(makeField('Priority', String(rule.priority)));
  }

  // ── Tags ──────────────────────────────────────────────────────────────────
  if (rule.tags !== undefined && rule.tags.length > 0) {
    fields.push(makeField('Tags', rule.tags.join(', ')));
  }

  // ── Reason ────────────────────────────────────────────────────────────────
  if (rule.reason !== undefined) {
    fields.push(makeField('Reason', rule.reason));
  }

  const text = buildText(fields);
  const ariaDescription = buildAriaDescription(rule.effect, fields);

  return { ruleType, fields, text, ariaDescription };
}
