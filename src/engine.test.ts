/**
 * Phase 1 unit tests — engine.ts, rules.ts, audit.ts
 *
 * Covers:
 *   - evaluateRule / sortRulesByPriority  (rules.ts)
 *   - PolicyEngine ABAC engine            (engine.ts)
 *   - AuditLogger / consoleAuditHandler / JsonlAuditLogger  (audit.ts)
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

import { evaluateRule, sortRulesByPriority } from './rules.js';
import { PolicyEngine } from './engine.js';
import {
  AuditLogger,
  consoleAuditHandler,
  JsonlAuditLogger,
  type AuditEntry,
  type AuditHandler,
} from './audit.js';
import type {
  TPolicyRule,
  TPolicy,
  TEvaluationContext,
  TEvaluationResult,
} from './types.js';

// ─── Factory helpers ───────────────────────────────────────────────────────────

function makeContext(overrides: Partial<TEvaluationContext> = {}): TEvaluationContext {
  return {
    subject: { role: 'user', id: 'u1' },
    resource: { type: 'file', path: '/home/u1/doc.txt' },
    action: 'read',
    environment: {},
    ...overrides,
  };
}

function makeRule(overrides: Partial<TPolicyRule> = {}): TPolicyRule {
  return {
    id: 'r1',
    name: 'test-rule',
    effect: 'allow',
    conditions: [],
    priority: 0,
    ...overrides,
  };
}

function makePolicy(overrides: Partial<TPolicy> = {}): TPolicy {
  return {
    id: 'p1',
    name: 'test-policy',
    version: '1.0.0',
    rules: [],
    defaultEffect: 'deny',
    ...overrides,
  };
}

// ─── rules.ts ─────────────────────────────────────────────────────────────────

describe('evaluateRule', () => {
  it('returns true when there are no conditions', () => {
    const rule = makeRule({ conditions: [] });
    expect(evaluateRule(rule, makeContext())).toBe(true);
  });

  it('eq — matches equal scalar value', () => {
    const rule = makeRule({
      conditions: [{ field: 'action', operator: 'eq', value: 'read' }],
    });
    expect(evaluateRule(rule, makeContext({ action: 'read' }))).toBe(true);
    expect(evaluateRule(rule, makeContext({ action: 'write' }))).toBe(false);
  });

  it('neq — matches when value differs', () => {
    const rule = makeRule({
      conditions: [{ field: 'action', operator: 'neq', value: 'delete' }],
    });
    expect(evaluateRule(rule, makeContext({ action: 'read' }))).toBe(true);
    expect(evaluateRule(rule, makeContext({ action: 'delete' }))).toBe(false);
  });

  it('in — matches when field value is in the array', () => {
    const rule = makeRule({
      conditions: [{ field: 'action', operator: 'in', value: ['read', 'list'] }],
    });
    expect(evaluateRule(rule, makeContext({ action: 'read' }))).toBe(true);
    expect(evaluateRule(rule, makeContext({ action: 'delete' }))).toBe(false);
  });

  it('in — returns false when value is not an array', () => {
    const rule = makeRule({
      conditions: [{ field: 'action', operator: 'in', value: 'read' }],
    });
    expect(evaluateRule(rule, makeContext({ action: 'read' }))).toBe(false);
  });

  it('nin — matches when field value is NOT in the array', () => {
    const rule = makeRule({
      conditions: [{ field: 'action', operator: 'nin', value: ['delete', 'drop'] }],
    });
    expect(evaluateRule(rule, makeContext({ action: 'read' }))).toBe(true);
    expect(evaluateRule(rule, makeContext({ action: 'delete' }))).toBe(false);
  });

  it('contains — matches substring', () => {
    const rule = makeRule({
      conditions: [{ field: 'action', operator: 'contains', value: 'rea' }],
    });
    expect(evaluateRule(rule, makeContext({ action: 'read' }))).toBe(true);
    expect(evaluateRule(rule, makeContext({ action: 'write' }))).toBe(false);
  });

  it('contains — returns false for non-string field', () => {
    const rule = makeRule({
      conditions: [{ field: 'subject.id', operator: 'contains', value: 'u' }],
    });
    // subject.id is 'u1' (string) — should match
    expect(evaluateRule(rule, makeContext())).toBe(true);
    // non-string field value
    const ctx = makeContext({ subject: { id: 123 } });
    expect(evaluateRule(rule, ctx)).toBe(false);
  });

  it('startsWith — matches prefix', () => {
    const rule = makeRule({
      conditions: [{ field: 'action', operator: 'startsWith', value: 're' }],
    });
    expect(evaluateRule(rule, makeContext({ action: 'read' }))).toBe(true);
    expect(evaluateRule(rule, makeContext({ action: 'write' }))).toBe(false);
  });

  it('regex — matches pattern', () => {
    const rule = makeRule({
      conditions: [{ field: 'action', operator: 'regex', value: '^re(ad|set)$' }],
    });
    expect(evaluateRule(rule, makeContext({ action: 'read' }))).toBe(true);
    expect(evaluateRule(rule, makeContext({ action: 'reset' }))).toBe(true);
    expect(evaluateRule(rule, makeContext({ action: 'write' }))).toBe(false);
  });

  it('unknown operator — returns false', () => {
    const rule = makeRule({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      conditions: [{ field: 'action', operator: 'unknown' as any, value: 'read' }],
    });
    expect(evaluateRule(rule, makeContext())).toBe(false);
  });

  it('nested field access via dot notation', () => {
    const rule = makeRule({
      conditions: [{ field: 'subject.role', operator: 'eq', value: 'admin' }],
    });
    expect(evaluateRule(rule, makeContext({ subject: { role: 'admin' } }))).toBe(true);
    expect(evaluateRule(rule, makeContext({ subject: { role: 'user' } }))).toBe(false);
  });

  it('missing field returns undefined — eq comparison fails', () => {
    const rule = makeRule({
      conditions: [{ field: 'subject.missing', operator: 'eq', value: 'x' }],
    });
    expect(evaluateRule(rule, makeContext())).toBe(false);
  });

  it('environment field access', () => {
    const rule = makeRule({
      conditions: [{ field: 'environment.region', operator: 'eq', value: 'eu' }],
    });
    expect(evaluateRule(rule, makeContext({ environment: { region: 'eu' } }))).toBe(true);
    expect(evaluateRule(rule, makeContext({ environment: { region: 'us' } }))).toBe(false);
  });

  it('all conditions must match (AND semantics)', () => {
    const rule = makeRule({
      conditions: [
        { field: 'action', operator: 'eq', value: 'read' },
        { field: 'subject.role', operator: 'eq', value: 'admin' },
      ],
    });
    expect(
      evaluateRule(rule, makeContext({ action: 'read', subject: { role: 'admin' } }))
    ).toBe(true);
    expect(
      evaluateRule(rule, makeContext({ action: 'read', subject: { role: 'user' } }))
    ).toBe(false);
    expect(
      evaluateRule(rule, makeContext({ action: 'write', subject: { role: 'admin' } }))
    ).toBe(false);
  });
});

describe('sortRulesByPriority', () => {
  it('sorts rules in descending priority order', () => {
    const rules = [
      makeRule({ id: 'r1', priority: 10 }),
      makeRule({ id: 'r2', priority: 30 }),
      makeRule({ id: 'r3', priority: 20 }),
    ];
    const sorted = sortRulesByPriority(rules);
    expect(sorted.map((r) => r.id)).toEqual(['r2', 'r3', 'r1']);
  });

  it('treats undefined priority as 0', () => {
    const rules = [
      makeRule({ id: 'r1', priority: undefined }),
      makeRule({ id: 'r2', priority: 5 }),
    ];
    const sorted = sortRulesByPriority(rules);
    expect(sorted[0].id).toBe('r2');
    expect(sorted[1].id).toBe('r1');
  });

  it('does not mutate the original array', () => {
    const rules = [
      makeRule({ id: 'r1', priority: 1 }),
      makeRule({ id: 'r2', priority: 2 }),
    ];
    const originalOrder = rules.map((r) => r.id);
    sortRulesByPriority(rules);
    expect(rules.map((r) => r.id)).toEqual(originalOrder);
  });

  it('handles empty array', () => {
    expect(sortRulesByPriority([])).toEqual([]);
  });
});

// ─── engine.ts ────────────────────────────────────────────────────────────────

describe('PolicyEngine', () => {
  describe('policy management', () => {
    it('addPolicy / getPolicy roundtrip', () => {
      const engine = new PolicyEngine();
      const policy = makePolicy();
      engine.addPolicy(policy);
      expect(engine.getPolicy('p1')).toEqual(policy);
    });

    it('addPolicy replaces existing policy with same id', () => {
      const engine = new PolicyEngine();
      engine.addPolicy(makePolicy({ name: 'original' }));
      engine.addPolicy(makePolicy({ name: 'replacement' }));
      expect(engine.getPolicy('p1')?.name).toBe('replacement');
    });

    it('removePolicy returns true when policy exists and is removed', () => {
      const engine = new PolicyEngine();
      engine.addPolicy(makePolicy());
      expect(engine.removePolicy('p1')).toBe(true);
      expect(engine.getPolicy('p1')).toBeUndefined();
    });

    it('removePolicy returns false when policy does not exist', () => {
      const engine = new PolicyEngine();
      expect(engine.removePolicy('nonexistent')).toBe(false);
    });

    it('listPolicies returns all added policies', () => {
      const engine = new PolicyEngine();
      engine.addPolicy(makePolicy({ id: 'p1' }));
      engine.addPolicy(makePolicy({ id: 'p2' }));
      const list = engine.listPolicies();
      expect(list).toHaveLength(2);
      expect(list.map((p) => p.id).sort()).toEqual(['p1', 'p2']);
    });

    it('listPolicies returns empty array when no policies', () => {
      const engine = new PolicyEngine();
      expect(engine.listPolicies()).toEqual([]);
    });
  });

  describe('evaluate', () => {
    it('throws when policy is not found', async () => {
      const engine = new PolicyEngine();
      await expect(engine.evaluate('missing', makeContext())).rejects.toThrow(
        'Policy not found: missing',
      );
    });

    it('returns allow when matching rule has effect allow', async () => {
      const engine = new PolicyEngine();
      engine.addPolicy(
        makePolicy({
          rules: [
            makeRule({
              effect: 'allow',
              conditions: [{ field: 'action', operator: 'eq', value: 'read' }],
            }),
          ],
          defaultEffect: 'deny',
        }),
      );
      const result = await engine.evaluate('p1', makeContext({ action: 'read' }));
      expect(result.allowed).toBe(true);
      expect(result.effect).toBe('allow');
      expect(result.matchedRuleId).toBe('r1');
    });

    it('returns deny when matching rule has effect deny', async () => {
      const engine = new PolicyEngine();
      engine.addPolicy(
        makePolicy({
          rules: [
            makeRule({
              effect: 'deny',
              conditions: [{ field: 'action', operator: 'eq', value: 'delete' }],
            }),
          ],
          defaultEffect: 'allow',
        }),
      );
      const result = await engine.evaluate('p1', makeContext({ action: 'delete' }));
      expect(result.allowed).toBe(false);
      expect(result.effect).toBe('deny');
    });

    it('falls through to default allow when no rules match', async () => {
      const engine = new PolicyEngine();
      engine.addPolicy(makePolicy({ rules: [], defaultEffect: 'allow' }));
      const result = await engine.evaluate('p1', makeContext());
      expect(result.allowed).toBe(true);
      expect(result.effect).toBe('allow');
      expect(result.reason).toMatch(/default effect/i);
    });

    it('falls through to default deny when no rules match', async () => {
      const engine = new PolicyEngine();
      engine.addPolicy(makePolicy({ rules: [], defaultEffect: 'deny' }));
      const result = await engine.evaluate('p1', makeContext());
      expect(result.allowed).toBe(false);
      expect(result.effect).toBe('deny');
    });

    it('evaluates highest-priority rule first', async () => {
      const engine = new PolicyEngine();
      engine.addPolicy(
        makePolicy({
          rules: [
            makeRule({
              id: 'low',
              effect: 'deny',
              conditions: [],
              priority: 1,
            }),
            makeRule({
              id: 'high',
              effect: 'allow',
              conditions: [],
              priority: 10,
            }),
          ],
          defaultEffect: 'deny',
        }),
      );
      const result = await engine.evaluate('p1', makeContext());
      expect(result.allowed).toBe(true);
      expect(result.matchedRuleId).toBe('high');
    });

    it('includes rule description as reason when rule matches', async () => {
      const engine = new PolicyEngine();
      engine.addPolicy(
        makePolicy({
          rules: [
            makeRule({
              effect: 'allow',
              conditions: [],
              description: 'allow all reads',
            }),
          ],
          defaultEffect: 'deny',
        }),
      );
      const result = await engine.evaluate('p1', makeContext());
      expect(result.reason).toBe('allow all reads');
    });

    it('does not include reason when rule has no description', async () => {
      const engine = new PolicyEngine();
      engine.addPolicy(
        makePolicy({
          rules: [makeRule({ effect: 'allow', conditions: [], description: undefined })],
          defaultEffect: 'deny',
        }),
      );
      const result = await engine.evaluate('p1', makeContext());
      expect(result.reason).toBeUndefined();
    });

    it('calls auditLogger.log with correct arguments', async () => {
      const auditLogger = new AuditLogger();
      const handler = vi.fn<[AuditEntry], void>();
      auditLogger.addHandler(handler);

      const engine = new PolicyEngine({ auditLogger });
      const policy = makePolicy({ rules: [], defaultEffect: 'allow' });
      engine.addPolicy(policy);
      const ctx = makeContext();

      await engine.evaluate('p1', ctx);

      expect(handler).toHaveBeenCalledOnce();
      const entry = handler.mock.calls[0][0];
      expect(entry.policyId).toBe('p1');
      expect(entry.policyName).toBe('test-policy');
      expect(entry.context).toEqual(ctx);
      expect(entry.result.allowed).toBe(true);
    });

    it('does not throw when no auditLogger is provided', async () => {
      const engine = new PolicyEngine();
      engine.addPolicy(makePolicy({ rules: [], defaultEffect: 'allow' }));
      await expect(engine.evaluate('p1', makeContext())).resolves.toBeDefined();
    });
  });

  describe('evaluateAll', () => {
    it('returns a result for every registered policy', async () => {
      const engine = new PolicyEngine();
      engine.addPolicy(makePolicy({ id: 'p1', rules: [], defaultEffect: 'allow' }));
      engine.addPolicy(makePolicy({ id: 'p2', rules: [], defaultEffect: 'deny' }));

      const results = await engine.evaluateAll(makeContext());

      expect(results.size).toBe(2);
      expect(results.get('p1')?.allowed).toBe(true);
      expect(results.get('p2')?.allowed).toBe(false);
    });

    it('returns empty map when there are no policies', async () => {
      const engine = new PolicyEngine();
      const results = await engine.evaluateAll(makeContext());
      expect(results.size).toBe(0);
    });
  });
});

// ─── audit.ts ─────────────────────────────────────────────────────────────────

function makeAuditEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    timestamp: new Date().toISOString(),
    policyId: 'p1',
    policyName: 'test-policy',
    context: makeContext(),
    result: { allowed: true, effect: 'allow', matchedRuleId: 'r1' },
    ...overrides,
  };
}

describe('AuditLogger', () => {
  it('calls registered handlers with the audit entry', async () => {
    const logger = new AuditLogger();
    const handler = vi.fn<[AuditEntry], void>();
    logger.addHandler(handler);

    const policy = makePolicy();
    const ctx = makeContext();
    const result: TEvaluationResult = { allowed: true, effect: 'allow', matchedRuleId: 'r1' };

    await logger.log(policy, ctx, result);

    expect(handler).toHaveBeenCalledOnce();
    const entry = handler.mock.calls[0][0];
    expect(entry.policyId).toBe('p1');
    expect(entry.policyName).toBe('test-policy');
    expect(entry.context).toEqual(ctx);
    expect(entry.result).toEqual(result);
    expect(typeof entry.timestamp).toBe('string');
  });

  it('calls multiple handlers', async () => {
    const logger = new AuditLogger();
    const h1 = vi.fn<[AuditEntry], void>();
    const h2 = vi.fn<[AuditEntry], void>();
    logger.addHandler(h1);
    logger.addHandler(h2);

    await logger.log(makePolicy(), makeContext(), { allowed: false, effect: 'deny' });

    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('removeHandler stops calling the removed handler', async () => {
    const logger = new AuditLogger();
    const handler = vi.fn<[AuditEntry], void>();
    logger.addHandler(handler);
    logger.removeHandler(handler);

    await logger.log(makePolicy(), makeContext(), { allowed: true, effect: 'allow' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('removeHandler does not affect other handlers', async () => {
    const logger = new AuditLogger();
    const h1 = vi.fn<[AuditEntry], void>();
    const h2 = vi.fn<[AuditEntry], void>();
    logger.addHandler(h1);
    logger.addHandler(h2);
    logger.removeHandler(h1);

    await logger.log(makePolicy(), makeContext(), { allowed: true, effect: 'allow' });

    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('awaits async handlers', async () => {
    const logger = new AuditLogger();
    const sequence: string[] = [];
    const asyncHandler: AuditHandler = async () => {
      await Promise.resolve();
      sequence.push('async');
    };
    logger.addHandler(asyncHandler);

    await logger.log(makePolicy(), makeContext(), { allowed: true, effect: 'allow' });
    sequence.push('after');

    expect(sequence).toEqual(['async', 'after']);
  });
});

describe('consoleAuditHandler', () => {
  it('logs ALLOW to console for allowed decisions', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const entry = makeAuditEntry({ result: { allowed: true, effect: 'allow', matchedRuleId: 'r1' } });
    consoleAuditHandler(entry);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('ALLOW');
    expect(spy.mock.calls[0][0]).toContain('p1');
    spy.mockRestore();
  });

  it('logs DENY to console for denied decisions', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const entry = makeAuditEntry({ result: { allowed: false, effect: 'deny' } });
    consoleAuditHandler(entry);
    expect(spy.mock.calls[0][0]).toContain('DENY');
    spy.mockRestore();
  });

  it('includes rule id in log when matchedRuleId is present', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const entry = makeAuditEntry({ result: { allowed: true, effect: 'allow', matchedRuleId: 'my-rule' } });
    consoleAuditHandler(entry);
    expect(spy.mock.calls[0][0]).toContain('my-rule');
    spy.mockRestore();
  });

  it('does not include rule= when matchedRuleId is absent', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const entry = makeAuditEntry({ result: { allowed: true, effect: 'allow' } });
    consoleAuditHandler(entry);
    expect(spy.mock.calls[0][0]).not.toContain('rule=');
    spy.mockRestore();
  });
});

describe('JsonlAuditLogger', () => {
  const tmpDir = tmpdir();
  let logFile: string;

  beforeEach(() => {
    logFile = join(tmpDir, `audit-test-${Date.now()}.jsonl`);
  });

  afterEach(async () => {
    if (existsSync(logFile)) {
      await rm(logFile);
    }
  });

  it('creates the file and appends a JSONL line', async () => {
    const logger = new JsonlAuditLogger({ logFile });
    const entry = {
      ts: new Date().toISOString(),
      effect: 'permit',
      resource: 'tool',
      match: 'read_file',
      reason: 'default permit',
      agentId: 'agent-1',
      channel: 'default',
    };
    await logger.log(entry);

    const content = await readFile(logFile, 'utf-8');
    const parsed = JSON.parse(content.trim());
    expect(parsed).toMatchObject(entry);
  });

  it('appends multiple entries as separate JSONL lines', async () => {
    const logger = new JsonlAuditLogger({ logFile });
    await logger.log({ ts: '1', effect: 'permit', resource: 'tool', match: 'a', reason: '', agentId: 'a1', channel: 'default' });
    await logger.log({ ts: '2', effect: 'forbid', resource: 'tool', match: 'b', reason: '', agentId: 'a1', channel: 'default' });

    const lines = (await readFile(logFile, 'utf-8')).trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).ts).toBe('1');
    expect(JSON.parse(lines[1]).ts).toBe('2');
  });

  it('creates intermediate directories if they do not exist', async () => {
    const nestedLog = join(tmpDir, `nested-${Date.now()}`, 'sub', 'audit.jsonl');
    const logger = new JsonlAuditLogger({ logFile: nestedLog });
    await logger.log({ ts: 'x', effect: 'permit', resource: 'tool', match: '*', reason: '', agentId: 'a', channel: 'c' });
    expect(existsSync(nestedLog)).toBe(true);
    await rm(join(tmpDir, `nested-${Date.now() - 1}`), { recursive: true, force: true });
    // Clean up
    const dirParts = nestedLog.split('/');
    dirParts.pop(); dirParts.pop();
    await rm(dirParts.join('/'), { recursive: true, force: true }).catch(() => {});
  });

  it('does not throw on write failure — logs to stderr instead', async () => {
    // Use an invalid path (directory as file) to force a write error
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new JsonlAuditLogger({ logFile: tmpDir }); // tmpDir is a directory, not a file
    await expect(
      logger.log({ ts: 'x', effect: 'permit', resource: 'tool', match: '*', reason: '', agentId: 'a', channel: 'c' })
    ).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('logs HITL decision entries', async () => {
    const logger = new JsonlAuditLogger({ logFile });
    const entry = {
      ts: new Date().toISOString(),
      type: 'hitl' as const,
      decision: 'approved' as const,
      token: 'tok-123',
      toolName: 'delete_file',
      agentId: 'agent-1',
      channel: 'default',
      policyName: 'hitl-policy',
      timeoutSeconds: 30,
    };
    await logger.log(entry);

    const content = await readFile(logFile, 'utf-8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.type).toBe('hitl');
    expect(parsed.decision).toBe('approved');
    expect(parsed.token).toBe('tok-123');
  });
});
