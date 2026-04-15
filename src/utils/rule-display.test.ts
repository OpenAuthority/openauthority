/**
 * formatRuleStructure — test suite
 *
 * Covers all rendering paths in rule-display.ts:
 *   formatRuleStructure — renders a policy Rule as a human-readable display block
 */
import { describe, it, expect } from 'vitest';
import { formatRuleStructure } from './rule-display.js';
import type { RuleDisplayResult } from './rule-display.js';
import type { Rule } from '../policy/types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRule(overrides?: Partial<Rule>): Rule {
  return {
    effect: 'permit',
    resource: 'file',
    match: '/tmp/*',
    ...overrides,
  };
}

function fieldValue(result: RuleDisplayResult, label: string): string | undefined {
  return result.fields.find((f) => f.label === label)?.value;
}

function hasField(result: RuleDisplayResult, label: string): boolean {
  return result.fields.some((f) => f.label === label);
}

// ─── formatRuleStructure ──────────────────────────────────────────────────────

describe('formatRuleStructure', () => {
  // ── rule type classification ───────────────────────────────────────────────

  it('classifies action_class rules as "action-class"', () => {
    const result = formatRuleStructure({ effect: 'forbid', action_class: 'filesystem.read' });
    expect(result.ruleType).toBe('action-class');
  });

  it('classifies intent_group rules as "intent-group"', () => {
    const result = formatRuleStructure({ effect: 'forbid', intent_group: 'data_exfiltration' });
    expect(result.ruleType).toBe('intent-group');
  });

  it('classifies resource rules as "resource"', () => {
    const result = formatRuleStructure({ effect: 'permit', resource: 'file', match: '*' });
    expect(result.ruleType).toBe('resource');
  });

  it('classifies rules with no criteria as "unconditional"', () => {
    const result = formatRuleStructure({ effect: 'forbid' });
    expect(result.ruleType).toBe('unconditional');
  });

  it('prefers action-class over resource when both are present', () => {
    const result = formatRuleStructure({
      effect: 'forbid',
      action_class: 'filesystem.write',
      resource: 'file',
    });
    expect(result.ruleType).toBe('action-class');
  });

  it('prefers action-class over intent-group when both are present', () => {
    const result = formatRuleStructure({
      effect: 'forbid',
      action_class: 'network.request',
      intent_group: 'data_exfiltration',
    });
    expect(result.ruleType).toBe('action-class');
  });

  it('prefers intent-group over resource when both are present', () => {
    const result = formatRuleStructure({
      effect: 'forbid',
      intent_group: 'data_exfiltration',
      resource: 'file',
    });
    expect(result.ruleType).toBe('intent-group');
  });

  // ── Effect field ──────────────────────────────────────────────────────────

  it('always includes Effect field for permit rule', () => {
    expect(hasField(formatRuleStructure({ effect: 'permit' }), 'Effect')).toBe(true);
  });

  it('always includes Effect field for forbid rule', () => {
    expect(hasField(formatRuleStructure({ effect: 'forbid' }), 'Effect')).toBe(true);
  });

  it('renders "permit" effect correctly', () => {
    expect(fieldValue(formatRuleStructure({ effect: 'permit' }), 'Effect')).toBe('permit');
  });

  it('renders "forbid" effect correctly', () => {
    expect(fieldValue(formatRuleStructure({ effect: 'forbid' }), 'Effect')).toBe('forbid');
  });

  it('lists Effect as the first field', () => {
    const result = formatRuleStructure(makeRule());
    expect(result.fields[0]?.label).toBe('Effect');
  });

  // ── Matching criterion fields ──────────────────────────────────────────────

  it('includes Resource field for resource rules', () => {
    const result = formatRuleStructure({ effect: 'permit', resource: 'tool' });
    expect(fieldValue(result, 'Resource')).toBe('tool');
  });

  it('includes "Action class" field for action-class rules', () => {
    const result = formatRuleStructure({ effect: 'forbid', action_class: 'filesystem.read' });
    expect(fieldValue(result, 'Action class')).toBe('filesystem.read');
  });

  it('includes "Intent group" field for intent-group rules', () => {
    const result = formatRuleStructure({ effect: 'forbid', intent_group: 'data_exfiltration' });
    expect(fieldValue(result, 'Intent group')).toBe('data_exfiltration');
  });

  it('omits Resource field when action_class takes precedence', () => {
    const result = formatRuleStructure({
      effect: 'forbid',
      action_class: 'filesystem.read',
      resource: 'file',
    });
    expect(hasField(result, 'Resource')).toBe(false);
  });

  it('omits Resource field when rule has no resource', () => {
    const result = formatRuleStructure({ effect: 'forbid', action_class: 'filesystem.read' });
    expect(hasField(result, 'Resource')).toBe(false);
  });

  // ── Match field ───────────────────────────────────────────────────────────

  it('includes Match field when match is a string', () => {
    const result = formatRuleStructure({ effect: 'permit', resource: 'file', match: '/tmp/*' });
    expect(fieldValue(result, 'Match')).toBe('/tmp/*');
  });

  it('includes Match field when match is a RegExp', () => {
    const result = formatRuleStructure({
      effect: 'permit',
      resource: 'file',
      match: /^\/etc\/.*/,
    });
    expect(fieldValue(result, 'Match')).toBe('/^\\/etc\\/.*/' );
  });

  it('includes Match field with wildcard string', () => {
    const result = formatRuleStructure({ effect: 'permit', resource: 'tool', match: '*' });
    expect(fieldValue(result, 'Match')).toBe('*');
  });

  it('omits Match field when match is not set', () => {
    const result = formatRuleStructure({ effect: 'permit', resource: 'tool' });
    expect(hasField(result, 'Match')).toBe(false);
  });

  // ── Target pattern field (target_match) ────────────────────────────────────

  it('includes "Target pattern" field when target_match is a RegExp', () => {
    const result = formatRuleStructure({
      effect: 'forbid',
      resource: 'external',
      match: '*',
      target_match: /^blocked@evil\.com$/,
    });
    expect(fieldValue(result, 'Target pattern')).toBe('/^blocked@evil\\.com$/');
  });

  it('includes "Target pattern" field when target_match is a string', () => {
    const result = formatRuleStructure({
      effect: 'forbid',
      resource: 'external',
      match: '*',
      target_match: 'blocked@evil.com',
    });
    expect(fieldValue(result, 'Target pattern')).toBe('blocked@evil.com');
  });

  it('omits "Target pattern" field when target_match is not set', () => {
    const result = formatRuleStructure({ effect: 'permit', resource: 'external', match: '*' });
    expect(hasField(result, 'Target pattern')).toBe(false);
  });

  it('includes "Target list" field when target_in is non-empty', () => {
    const result = formatRuleStructure({
      effect: 'forbid',
      resource: 'external',
      match: '*',
      target_in: ['spam@blocked.com', 'abuse@badactor.net'],
    });
    expect(fieldValue(result, 'Target list')).toBe('spam@blocked.com, abuse@badactor.net');
  });

  it('omits "Target list" field when target_in is an empty array', () => {
    const result = formatRuleStructure({
      effect: 'forbid',
      resource: 'external',
      match: '*',
      target_in: [],
    });
    expect(hasField(result, 'Target list')).toBe(false);
  });

  it('omits "Target list" field when target_in is not set', () => {
    const result = formatRuleStructure({ effect: 'permit', resource: 'external', match: '*' });
    expect(hasField(result, 'Target list')).toBe(false);
  });

  it('"Target pattern" appears after "Match" in field ordering', () => {
    const result = formatRuleStructure({
      effect: 'forbid',
      resource: 'external',
      match: '*',
      target_match: /^blocked@evil\.com$/,
    });
    const labels = result.fields.map((f) => f.label);
    const matchIdx = labels.indexOf('Match');
    const targetIdx = labels.indexOf('Target pattern');
    expect(matchIdx).toBeGreaterThanOrEqual(0);
    expect(targetIdx).toBeGreaterThan(matchIdx);
  });

  it('"Target list" appears after "Match" in field ordering', () => {
    const result = formatRuleStructure({
      effect: 'forbid',
      resource: 'external',
      match: '*',
      target_in: ['a@b.com'],
    });
    const labels = result.fields.map((f) => f.label);
    const matchIdx = labels.indexOf('Match');
    const listIdx = labels.indexOf('Target list');
    expect(matchIdx).toBeGreaterThanOrEqual(0);
    expect(listIdx).toBeGreaterThan(matchIdx);
  });

  it('ariaLabel for "Target pattern" follows "Label is value" convention', () => {
    const result = formatRuleStructure({
      effect: 'forbid',
      resource: 'external',
      match: '*',
      target_match: /^blocked@evil\.com$/,
    });
    const field = result.fields.find((f) => f.label === 'Target pattern');
    expect(field?.ariaLabel).toBe('Target pattern is /^blocked@evil\\.com$/');
  });

  it('ariaDescription includes target pattern when target_match is set', () => {
    const result = formatRuleStructure({
      effect: 'forbid',
      resource: 'external',
      match: '*',
      target_match: /^blocked@evil\.com$/,
    });
    expect(result.ariaDescription).toContain('targeting');
  });

  it('ariaDescription mentions listed addresses when target_in is set', () => {
    const result = formatRuleStructure({
      effect: 'forbid',
      resource: 'external',
      match: '*',
      target_in: ['spam@blocked.com'],
    });
    expect(result.ariaDescription).toContain('targeting listed addresses');
  });

  // ── Condition field ────────────────────────────────────────────────────────

  it('shows "custom function" when condition is present', () => {
    const result = formatRuleStructure({
      effect: 'permit',
      resource: 'tool',
      condition: () => true,
    });
    expect(fieldValue(result, 'Condition')).toBe('custom function');
  });

  it('omits Condition field when condition is not set', () => {
    const result = formatRuleStructure({ effect: 'permit', resource: 'tool' });
    expect(hasField(result, 'Condition')).toBe(false);
  });

  // ── Rate limit field ───────────────────────────────────────────────────────

  it('formats rate limit as "{maxCalls} / {windowSeconds}s"', () => {
    const result = formatRuleStructure({
      effect: 'permit',
      resource: 'tool',
      rateLimit: { maxCalls: 10, windowSeconds: 60 },
    });
    expect(fieldValue(result, 'Rate limit')).toBe('10 / 60s');
  });

  it('formats rate limit with single-call window', () => {
    const result = formatRuleStructure({
      effect: 'permit',
      resource: 'tool',
      rateLimit: { maxCalls: 1, windowSeconds: 3600 },
    });
    expect(fieldValue(result, 'Rate limit')).toBe('1 / 3600s');
  });

  it('formats rate limit with zero maxCalls', () => {
    const result = formatRuleStructure({
      effect: 'forbid',
      resource: 'file',
      rateLimit: { maxCalls: 0, windowSeconds: 60 },
    });
    expect(fieldValue(result, 'Rate limit')).toBe('0 / 60s');
  });

  it('omits Rate limit field when rateLimit is not set', () => {
    const result = formatRuleStructure({ effect: 'permit', resource: 'tool' });
    expect(hasField(result, 'Rate limit')).toBe(false);
  });

  // ── Priority field ─────────────────────────────────────────────────────────

  it('includes Priority field when set', () => {
    const result = formatRuleStructure({ effect: 'forbid', resource: 'file', priority: 90 });
    expect(fieldValue(result, 'Priority')).toBe('90');
  });

  it('includes Priority 0 correctly', () => {
    const result = formatRuleStructure({ effect: 'permit', resource: 'tool', priority: 0 });
    expect(fieldValue(result, 'Priority')).toBe('0');
  });

  it('includes Priority 100 (unconditional forbid tier)', () => {
    const result = formatRuleStructure({ effect: 'forbid', resource: 'file', priority: 100 });
    expect(fieldValue(result, 'Priority')).toBe('100');
  });

  it('omits Priority field when priority is not set', () => {
    const result = formatRuleStructure({ effect: 'permit', resource: 'tool' });
    expect(hasField(result, 'Priority')).toBe(false);
  });

  // ── Tags field ─────────────────────────────────────────────────────────────

  it('formats single tag correctly', () => {
    const result = formatRuleStructure({ effect: 'permit', resource: 'tool', tags: ['security'] });
    expect(fieldValue(result, 'Tags')).toBe('security');
  });

  it('formats multiple tags as comma-separated list', () => {
    const result = formatRuleStructure({
      effect: 'permit',
      resource: 'tool',
      tags: ['security', 'admin', 'readonly'],
    });
    expect(fieldValue(result, 'Tags')).toBe('security, admin, readonly');
  });

  it('omits Tags field when tags is an empty array', () => {
    const result = formatRuleStructure({ effect: 'permit', resource: 'tool', tags: [] });
    expect(hasField(result, 'Tags')).toBe(false);
  });

  it('omits Tags field when tags is not set', () => {
    const result = formatRuleStructure({ effect: 'permit', resource: 'tool' });
    expect(hasField(result, 'Tags')).toBe(false);
  });

  // ── Reason field ───────────────────────────────────────────────────────────

  it('includes Reason field when set', () => {
    const result = formatRuleStructure({
      effect: 'forbid',
      resource: 'file',
      reason: 'Protect system files',
    });
    expect(fieldValue(result, 'Reason')).toBe('Protect system files');
  });

  it('omits Reason field when reason is not set', () => {
    const result = formatRuleStructure({ effect: 'permit', resource: 'tool' });
    expect(hasField(result, 'Reason')).toBe(false);
  });

  // ── Field ordering ─────────────────────────────────────────────────────────

  it('orders fields: Effect → Resource → Match → Condition → Rate limit → Priority → Tags → Reason', () => {
    const result = formatRuleStructure({
      effect: 'permit',
      resource: 'tool',
      match: 'bash',
      condition: () => true,
      rateLimit: { maxCalls: 5, windowSeconds: 30 },
      priority: 10,
      tags: ['shell'],
      reason: 'Allow bash',
    });
    const labels = result.fields.map((f) => f.label);
    expect(labels).toEqual([
      'Effect',
      'Resource',
      'Match',
      'Condition',
      'Rate limit',
      'Priority',
      'Tags',
      'Reason',
    ]);
  });

  it('orders fields: Effect → Resource → Match → Target pattern → Target list → Condition → Rate limit → Priority → Tags → Reason', () => {
    const result = formatRuleStructure({
      effect: 'forbid',
      resource: 'external',
      match: '*',
      target_match: /^blocked@evil\.com$/,
      target_in: ['spam@block.com'],
      condition: () => true,
      rateLimit: { maxCalls: 1, windowSeconds: 60 },
      priority: 90,
      tags: ['email'],
      reason: 'Blocked',
    });
    const labels = result.fields.map((f) => f.label);
    expect(labels).toEqual([
      'Effect',
      'Resource',
      'Match',
      'Target pattern',
      'Target list',
      'Condition',
      'Rate limit',
      'Priority',
      'Tags',
      'Reason',
    ]);
  });

  it('orders action-class fields: Effect → Action class → (optional fields)', () => {
    const result = formatRuleStructure({
      effect: 'forbid',
      action_class: 'filesystem.write',
      reason: 'Block writes',
    });
    const labels = result.fields.map((f) => f.label);
    expect(labels).toEqual(['Effect', 'Action class', 'Reason']);
  });

  it('orders intent-group fields: Effect → Intent group → (optional fields)', () => {
    const result = formatRuleStructure({
      effect: 'forbid',
      intent_group: 'data_exfiltration',
      priority: 90,
    });
    const labels = result.fields.map((f) => f.label);
    expect(labels).toEqual(['Effect', 'Intent group', 'Priority']);
  });

  // ── ARIA labels per field ──────────────────────────────────────────────────

  it('provides ariaLabel "Effect is permit" for permit rule', () => {
    const result = formatRuleStructure({ effect: 'permit', resource: 'tool' });
    const field = result.fields.find((f) => f.label === 'Effect');
    expect(field?.ariaLabel).toBe('Effect is permit');
  });

  it('provides ariaLabel "Effect is forbid" for forbid rule', () => {
    const result = formatRuleStructure({ effect: 'forbid', resource: 'file' });
    const field = result.fields.find((f) => f.label === 'Effect');
    expect(field?.ariaLabel).toBe('Effect is forbid');
  });

  it('provides ariaLabel "Resource is file" for file resource', () => {
    const result = formatRuleStructure({ effect: 'permit', resource: 'file' });
    const field = result.fields.find((f) => f.label === 'Resource');
    expect(field?.ariaLabel).toBe('Resource is file');
  });

  it('provides ariaLabel "Rate limit is 10 / 60s" for rate-limited rule', () => {
    const result = formatRuleStructure({
      effect: 'permit',
      resource: 'tool',
      rateLimit: { maxCalls: 10, windowSeconds: 60 },
    });
    const field = result.fields.find((f) => f.label === 'Rate limit');
    expect(field?.ariaLabel).toBe('Rate limit is 10 / 60s');
  });

  it('provides ariaLabel "Action class is filesystem.read" for action-class rule', () => {
    const result = formatRuleStructure({ effect: 'forbid', action_class: 'filesystem.read' });
    const field = result.fields.find((f) => f.label === 'Action class');
    expect(field?.ariaLabel).toBe('Action class is filesystem.read');
  });

  // ── ariaDescription ───────────────────────────────────────────────────────

  it('produces ariaDescription that contains the effect', () => {
    const result = formatRuleStructure({ effect: 'forbid', resource: 'file', match: '/etc/*' });
    expect(result.ariaDescription).toContain('forbid');
  });

  it('produces ariaDescription that contains the resource type', () => {
    const result = formatRuleStructure({ effect: 'forbid', resource: 'file' });
    expect(result.ariaDescription).toContain('file');
  });

  it('produces ariaDescription that contains the action class', () => {
    const result = formatRuleStructure({ effect: 'forbid', action_class: 'filesystem.read' });
    expect(result.ariaDescription).toContain('filesystem.read');
  });

  it('produces ariaDescription that contains the intent group', () => {
    const result = formatRuleStructure({ effect: 'forbid', intent_group: 'data_exfiltration' });
    expect(result.ariaDescription).toContain('data_exfiltration');
  });

  it('produces ariaDescription that contains the match pattern', () => {
    const result = formatRuleStructure({ effect: 'forbid', resource: 'file', match: '/etc/*' });
    expect(result.ariaDescription).toContain('/etc/*');
  });

  it('produces ariaDescription that mentions rate limiting', () => {
    const result = formatRuleStructure({
      effect: 'permit',
      resource: 'tool',
      rateLimit: { maxCalls: 5, windowSeconds: 30 },
    });
    expect(result.ariaDescription).toContain('rate limited');
  });

  it('produces ariaDescription that mentions custom condition', () => {
    const result = formatRuleStructure({
      effect: 'permit',
      resource: 'tool',
      condition: () => false,
    });
    expect(result.ariaDescription).toContain('custom condition');
  });

  it('produces ariaDescription for unconditional rule', () => {
    const result = formatRuleStructure({ effect: 'forbid' });
    expect(result.ariaDescription).toContain('forbid');
  });

  // ── Plain text output ─────────────────────────────────────────────────────

  it('produces "Label: value" formatted lines', () => {
    const result = formatRuleStructure({ effect: 'permit', resource: 'file', match: '/tmp/*' });
    expect(result.text).toContain(': permit');
    expect(result.text).toContain(': file');
    expect(result.text).toContain(': /tmp/*');
  });

  it('aligns all colon separators to the same column', () => {
    const result = formatRuleStructure({
      effect: 'permit',
      resource: 'file',
      match: '/tmp/*',
    });
    const lines = result.text.split('\n');
    const colonPositions = lines.map((l) => l.indexOf(':'));
    expect(new Set(colonPositions).size).toBe(1);
  });

  it('separates each field with a newline', () => {
    const result = formatRuleStructure({
      effect: 'forbid',
      resource: 'file',
      reason: 'No access',
    });
    const lines = result.text.split('\n');
    expect(lines.length).toBe(3);
  });

  // ── Minimal rule ──────────────────────────────────────────────────────────

  it('handles minimal rule with only effect', () => {
    const result = formatRuleStructure({ effect: 'forbid' });
    expect(result.ruleType).toBe('unconditional');
    expect(result.fields).toHaveLength(1);
    expect(result.fields[0]?.label).toBe('Effect');
    expect(result.text).toBe('Effect: forbid');
  });

  // ── Full output snapshots ─────────────────────────────────────────────────

  it('produces the expected text for a full resource rule', () => {
    const result = formatRuleStructure({
      effect: 'forbid',
      resource: 'file',
      match: '/etc/*',
      rateLimit: { maxCalls: 0, windowSeconds: 60 },
      priority: 100,
      tags: ['security'],
      reason: 'Protect system configuration',
    });

    expect(result.text).toBe(
      [
        'Effect    : forbid',
        'Resource  : file',
        'Match     : /etc/*',
        'Rate limit: 0 / 60s',
        'Priority  : 100',
        'Tags      : security',
        'Reason    : Protect system configuration',
      ].join('\n'),
    );
  });

  it('produces the expected text for an action-class rule', () => {
    const result = formatRuleStructure({
      effect: 'forbid',
      action_class: 'filesystem.write',
      reason: 'Block all writes',
    });

    expect(result.text).toBe(
      [
        'Effect      : forbid',
        'Action class: filesystem.write',
        'Reason      : Block all writes',
      ].join('\n'),
    );
  });

  it('produces the expected text for an intent-group rule with tags', () => {
    const result = formatRuleStructure({
      effect: 'forbid',
      intent_group: 'data_exfiltration',
      priority: 90,
      tags: ['security', 'audit'],
      reason: 'Prevent data leakage',
    });

    // "Intent group" (12 chars) is the widest label; all others are padded to 12.
    expect(result.text).toBe(
      [
        'Effect      : forbid',
        'Intent group: data_exfiltration',
        'Priority    : 90',
        'Tags        : security, audit',
        'Reason      : Prevent data leakage',
      ].join('\n'),
    );
  });

  it('produces the expected ariaDescription for a forbid-resource-match rule', () => {
    const result = formatRuleStructure({
      effect: 'forbid',
      resource: 'file',
      match: '/etc/*',
    });
    expect(result.ariaDescription).toBe('Rule forbids resource file matching /etc/*');
  });

  it('produces the expected ariaDescription for a rate-limited permit rule', () => {
    const result = formatRuleStructure({
      effect: 'permit',
      resource: 'tool',
      match: 'bash',
      rateLimit: { maxCalls: 10, windowSeconds: 60 },
    });
    expect(result.ariaDescription).toBe(
      'Rule permits resource tool matching bash, rate limited to 10 / 60s',
    );
  });
});
