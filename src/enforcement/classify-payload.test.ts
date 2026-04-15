/**
 * Payload classifier — unit tests
 *
 * Tests the `classifyPayload` wrapper including custom regex patterns,
 * Luhn validation edge cases, IBAN regex matching, SSN format exclusions,
 * and false-positive checks on common numeric patterns.
 *
 *  TC-CP-01  Luhn-valid card numbers are detected (Visa, Mastercard, 2-series MC)
 *  TC-CP-02  Luhn-invalid card numbers produce no false positives
 *  TC-CP-03  19-digit card numbers are not matched (beyond current regex coverage)
 *  TC-CP-04  IBAN compact form with valid check digits is detected
 *  TC-CP-05  IBAN-like string with wrong check digits — still matched (regex-only, no mod-97)
 *  TC-CP-06  IBAN too short (BBAN < 11 chars) is not detected
 *  TC-CP-07  SSN in canonical XXX-XX-XXXX format is detected
 *  TC-CP-08  SSN without dashes is not detected (format mismatch)
 *  TC-CP-09  SSN with non-digit characters or wrong segment lengths is not detected
 *  TC-CP-10  Custom regex pattern matching text sets customMatched=true, hasPii=true
 *  TC-CP-11  Custom regex with no match leaves customMatched=false, hasPii=false
 *  TC-CP-12  Multiple custom patterns — any single match is sufficient
 *  TC-CP-13  hasPii=true when only custom pattern matches (no built-in PII)
 *  TC-CP-14  customMatched=false when no options or empty patterns provided
 *  TC-CP-15  No false positive on a 16-digit numeric order ID (Luhn-invalid)
 *  TC-CP-16  No false positive on ISO 8601 timestamps
 *  TC-CP-17  No false positive on Unix epoch timestamps
 *  TC-CP-18  No false positive on IPv4 addresses and typical log lines
 *  TC-CP-19  Empty string returns hasPii=false, customMatched=false
 */
import { describe, it, expect } from 'vitest';
import { classifyPayload } from './classify-payload.js';

// ─── TC-CP-01  Luhn-valid card numbers ────────────────────────────────────────

describe('TC-CP-01: Luhn-valid card numbers are detected', () => {
  it('detects Visa 4012888888881881 (16-digit, Luhn-valid)', () => {
    const result = classifyPayload('card: 4012888888881881');
    expect(result.hasPii).toBe(true);
    expect(result.categories).toContain('credit_card');
    expect(result.customMatched).toBe(false);
  });

  it('detects Mastercard 5105105105105100 (16-digit, Luhn-valid)', () => {
    const result = classifyPayload('payment: 5105105105105100');
    expect(result.hasPii).toBe(true);
    expect(result.categories).toContain('credit_card');
  });

  it('detects 2-series Mastercard 2221000000000009 (IIN 2221, Luhn-valid)', () => {
    // 2-series Mastercard range: IIN 2221–2720
    const result = classifyPayload('2221000000000009');
    expect(result.hasPii).toBe(true);
    expect(result.categories).toContain('credit_card');
  });

  it('detects Visa with space separators 4012 8888 8888 1881', () => {
    const result = classifyPayload('card on file: 4012 8888 8888 1881');
    expect(result.hasPii).toBe(true);
    expect(result.categories).toContain('credit_card');
  });
});

// ─── TC-CP-02  Luhn-invalid card numbers ──────────────────────────────────────

describe('TC-CP-02: Luhn-invalid card numbers produce no false positives', () => {
  it('does not detect 4111111111111112 (off-by-one from valid Visa — Luhn fails)', () => {
    // 4111111111111111 is Luhn-valid; incrementing the last digit breaks the checksum
    const result = classifyPayload('card: 4111111111111112');
    expect(result.categories).not.toContain('credit_card');
    expect(result.hasPii).toBe(false);
  });

  it('does not detect 5500005555555550 (off-by-one from valid Mastercard — Luhn fails)', () => {
    // 5500005555555559 is Luhn-valid; changing 9→0 breaks the checksum
    const result = classifyPayload('5500005555555550');
    expect(result.categories).not.toContain('credit_card');
  });

  it('does not detect 1234567890123456 (sequential digits — Luhn-invalid)', () => {
    const result = classifyPayload('order: 1234567890123456');
    expect(result.categories).not.toContain('credit_card');
    expect(result.hasPii).toBe(false);
  });
});

// ─── TC-CP-03  19-digit cards beyond regex coverage ───────────────────────────

