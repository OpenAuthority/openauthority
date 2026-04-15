/**
 * UI-side rule formatting and confirmation utilities.
 *
 * Pure functions mirroring the backend rule-display and rule-delete-confirm
 * logic for use in React components. String-only (no RegExp) since values
 * arrive serialised from the API.
 */

import type { AuditHit, Rule, RuleField } from '../types.js';

// ─── Confirmation text ────────────────────────────────────────────────────────

/**
 * Derives the exact text the user must type to confirm deletion.
 * Mirrors the backend `deriveConfirmationText` logic.
 *
 *   action_class rule → "{effect}:{action_class}"   e.g. "forbid:filesystem.delete"
 *   intent_group rule → "{effect}:{intent_group}"   e.g. "forbid:destructive_fs"
 *   resource rule     → "{effect}:{resource}:{match}" or "{effect}:{resource}"
 *   unconditional     → "{effect}:unconditional"
 */
export function deriveConfirmationText(rule: Rule): string {
  const e = rule.effect;
  if (rule.action_class !== undefined) return `${e}:${rule.action_class}`;
  if (rule.intent_group !== undefined) return `${e}:${rule.intent_group}`;
  if (rule.resource !== undefined) {
    if (rule.match !== undefined) return `${e}:${rule.resource}:${rule.match}`;
    return `${e}:${rule.resource}`;
  }
  return `${e}:unconditional`;
}

// ─── Field formatting ─────────────────────────────────────────────────────────

function makeField(label: string, value: string): RuleField {
  return { label, value, ariaLabel: `${label} is ${value}` };
}

/**
 * Returns an ordered list of labelled fields for a rule.
 *
 * Field ordering: Effect → (Action class | Intent group | Resource) → Match →
 * Target pattern → Target list → Rate limit → Priority → Tags → Reason.
 * Fields are omitted when undefined or empty.
 */
export function formatRuleFields(rule: Rule): RuleField[] {
  const fields: RuleField[] = [];

  fields.push(makeField('Effect', rule.effect));

  if (rule.action_class !== undefined) {
    fields.push(makeField('Action class', rule.action_class));
  } else if (rule.intent_group !== undefined) {
    fields.push(makeField('Intent group', rule.intent_group));
  } else if (rule.resource !== undefined) {
    fields.push(makeField('Resource', rule.resource));
  }

  if (rule.match !== undefined) {
    fields.push(makeField('Match', rule.match));
  }
  if (rule.target_match !== undefined) {
    fields.push(makeField('Target pattern', rule.target_match));
  }
  if (rule.target_in !== undefined && rule.target_in.length > 0) {
    fields.push(makeField('Target list', rule.target_in.join(', ')));
  }
  if (rule.rateLimit !== undefined) {
    fields.push(
      makeField('Rate limit', `${rule.rateLimit.maxCalls} / ${rule.rateLimit.windowSeconds}s`),
    );
  }
  if (rule.priority !== undefined) {
    fields.push(makeField('Priority', String(rule.priority)));
  }
  if (rule.tags !== undefined && rule.tags.length > 0) {
    fields.push(makeField('Tags', rule.tags.join(', ')));
  }
  if (rule.reason !== undefined) {
    fields.push(makeField('Reason', rule.reason));
  }

  return fields;
}

/**
 * Formats a list of rule fields as column-aligned plain text.
 * Matches the backend `buildText` output format.
 */
export function formatRuleText(fields: RuleField[]): string {
  if (fields.length === 0) return '';
  const labelWidth = Math.max(...fields.map((f) => f.label.length));
  return fields.map((f) => `${f.label.padEnd(labelWidth)}: ${f.value}`).join('\n');
}

// ─── ARIA description ─────────────────────────────────────────────────────────

/**
 * Builds a single screen-reader-friendly sentence summarising the rule.
 * Mirrors the backend `buildAriaDescription` logic.
 */
export function buildRuleAriaDescription(rule: Rule, fields: RuleField[]): string {
  const criterionField = fields.find((f) =>
    ['Resource', 'Action class', 'Intent group'].includes(f.label),
  );
  const matchField = fields.find((f) => f.label === 'Match');
  const targetPatternField = fields.find((f) => f.label === 'Target pattern');
  const targetListField = fields.find((f) => f.label === 'Target list');

  let desc = `Rule ${rule.effect}s`;
  if (criterionField !== undefined) {
    desc += ` ${criterionField.label.toLowerCase()} ${criterionField.value}`;
  }
  if (matchField !== undefined) desc += ` matching ${matchField.value}`;
  if (targetPatternField !== undefined) desc += ` targeting ${targetPatternField.value}`;
  if (targetListField !== undefined) desc += ` targeting listed addresses`;
  return desc;
}

// ─── Timestamp formatting ─────────────────────────────────────────────────────

/** Formats an ISO 8601 timestamp for compact display. */
export function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ─── Confirmation input validation ────────────────────────────────────────────

/**
 * Returns whether the typed value exactly matches the required confirmation
 * text, and an error message when it is a non-empty mismatch.
 */
export function validateConfirmInput(
  typedValue: string,
  confirmationText: string,
): { confirmed: boolean; errorMessage: string | null } {
  if (typedValue === '') return { confirmed: false, errorMessage: null };
  if (typedValue === confirmationText) return { confirmed: true, errorMessage: null };
  return {
    confirmed: false,
    errorMessage: `Text does not match. Type "${confirmationText}" exactly to confirm.`,
  };
}

// ─── Impact summary ───────────────────────────────────────────────────────────

/** Returns natural-language impact context for the side panel. */
export function getRuleImpact(
  rule: Rule,
  auditHits: AuditHit[],
): {
  effectVerb: 'blocks' | 'allows';
  hitCount: number;
  hitNoun: string;
} {
  return {
    effectVerb: rule.effect === 'forbid' ? 'blocks' : 'allows',
    hitCount: auditHits.length,
    hitNoun: auditHits.length === 1 ? 'request' : 'requests',
  };
}
