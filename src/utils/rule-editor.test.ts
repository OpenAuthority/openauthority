/**
 * validateTargetPattern — test suite
 *
 * Covers the Target pattern regex field validation in the rule editor form.
 */
import { describe, it, expect } from 'vitest';
import { validateTargetPattern } from './rule-editor.js';

describe('validateTargetPattern', () => {
  // ── Empty input ────────────────────────────────────────────────────────────

  it('accepts empty string as valid (field is optional)', () => {
    const result = validateTargetPattern('');
    expect(result.valid).toBe(true);
    expect(result.status).toBe('empty');
    expect(result.error).toBeNull();
    expect(result.compiled).toBeNull();
  });

  // ── Valid regex patterns ───────────────────────────────────────────────────

  it('accepts a simple string literal pattern', () => {
    const result = validateTargetPattern('blocked@evil.com');
    expect(result.valid).toBe(true);
    expect(result.status).toBe('valid');
    expect(result.error).toBeNull();
    expect(result.compiled).toBeInstanceOf(RegExp);
  });

  it('accepts an anchored email address pattern', () => {
    const result = validateTargetPattern('^blocked@evil\\.com$');
    expect(result.valid).toBe(true);
    expect(result.status).toBe('valid');
    expect(result.compiled).toBeInstanceOf(RegExp);
    expect(result.compiled?.test('blocked@evil.com')).toBe(true);
    expect(result.compiled?.test('other@evil.com')).toBe(false);
  });

  it('accepts a domain-suffix pattern', () => {
    const result = validateTargetPattern('@acme\\.com$');
    expect(result.valid).toBe(true);
    expect(result.compiled?.test('cto@acme.com')).toBe(true);
    expect(result.compiled?.test('cto@other.com')).toBe(false);
  });

  it('accepts a wildcard dot-star pattern', () => {
    const result = validateTargetPattern('.*@example\\.com');
    expect(result.valid).toBe(true);
    expect(result.status).toBe('valid');
  });

  it('accepts a character class pattern', () => {
    const result = validateTargetPattern('[a-z]+@[a-z]+\\.com');
    expect(result.valid).toBe(true);
    expect(result.status).toBe('valid');
  });

  // ── Invalid regex patterns ─────────────────────────────────────────────────

  it('rejects an unclosed character class', () => {
    const result = validateTargetPattern('[unclosed');
    expect(result.valid).toBe(false);
    expect(result.status).toBe('invalid_regex');
    expect(result.error).toMatch(/invalid regex/i);
    expect(result.compiled).toBeNull();
  });

  it('rejects an unclosed capturing group', () => {
    const result = validateTargetPattern('(unclosed');
    expect(result.valid).toBe(false);
    expect(result.status).toBe('invalid_regex');
    expect(result.error).not.toBeNull();
  });

  it('rejects a lone quantifier with no operand', () => {
    const result = validateTargetPattern('*badpattern');
    expect(result.valid).toBe(false);
    expect(result.status).toBe('invalid_regex');
  });

  it('includes the engine error message in the result error string', () => {
    const result = validateTargetPattern('[bad');
    expect(result.error).toContain('Invalid regex:');
  });

  // ── Compiled RegExp correctness ────────────────────────────────────────────

  it('compiled RegExp from per-address pattern matches the target exactly when anchored', () => {
    const result = validateTargetPattern('^specific@target\\.com$');
    expect(result.compiled?.test('specific@target.com')).toBe(true);
    expect(result.compiled?.test('other@target.com')).toBe(false);
    expect(result.compiled?.test('prefix-specific@target.com')).toBe(false);
  });

  it('compiled RegExp can be used directly as a Rule target_match value', () => {
    const result = validateTargetPattern('^blocked@evil\\.com$');
    // Simulate using result.compiled as rule.target_match
    const target_match = result.compiled!;
    expect(target_match.test('blocked@evil.com')).toBe(true);
    expect(target_match.test('allowed@good.com')).toBe(false);
  });
});