describe('TC-CP-03: 19-digit card numbers are not matched by current regex', () => {
  it('does not detect a 19-digit sequence (CC_CANDIDATE_RE covers 13/15/16 digits only)', () => {
    // Some Visa Electron / Maestro cards are 19 digits, but the regex supports
    // 16-digit (4×4), 15-digit AmEx (4-6-5), and 13-digit forms only.
    const result = classifyPayload('4111111111111111000');
    expect(result.categories).not.toContain('credit_card');
  });
});

// ─── TC-CP-04 / TC-CP-05 / TC-CP-06  IBAN ────────────────────────────────────

describe('IBAN regex detection', () => {
  it('TC-CP-04: detects compact GB IBAN with valid MOD-97 check digits (GB29)', () => {
    const result = classifyPayload('account: GB29NWBK60161331926819');
    expect(result.hasPii).toBe(true);
    expect(result.categories).toContain('iban');
    expect(result.customMatched).toBe(false);
  });

  it('TC-CP-04b: detects compact DE IBAN with valid check digits (DE89)', () => {
    const result = classifyPayload('IBAN: DE89370400440532013000');
    expect(result.hasPii).toBe(true);
    expect(result.categories).toContain('iban');
  });

  it('TC-CP-05: detects IBAN-like string with wrong check digits — regex-only, no mod-97 validation', () => {
    // GB00 has semantically invalid check digits (00 is reserved by the IBAN spec),
    // but the regex matches the structural pattern regardless.
    // Callers requiring checksum validation must apply mod-97 separately.
    const result = classifyPayload('account: GB00NWBK60161331926819');
    expect(result.hasPii).toBe(true);
    expect(result.categories).toContain('iban');
  });

  it('TC-CP-06: does not detect a code where the BBAN segment is shorter than 11 chars', () => {
    // GB29 + NWBK = only 4 BBAN chars, below the 11-char minimum in the regex
    const result = classifyPayload('ref: GB29NWBK');
    expect(result.categories).not.toContain('iban');
  });
});

// ─── TC-CP-07 / TC-CP-08 / TC-CP-09  SSN ────────────────────────────────────

describe('SSN format detection and exclusion', () => {
  it('TC-CP-07: detects SSN in canonical XXX-XX-XXXX format', () => {
    const result = classifyPayload('ssn: 123-45-6789');
    expect(result.hasPii).toBe(true);
    expect(result.categories).toContain('ssn');
  });

  it('TC-CP-07b: detects SSN with word boundaries in mixed text', () => {
    const result = classifyPayload('Employee record — id: 987-65-4321 — dept: eng');
    expect(result.hasPii).toBe(true);
    expect(result.categories).toContain('ssn');
  });

  it('TC-CP-08: does not detect SSN-like digits without dashes (format mismatch)', () => {
    // 123456789 has no dashes and cannot match \b\d{3}-\d{2}-\d{4}\b
    const result = classifyPayload('id: 123456789');
    expect(result.categories).not.toContain('ssn');
    expect(result.hasPii).toBe(false);
  });

  it('TC-CP-09: does not detect non-digit characters in SSN segment positions', () => {
    // abc-de-fghi looks like the SSN format but contains non-digits
    const result = classifyPayload('ref: abc-de-fghi');
    expect(result.categories).not.toContain('ssn');
  });

  it('TC-CP-09b: does not detect XXX-XX without the four-digit serial suffix', () => {
    // 123-45-678 is only 3 digits in the last segment — does not match XXXX
    const result = classifyPayload('partial: 123-45-678');
    expect(result.categories).not.toContain('ssn');
  });

  it('TC-CP-09c: does not detect an SSN-like sequence without word boundaries', () => {
    // Embedded in alphanumeric context — word boundary prevents a match
    const result = classifyPayload('code1234567890end');
    expect(result.categories).not.toContain('ssn');
  });
});

// ─── TC-CP-10 through TC-CP-14  Custom regex patterns ────────────────────────

