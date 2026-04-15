/**
 * Rule editor form validation utilities.
 *
 * Provides validation functions for rule editor form fields, including the
 * Target pattern field (`target_match`). These are pure functions suitable for
 * real-time input validation in a rule editor UI.
 *
 * Companion to `confirm-input-validator.ts` — follows the same result-object
 * pattern so callers handle validation state uniformly across form fields.
 */

// ─── Target pattern field ─────────────────────────────────────────────────────

/**
 * Validation status of the Target pattern field.
 *
 * - `'empty'`         — No input yet; field is optional, no error shown.
 * - `'invalid_regex'` — Input is non-empty but cannot be compiled as a RegExp.
 * - `'valid'`         — Input is a valid regex (or empty); may proceed.
 */
export type TargetPatternStatus = 'empty' | 'invalid_regex' | 'valid';

/**
 * Result returned by {@link validateTargetPattern} for each input change.
 */
export interface TargetPatternResult {
  /**
   * Whether the current input is acceptable.
   * `true` when the field is empty (optional) or contains a valid regex.
   * The form submit button should be disabled when this is `false`.
   */
  valid: boolean;
  /** Classification of the current input state. */
  status: TargetPatternStatus;
  /**
   * Human-readable error message to display beneath the field.
   * `null` when `status` is `'empty'` or `'valid'` — no error to show.
   */
  error: string | null;
  /**
   * Compiled `RegExp` when `status` is `'valid'` and the field is non-empty.
   * `null` when the field is empty or the pattern is invalid.
   * Callers can use this directly as the `target_match` value on a `Rule`.
   */
  compiled: RegExp | null;
}

// ─── Validator ────────────────────────────────────────────────────────────────

/**
 * Validates the Target pattern regex field in the rule editor form.
 *
 * The Target pattern field is optional — an empty value is accepted without
 * error. When non-empty, the value must be a valid ECMAScript regular
 * expression. Invalid regex patterns (e.g. unclosed character classes) are
 * rejected with a descriptive error message.
 *
 * Call this on every input change event to provide real-time feedback.
 *
 * @param rawPattern The current string value in the Target pattern input field.
 * @returns A {@link TargetPatternResult} describing validity and any error.
 *
 * @example
 * // In an input change handler:
 * const result = validateTargetPattern(inputValue);
 * setSubmitEnabled(result.valid);
 * setFieldError(result.error);
 * // When submitting, use result.compiled as the rule's target_match value.
 */
export function validateTargetPattern(rawPattern: string): TargetPatternResult {
  // ── Empty: field is optional, no error ────────────────────────────────────
  if (rawPattern === '') {
    return { valid: true, status: 'empty', error: null, compiled: null };
  }

  // ── Non-empty: attempt to compile as RegExp ────────────────────────────────
  try {
    const compiled = new RegExp(rawPattern);
    return { valid: true, status: 'valid', error: null, compiled };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Invalid regular expression';
    return {
      valid: false,
      status: 'invalid_regex',
      error: `Invalid regex: ${message}`,
      compiled: null,
    };
  }
}
