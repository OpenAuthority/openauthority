import { describe, it } from 'vitest';
import { exportBuiltinRules, writeBuiltinRulesJson } from './exporter.js';
import type { ExportedRule, BuiltinRulesManifest } from './exporter.js';

describe('exportBuiltinRules', () => {
  it.todo('returns a BuiltinRulesManifest with schemaVersion "1.0.0"');
  it.todo('ruleCount equals the length of the rules array');
  it.todo('generatedAt is a valid ISO 8601 timestamp');
  it.todo('includes all default and support rules (non-empty rules array)');
  it.todo('serializes RegExp match patterns as their source string with matchIsRegExp: true');
  it.todo('serializes plain string match patterns with matchIsRegExp: false');
  it.todo('marks rules with condition functions as hasCondition: true');
  it.todo('marks rules without condition functions as hasCondition: false');
  it.todo('preserves reason field when present on a rule');
  it.todo('preserves tags field when present on a rule');
  it.todo('preserves rateLimit field when present on a rule');
  it.todo('preserves action_class field when present on a rule');
  it.todo('omits optional fields entirely when they are absent from the rule');
});

describe('writeBuiltinRulesJson', () => {
  it.todo('writes pretty-printed JSON to the specified output path');
  it.todo('written JSON parses back to a valid BuiltinRulesManifest');
  it.todo('creates the output file if it does not exist');
  it.todo('overwrites an existing file at the output path');
});

void exportBuiltinRules;
void writeBuiltinRulesJson;
void ({} as ExportedRule);
void ({} as BuiltinRulesManifest);
