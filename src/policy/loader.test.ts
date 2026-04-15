import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPolicyFile, PolicyLoadError } from './loader.js';
import type { LoadedPolicyBundle, LoadedRule } from './loader.js';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

const mockReadFile = vi.mocked(readFile);

describe('loadPolicyFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads a valid JSON policy bundle and returns a typed LoadedPolicyBundle', async () => {
    const bundle = { version: 1, rules: [] };
    mockReadFile.mockResolvedValue(JSON.stringify(bundle) as any);
    const result = await loadPolicyFile('/policy.json');
    expect(result.version).toBe(1);
    expect(result.rules).toEqual([]);
  });

  it('returns bundle with version and rules when both are present', async () => {
    const rule: LoadedRule = { effect: 'permit', resource: 'tool', match: 'read_file' };
    const bundle = { version: 2, rules: [rule] };
    mockReadFile.mockResolvedValue(JSON.stringify(bundle) as any);
    const result = await loadPolicyFile('/policy.json');
    expect(result.version).toBe(2);
    expect(result.rules).toHaveLength(1);
    expect(result.rules![0]).toEqual(rule);
  });

  it('accepts a bundle with no rules field (rules is optional)', async () => {
    const bundle = { version: 1 };
    mockReadFile.mockResolvedValue(JSON.stringify(bundle) as any);
    const result = await loadPolicyFile('/policy.json');
    expect(result.version).toBe(1);
    expect(result.rules).toBeUndefined();
  });

  it('accepts a bundle with an optional checksum field', async () => {
    const bundle = { version: 1, checksum: 'sha256:abc123', rules: [] };
    mockReadFile.mockResolvedValue(JSON.stringify(bundle) as any);
    const result = await loadPolicyFile('/policy.json');
    expect(result.checksum).toBe('sha256:abc123');
  });

  it('throws PolicyLoadError when the file does not exist', async () => {
    const fsError = Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
    mockReadFile.mockRejectedValue(fsError);
    await expect(loadPolicyFile('/nonexistent.json')).rejects.toBeInstanceOf(PolicyLoadError);
  });

  it('throws PolicyLoadError when the file contains invalid JSON', async () => {
    mockReadFile.mockResolvedValue('{ this is not : valid json }' as any);
    await expect(loadPolicyFile('/bad.json')).rejects.toBeInstanceOf(PolicyLoadError);
  });

  it('throws PolicyLoadError when bundle fails schema validation (missing version)', async () => {
    const bundle = { rules: [] }; // version field is required
    mockReadFile.mockResolvedValue(JSON.stringify(bundle) as any);
    await expect(loadPolicyFile('/policy.json')).rejects.toBeInstanceOf(PolicyLoadError);
  });

  it('throws PolicyLoadError when a rule carries an invalid effect value', async () => {
    const bundle = { version: 1, rules: [{ effect: 'allow', resource: 'tool', match: '*' }] };
    mockReadFile.mockResolvedValue(JSON.stringify(bundle) as any);
    await expect(loadPolicyFile('/policy.json')).rejects.toBeInstanceOf(PolicyLoadError);
  });

  it('accepts a rule with an intent_group field', async () => {
    const rule: LoadedRule = { effect: 'forbid', resource: 'tool', match: '*', intent_group: 'data_exfiltration' };
    const bundle = { version: 1, rules: [rule] };
    mockReadFile.mockResolvedValue(JSON.stringify(bundle) as any);
    const result = await loadPolicyFile('/policy.json');
    expect(result.rules![0].intent_group).toBe('data_exfiltration');
  });

  it('throws PolicyLoadError when a rule has an empty resource string', async () => {
    const bundle = { version: 1, rules: [{ effect: 'permit', resource: '', match: '*' }] };
    mockReadFile.mockResolvedValue(JSON.stringify(bundle) as any);
    await expect(loadPolicyFile('/policy.json')).rejects.toBeInstanceOf(PolicyLoadError);
  });

  it('includes the file path and validation errors in the PolicyLoadError message', async () => {
    const bundle = { rules: [] }; // missing version — triggers validation error
    mockReadFile.mockResolvedValue(JSON.stringify(bundle) as any);
    let caught: unknown;
    try {
      await loadPolicyFile('/my-policy.json');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PolicyLoadError);
    expect((caught as PolicyLoadError).message).toContain('/my-policy.json');
  });

  // TC-TM-01: valid target_match regex loads successfully
  it('TC-TM-01: accepts a rule with a valid target_match regex pattern', async () => {
    const rule: LoadedRule = {
      effect: 'forbid',
      resource: 'channel',
      match: '*',
      target_match: '^blocked@example\\.com$',
    };
    const bundle = { version: 1, rules: [rule] };
    mockReadFile.mockResolvedValue(JSON.stringify(bundle) as any);
    const result = await loadPolicyFile('/policy.json');
    expect(result.rules![0].target_match).toBe('^blocked@example\\.com$');
  });

  // TC-TM-02: invalid target_match regex throws PolicyLoadError with clear message
  it('TC-TM-02: throws PolicyLoadError when a rule has an invalid target_match regex', async () => {
    const bundle = {
      version: 1,
      rules: [{ effect: 'forbid', resource: 'channel', match: '*', target_match: '[invalid(regex' }],
    };
    mockReadFile.mockResolvedValue(JSON.stringify(bundle) as any);
    let caught: unknown;
    try {
      await loadPolicyFile('/policy.json');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PolicyLoadError);
    expect((caught as PolicyLoadError).message).toContain('target_match');
    expect((caught as PolicyLoadError).message).toContain('[invalid(regex');
  });

  // TC-TM-03: valid target_in array loads successfully
  it('TC-TM-03: accepts a rule with a valid target_in string array', async () => {
    const rule: LoadedRule = {
      effect: 'forbid',
      resource: 'channel',
      match: '*',
      target_in: ['noreply@spam.example.com', 'abuse@badactor.net'],
    };
    const bundle = { version: 1, rules: [rule] };
    mockReadFile.mockResolvedValue(JSON.stringify(bundle) as any);
    const result = await loadPolicyFile('/policy.json');
    expect(result.rules![0].target_in).toEqual(['noreply@spam.example.com', 'abuse@badactor.net']);
  });
});

void loadPolicyFile;
void PolicyLoadError;
void ({} as LoadedPolicyBundle);
void ({} as LoadedRule);
