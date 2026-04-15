/**
 * Payload classifier.
 *
 * Wraps `detectSensitiveData` with optional caller-supplied custom regex
 * patterns, enabling policy-driven sensitivity rules beyond the built-in PII
 * categories (SSN, credit card, IBAN, private key, credential).
 */
import { detectSensitiveData } from './pii-classifier.js';
import type { PiiDetectionResult } from './pii-classifier.js';

export type { PiiCategory, PiiDetectionResult } from './pii-classifier.js';

/** Options for `classifyPayload`. */
export interface ClassifyPayloadOptions {
  /**
   * Additional regex patterns to test against the payload text.
   * Any match sets `customMatched: true` and contributes to `hasPii: true`.
   * Patterns are tested in order; the first match short-circuits.
   */
  customPatterns?: ReadonlyArray<RegExp>;
}

/** Result of `classifyPayload`. */
export interface PayloadClassification extends PiiDetectionResult {
  /** True when at least one caller-supplied custom regex matched. */
  customMatched: boolean;
}

/**
 * Classifies a payload text for sensitive data.
 *
 * Applies the full suite of built-in PII detectors (SSN, credit card, IBAN,
 * private key, credential) and optionally tests against caller-supplied custom
 * regex patterns.
 *
 * `hasPii` is `true` when either a built-in detector or a custom pattern
 * matched. `customMatched` is `true` only when a custom pattern matched.
 *
 * @param text   Plain-text string to classify.
 * @param opts   Optional configuration (custom regex patterns).
 * @returns      Classification result.
 */
export function classifyPayload(
  text: string,
  opts?: ClassifyPayloadOptions,
): PayloadClassification {
  const pii = detectSensitiveData(text);

  let customMatched = false;
  if (opts?.customPatterns) {
    customMatched = opts.customPatterns.some((re) => re.test(text));
  }

  return {
    hasPii: pii.hasPii || customMatched,
    categories: pii.categories,
    customMatched,
  };
}
