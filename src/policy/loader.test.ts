import { describe, it } from 'vitest';
import { loadPolicyFile, PolicyLoadError } from './loader.js';
import type { LoadedPolicyBundle, LoadedRule } from './loader.js';

describe('loadPolicyFile', () => {
  it.todo('loads a valid JSON policy bundle and returns a typed LoadedPolicyBundle');
  it.todo('returns bundle with version and rules when both are present');
  it.todo('accepts a bundle with no rules field (rules is optional)');
  it.todo('accepts a bundle with an optional checksum field');
  it.todo('throws PolicyLoadError when the file does not exist');
  it.todo('throws PolicyLoadError when the file contains invalid JSON');
  it.todo('throws PolicyLoadError when bundle fails schema validation (missing version)');
  it.todo('throws PolicyLoadError when a rule carries an invalid effect value');
  it.todo('throws PolicyLoadError when a rule has an empty resource string');
  it.todo('includes the file path and validation errors in the PolicyLoadError message');
});

void loadPolicyFile;
void PolicyLoadError;
void ({} as LoadedPolicyBundle);
void ({} as LoadedRule);