describe('custom regex patterns', () => {
  it('TC-CP-10: custom pattern matching text sets customMatched=true and hasPii=true', () => {
    const internalCode = /\bPROJECT-[A-Z]{3}-\d{4}\b/;
    const result = classifyPayload('ref: PROJECT-SEC-0042', { customPatterns: [internalCode] });
    expect(result.customMatched).toBe(true);
    expect(result.hasPii).toBe(true);
    // Built-in detectors found nothing — categories is empty
    expect(result.categories).toHaveLength(0);
  });

  it('TC-CP-11: custom regex with no match leaves customMatched=false and hasPii=false', () => {
    const internalCode = /\bPROJECT-[A-Z]{3}-\d{4}\b/;
    const result = classifyPayload('hello world', { customPatterns: [internalCode] });
    expect(result.customMatched).toBe(false);
    expect(result.hasPii).toBe(false);
  });

  it('TC-CP-12: multiple custom patterns — any single match is sufficient', () => {
    const patterns = [/PATTERN_ONE/, /PATTERN_TWO/];
    const result = classifyPayload('text with PATTERN_TWO inside', { customPatterns: patterns });
    expect(result.customMatched).toBe(true);
    expect(result.hasPii).toBe(true);
  });

  it('TC-CP-12b: multiple custom patterns with no matches — customMatched remains false', () => {
    const patterns = [/PATTERN_ONE/, /PATTERN_TWO/];
    const result = classifyPayload('unrelated text', { customPatterns: patterns });
    expect(result.customMatched).toBe(false);
    expect(result.hasPii).toBe(false);
  });

  it('TC-CP-13: hasPii=true when only custom pattern matches (no built-in PII present)', () => {
    const secret = /TOP_SECRET/;
    const result = classifyPayload('document: TOP_SECRET classification', { customPatterns: [secret] });
    expect(result.hasPii).toBe(true);
    expect(result.customMatched).toBe(true);
    expect(result.categories).toHaveLength(0);
  });

  it('TC-CP-13b: hasPii=true and customMatched=true when both built-in PII and custom pattern match', () => {
    const secret = /TOP_SECRET/;
    const result = classifyPayload('TOP_SECRET card: 4111111111111111', { customPatterns: [secret] });
    expect(result.hasPii).toBe(true);
    expect(result.customMatched).toBe(true);
    expect(result.categories).toContain('credit_card');
  });

  it('TC-CP-14: customMatched=false when no options are passed', () => {
    const result = classifyPayload('clean text with no PII');
    expect(result.customMatched).toBe(false);
    expect(result.hasPii).toBe(false);
  });

  it('TC-CP-14b: customMatched=false when customPatterns array is empty', () => {
    const result = classifyPayload('clean text', { customPatterns: [] });
    expect(result.customMatched).toBe(false);
    expect(result.hasPii).toBe(false);
  });
});

// ─── TC-CP-15 through TC-CP-18  No false positives ───────────────────────────

describe('no false positives on common numeric patterns', () => {
  it('TC-CP-15: numeric order ID (16 digits, Luhn-invalid) does not trigger credit_card', () => {
    // 1234567890123456 fails Luhn (sum mod 10 = 4)
    const result = classifyPayload('Order #1234567890123456 confirmed');
    expect(result.categories).not.toContain('credit_card');
    expect(result.hasPii).toBe(false);
  });

  it('TC-CP-16: ISO 8601 timestamp does not trigger any detector', () => {
    const result = classifyPayload('created_at: 2024-01-15T10:30:00Z');
    expect(result.hasPii).toBe(false);
    expect(result.categories).toHaveLength(0);
  });

  it('TC-CP-17: Unix epoch timestamp (10 digits) does not trigger any detector', () => {
    const result = classifyPayload('timestamp: 1704067200');
    expect(result.hasPii).toBe(false);
  });

  it('TC-CP-18: IPv4 address does not trigger any detector', () => {
    const result = classifyPayload('host: 192.168.100.200');
    expect(result.hasPii).toBe(false);
  });

  it('TC-CP-18b: typical structured log line with numeric IDs does not trigger any detector', () => {
    const log = '[2024-01-15T10:30:00Z] user_id=8472 session=1234567 req_id=998877665544';
    const result = classifyPayload(log);
    expect(result.hasPii).toBe(false);
    expect(result.categories).toHaveLength(0);
  });

  it('TC-CP-18c: plain prose about an order with dollar amount does not trigger any detector', () => {
    const result = classifyPayload('Order #12345 shipped on 2024-01-15 for $99.00');
    expect(result.hasPii).toBe(false);
  });
});

// ─── TC-CP-19  Empty string ───────────────────────────────────────────────────

describe('TC-CP-19: empty string', () => {
  it('returns hasPii=false and customMatched=false with no options', () => {
    const result = classifyPayload('');
    expect(result.hasPii).toBe(false);
    expect(result.customMatched).toBe(false);
    expect(result.categories).toHaveLength(0);
  });

  it('returns hasPii=false and customMatched=false even when custom patterns are provided', () => {
    const result = classifyPayload('', { customPatterns: [/MATCH/] });
    expect(result.hasPii).toBe(false);
    expect(result.customMatched).toBe(false);
  });
});
