import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { HitlPolicyConfigSchema, type HitlPolicyConfig } from './types.js';

/** Thrown when a policy file cannot be read or parsed (syntax / IO error). */
export class HitlPolicyParseError extends Error {
  constructor(
    public readonly filePath: string,
    public override readonly cause: unknown,
  ) {
    super(`Failed to parse HITL policy file: ${filePath}`);
    this.name = 'HitlPolicyParseError';
  }
}

/** Thrown when a parsed policy file does not conform to the expected schema. */
export class HitlPolicyValidationError extends Error {
  constructor(
    public readonly filePath: string,
    public readonly errors: string[],
  ) {
    super(
      `Invalid HITL policy configuration in: ${filePath}\n${errors.join('\n')}`,
    );
    this.name = 'HitlPolicyValidationError';
  }
}

/**
 * Deserialises `content` using the appropriate parser based on the file extension.
 * `.yaml` / `.yml` → YAML (via the `yaml` package).
 * Any other extension → JSON.
 */
async function deserialise(filePath: string, content: string): Promise<unknown> {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.yaml' || ext === '.yml') {
    const { parse } = await import('yaml');
    return parse(content) as unknown;
  }
  return JSON.parse(content) as unknown;
}

/**
 * Validates a raw (unknown) value against the `HitlPolicyConfig` schema using
 * TypeBox's `Value.Check`.
 *
 * @throws {HitlPolicyValidationError} when validation fails.
 */
export function validateHitlPolicyConfig(
  filePath: string,
  raw: unknown,
): HitlPolicyConfig {
  if (!Value.Check(HitlPolicyConfigSchema, raw)) {
    const errors = [...Value.Errors(HitlPolicyConfigSchema, raw)].map(
      (e) => `  ${e.path}: ${e.message}`,
    );
    throw new HitlPolicyValidationError(filePath, errors);
  }
  return raw;
}

/**
 * Reads, parses, and validates a HITL policy file from disk.
 *
 * Supported formats:
 * - `.yaml` / `.yml` — YAML
 * - `.json` (or any other extension) — JSON
 *
 * @throws {HitlPolicyParseError} on IO or syntax errors.
 * @throws {HitlPolicyValidationError} when the file does not match the schema.
 */
export async function parseHitlPolicyFile(
  filePath: string,
): Promise<HitlPolicyConfig> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (err) {
    throw new HitlPolicyParseError(filePath, err);
  }

  let raw: unknown;
  try {
    raw = await deserialise(filePath, content);
  } catch (err) {
    throw new HitlPolicyParseError(filePath, err);
  }

  return validateHitlPolicyConfig(filePath, raw);
}
