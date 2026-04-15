/**
 * Tests for CedarEngine — Cedar WASM-backed authorization engine.
 *
 * Test IDs
 * ─────────
 * CE-01  Before init: default effect is 'forbid' with reason 'cedar_not_initialized'
 * CE-02  Before init: defaultEffect 'permit' option returns permit with same reason
 * CE-03  policies property defaults to empty string
 * CE-04  policies property can be set and updated
 * CE-05  evaluate() — Cedar 'allow' response maps to 'permit'
 * CE-06  evaluate() — Cedar 'deny' response maps to 'forbid'
 * CE-07  evaluate() — Cedar 'failure' response maps to 'forbid'
 * CE-08  evaluate() — Cedar deny diagnostics reasons included in decision
 * CE-09  evaluate() — reason absent when Cedar returns empty diagnostics reasons
 * CE-10  evaluate() — matchedRule always absent (Cedar WASM semantics)
 * CE-11  evaluate() — multiple reasons joined by '; '
 * CE-12  evaluate() — principal entity uid uses agent id from context
 * CE-13  evaluate() — action is always OpenAuthority::Action::RequestAccess
 * CE-14  evaluate() — resource uid uses resource type and name
 * CE-15  evaluate() — engine.policies passed as staticPolicies in request
 * CE-16  evaluate() — context object in request is always empty
 * CE-17  evaluate() — without actionClass: only agent entity in store
 * CE-18  evaluateByActionClass() — filesystem.* maps to file resource type
 * CE-19  evaluateByActionClass() — communication.* maps to external resource type
 * CE-20  evaluateByActionClass() — payment.* maps to payment resource type
 * CE-21  evaluateByActionClass() — system.* maps to system resource type
 * CE-22  evaluateByActionClass() — credential.* maps to credential resource type
 * CE-23  evaluateByActionClass() — browser.* maps to web resource type
 * CE-24  evaluateByActionClass() — memory.* maps to memory resource type
 * CE-25  evaluateByActionClass() — 'unknown_sensitive_action' maps to unknown
 * CE-26  evaluateByActionClass() — unknown prefix maps to unknown resource type
 * CE-27  evaluateByActionClass() — adds resource entity with actionClass attr
 * CE-28  evaluateByActionClass() — two entities in store (agent + resource)
 * CE-E01 Entity hydration — verified undefined not forwarded
 * CE-E02 Entity hydration — userId undefined not forwarded
 * CE-E03 Entity hydration — sessionId undefined not forwarded
 * CE-E04 Entity hydration — all optional fields forwarded when present
 * CE-E05 Entity hydration — agent uid id matches agentId
 * CE-E06 Entity hydration — agent uid type is OpenAuthority::Agent
 * CE-D01 Decision — filesystem.read → permit (real WASM)
 * CE-D02 Decision — browser.navigate → permit (real WASM)
 * CE-D03 Decision — filesystem.list → permit (real WASM)
 * CE-D04 Decision — memory.read → permit (real WASM)
 * CE-D05 Decision — payment.transfer → forbid (real WASM)
 * CE-D06 Decision — payment.initiate → forbid (real WASM)
 * CE-D07 Decision — credential.access → forbid (real WASM)
 * CE-D08 Decision — credential.write → forbid (real WASM)
 * CE-D09 Decision — system.execute → forbid (real WASM)
 * CE-D10 Decision — account.permission.change → forbid (real WASM)
 * CE-D11 Decision — unknown_sensitive_action → forbid (real WASM)
 * CE-D12 Decision — no policy match → forbid (Cedar default deny)
 * CE-D13 Decision — context with all optional fields → no errors
 * CE-D14 Decision — invalid Cedar policy syntax → forbid
 * CE-INIT-01 init() resolves without error
 * CE-INIT-02 evaluate() after init() returns a valid EvaluationDecision
 * CE-ERR-01 CedarPolicyLoadError is an instance of Error
 * CE-ERR-02 CedarPolicyLoadError has name CedarPolicyLoadError
 * CE-ERR-03 CedarPolicyLoadError exposes cause when provided
 * CE-ERR-04 CedarPolicyLoadError message is preserved
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CedarEngine, CedarPolicyLoadError } from './cedar-engine.js';
import type { RuleContext } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../../data');

// ---------------------------------------------------------------------------
// Local types for Cedar WASM request shape
// (avoids relying on unstable package types — consistent with cedar-schema.test.ts)
// ---------------------------------------------------------------------------

interface CedarEntityUid {
  type: string;
  id: string;
}

interface CedarEntityRecord {
  uid: CedarEntityUid;
  attrs: Record<string, unknown>;
  parents: unknown[];
}

interface CedarRequest {
  principal: CedarEntityUid;
  action: CedarEntityUid;
  resource: CedarEntityUid;
  context: Record<string, unknown>;
  policies: { staticPolicies?: string };
  entities: CedarEntityRecord[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides?: Partial<RuleContext>): RuleContext {
  return { agentId: 'agent-1', channel: 'default', ...overrides };
}

/** Injects a mock Cedar WASM module into the engine's private cedar field. */
function injectMock(engine: CedarEngine, isAuthorized: ReturnType<typeof vi.fn>): void {
  (engine as unknown as { cedar: { isAuthorized: typeof isAuthorized } }).cedar = {
    isAuthorized,
  };
}

function makeAllow(reasons: string[] = []): object {
  return {
    type: 'success',
    response: { decision: 'allow', diagnostics: { reason: reasons, errors: [] } },
  };
}

function makeDeny(reasons: string[] = []): object {
  return {
    type: 'success',
    response: { decision: 'deny', diagnostics: { reason: reasons, errors: [] } },
  };
}

function makeFailure(errors: unknown[] = []): object {
  return { type: 'failure', errors };
}

/** Loads Cedar policy files from data/policies/ and concatenates them. */
function loadPolicies(): string {
  const tier10 = readFileSync(resolve(DATA_DIR, 'policies/tier10-permits.cedar'), 'utf-8');
  const tier100 = readFileSync(resolve(DATA_DIR, 'policies/tier100-forbids.cedar'), 'utf-8');
  return [tier10, tier100].join('\n');
}

// ============================================================================
// Tests
// ============================================================================

describe('CedarEngine', () => {
  // ── Before init() ───────────────────────────────────────────────────────────

  describe('before init()', () => {
    it('CE-01: returns forbid with reason cedar_not_initialized when not initialized', () => {
      const engine = new CedarEngine();
      const decision = engine.evaluate('tool', 'read_file', makeContext());
      expect(decision.effect).toBe('forbid');
      expect(decision.reason).toBe('cedar_not_initialized');
    });

    it('CE-02: defaultEffect permit returns permit with reason cedar_not_initialized', () => {
      const engine = new CedarEngine({ defaultEffect: 'permit' });
      const decision = engine.evaluate('tool', 'read_file', makeContext());
      expect(decision.effect).toBe('permit');
      expect(decision.reason).toBe('cedar_not_initialized');
    });

    it('CE-03: policies property defaults to empty string', () => {
      const engine = new CedarEngine();
      expect(engine.policies).toBe('');
    });

    it('CE-04: policies property can be set and updated', () => {
      const engine = new CedarEngine();
      engine.policies = 'permit(principal, action, resource);';
      expect(engine.policies).toBe('permit(principal, action, resource);');
      engine.policies = 'forbid(principal, action, resource);';
      expect(engine.policies).toBe('forbid(principal, action, resource);');
    });
  });

  // ── evaluate() with mocked Cedar WASM ────────────────────────────────────────

  describe('evaluate() — mocked Cedar WASM', () => {
    it('CE-05: Cedar allow response maps to permit', () => {
      const mock = vi.fn().mockReturnValue(makeAllow());
      const engine = new CedarEngine();
      injectMock(engine, mock);
      const decision = engine.evaluate('tool', 'read_file', makeContext());
      expect(decision.effect).toBe('permit');
    });

    it('CE-06: Cedar deny response maps to forbid', () => {
      const mock = vi.fn().mockReturnValue(makeDeny());
      const engine = new CedarEngine();
      injectMock(engine, mock);
      const decision = engine.evaluate('payment', 'transfer_funds', makeContext());
      expect(decision.effect).toBe('forbid');
    });

    it('CE-07: Cedar failure response maps to forbid', () => {
      const mock = vi.fn().mockReturnValue(makeFailure());
      const engine = new CedarEngine();
      injectMock(engine, mock);
      const decision = engine.evaluate('tool', 'read_file', makeContext());
      expect(decision.effect).toBe('forbid');
    });

    it('CE-08: Cedar deny diagnostics reasons included in decision reason', () => {
      const mock = vi.fn().mockReturnValue(makeDeny(['100-payment-transfer']));
      const engine = new CedarEngine();
      injectMock(engine, mock);
      const decision = engine.evaluate('payment', 'transfer_funds', makeContext());
      expect(decision.reason).toBe('100-payment-transfer');
    });

    it('CE-09: reason absent when Cedar returns empty diagnostics reasons', () => {
      const mock = vi.fn().mockReturnValue(makeDeny([]));
      const engine = new CedarEngine();
      injectMock(engine, mock);
      const decision = engine.evaluate('tool', 'read_file', makeContext());
      expect(decision).not.toHaveProperty('reason');
    });

    it('CE-10: matchedRule always absent in Cedar decisions (permit)', () => {
      const mock = vi.fn().mockReturnValue(makeAllow());
      const engine = new CedarEngine();
      injectMock(engine, mock);
      const decision = engine.evaluate('tool', 'read_file', makeContext());
      expect(decision).not.toHaveProperty('matchedRule');
    });

    it('CE-10b: matchedRule always absent in Cedar decisions (forbid)', () => {
      const mock = vi.fn().mockReturnValue(makeDeny());
      const engine = new CedarEngine();
      injectMock(engine, mock);
      const decision = engine.evaluate('payment', 'transfer_funds', makeContext());
      expect(decision).not.toHaveProperty('matchedRule');
    });

    it('CE-11: multiple Cedar reasons joined by "; "', () => {
      const mock = vi.fn().mockReturnValue(makeDeny(['100-payment-transfer', '100-payment-block']));
      const engine = new CedarEngine();
      injectMock(engine, mock);
      const decision = engine.evaluate('payment', 'transfer_funds', makeContext());
      expect(decision.reason).toBe('100-payment-transfer; 100-payment-block');
    });

    it('CE-12: principal entity uid uses agentId from context', () => {
      const mock = vi.fn().mockReturnValue(makeAllow());
      const engine = new CedarEngine();
      injectMock(engine, mock);
      engine.evaluate('tool', 'read_file', makeContext({ agentId: 'my-agent' }));
      const req = mock.mock.calls[0][0] as CedarRequest;
      expect(req.principal).toEqual({ type: 'OpenAuthority::Agent', id: 'my-agent' });
    });

    it('CE-13: action is always OpenAuthority::Action::RequestAccess', () => {
      const mock = vi.fn().mockReturnValue(makeAllow());
      const engine = new CedarEngine();
      injectMock(engine, mock);
      engine.evaluate('tool', 'read_file', makeContext());
      const req = mock.mock.calls[0][0] as CedarRequest;
      expect(req.action).toEqual({ type: 'OpenAuthority::Action', id: 'RequestAccess' });
    });

    it('CE-14: resource uid uses resource type and resource name', () => {
      const mock = vi.fn().mockReturnValue(makeAllow());
      const engine = new CedarEngine();
      injectMock(engine, mock);
      engine.evaluate('file', 'read_file', makeContext());
      const req = mock.mock.calls[0][0] as CedarRequest;
      expect(req.resource).toEqual({ type: 'OpenAuthority::Resource', id: 'file:read_file' });
    });

    it('CE-15: engine.policies string passed as staticPolicies in request', () => {
      const mock = vi.fn().mockReturnValue(makeAllow());
      const engine = new CedarEngine();
      injectMock(engine, mock);
      engine.policies = 'permit(principal, action, resource);';
      engine.evaluate('tool', 'read_file', makeContext());
      const req = mock.mock.calls[0][0] as CedarRequest;
      expect(req.policies.staticPolicies).toBe('permit(principal, action, resource);');
    });

    it('CE-16: context object in Cedar request is always empty', () => {
      const mock = vi.fn().mockReturnValue(makeAllow());
      const engine = new CedarEngine();
      injectMock(engine, mock);
      engine.evaluate('tool', 'read_file', makeContext({ metadata: { foo: 'bar' } }));
      const req = mock.mock.calls[0][0] as CedarRequest;
      expect(req.context).toEqual({});
    });

    it('CE-17: evaluate() without actionClass sends only agent entity in store', () => {
      const mock = vi.fn().mockReturnValue(makeAllow());
      const engine = new CedarEngine();
      injectMock(engine, mock);
      engine.evaluate('tool', 'read_file', makeContext());
      const req = mock.mock.calls[0][0] as CedarRequest;
      expect(req.entities).toHaveLength(1);
      expect(req.entities[0].uid.type).toBe('OpenAuthority::Agent');
    });
  });

  // ── evaluateByActionClass() — action class mapping ────────────────────────────

  describe('evaluateByActionClass() — action class to resource mapping', () => {
    /**
     * Calls evaluateByActionClass() with a mock and returns the Cedar request
     * that was passed to isAuthorized.
     */
    function captureRequest(actionClass: string, resourceName = 'test-resource'): CedarRequest {
      const mock = vi.fn().mockReturnValue(makeAllow());
      const engine = new CedarEngine();
      injectMock(engine, mock);
      engine.evaluateByActionClass(actionClass, resourceName, makeContext());
      return mock.mock.calls[0][0] as CedarRequest;
    }

    it('CE-18: filesystem.* maps to file resource type', () => {
      const req = captureRequest('filesystem.read', 'read_file');
      expect(req.resource.id).toBe('file:read_file');
    });

    it('CE-19: communication.* maps to external resource type', () => {
      const req = captureRequest('communication.send', 'send_email');
      expect(req.resource.id).toBe('external:send_email');
    });

    it('CE-20: payment.* maps to payment resource type', () => {
      const req = captureRequest('payment.transfer', 'transfer_funds');
      expect(req.resource.id).toBe('payment:transfer_funds');
    });

    it('CE-21: system.* maps to system resource type', () => {
      const req = captureRequest('system.execute', 'execute_command');
      expect(req.resource.id).toBe('system:execute_command');
    });

    it('CE-22: credential.* maps to credential resource type', () => {
      const req = captureRequest('credential.access', 'get_secret');
      expect(req.resource.id).toBe('credential:get_secret');
    });

    it('CE-23: browser.* maps to web resource type', () => {
      const req = captureRequest('browser.navigate', 'navigate');
      expect(req.resource.id).toBe('web:navigate');
    });

    it('CE-24: memory.* maps to memory resource type', () => {
      const req = captureRequest('memory.read', 'memory_read');
      expect(req.resource.id).toBe('memory:memory_read');
    });

    it('CE-25: unknown_sensitive_action maps to unknown resource type', () => {
      const req = captureRequest('unknown_sensitive_action', 'unknown_tool_xyz');
      expect(req.resource.id).toBe('unknown:unknown_tool_xyz');
    });

    it('CE-26: unknown prefix maps to unknown resource type', () => {
      const req = captureRequest('custom.operation', 'some_tool');
      expect(req.resource.id).toBe('unknown:some_tool');
    });

    it('CE-27: resource entity carries actionClass attribute', () => {
      const req = captureRequest('filesystem.read', 'read_file');
      const resourceEntity = req.entities.find(e => e.uid.type === 'OpenAuthority::Resource');
      expect(resourceEntity).toBeDefined();
      expect(resourceEntity!.attrs['actionClass']).toBe('filesystem.read');
    });

    it('CE-28: entity store has two entries (agent + resource)', () => {
      const req = captureRequest('filesystem.read', 'read_file');
      expect(req.entities).toHaveLength(2);
      const types = req.entities.map(e => e.uid.type);
      expect(types).toContain('OpenAuthority::Agent');
      expect(types).toContain('OpenAuthority::Resource');
    });
  });

  // ── Entity hydration edge cases ───────────────────────────────────────────────

  describe('entity hydration edge cases', () => {
    function captureAgentEntity(context: RuleContext): CedarEntityRecord {
      const mock = vi.fn().mockReturnValue(makeAllow());
      const engine = new CedarEngine();
      injectMock(engine, mock);
      engine.evaluate('tool', 'read_file', context);
      const req = mock.mock.calls[0][0] as CedarRequest;
      return req.entities.find(e => e.uid.type === 'OpenAuthority::Agent')!;
    }

    it('CE-E01: verified undefined is not forwarded to entity attrs', () => {
      const entity = captureAgentEntity(makeContext({ verified: undefined }));
      expect(entity.attrs).not.toHaveProperty('verified');
    });

    it('CE-E02: userId undefined is not forwarded to entity attrs', () => {
      const entity = captureAgentEntity(makeContext({ userId: undefined }));
      expect(entity.attrs).not.toHaveProperty('userId');
    });

    it('CE-E03: sessionId undefined is not forwarded to entity attrs', () => {
      const entity = captureAgentEntity(makeContext({ sessionId: undefined }));
      expect(entity.attrs).not.toHaveProperty('sessionId');
    });

    it('CE-E04: all optional fields forwarded when present', () => {
      const entity = captureAgentEntity(
        makeContext({ verified: true, userId: 'u-1', sessionId: 'sess-1' }),
      );
      expect(entity.attrs['verified']).toBe(true);
      expect(entity.attrs['userId']).toBe('u-1');
      expect(entity.attrs['sessionId']).toBe('sess-1');
    });

    it('CE-E05: agent entity uid id matches agentId', () => {
      const entity = captureAgentEntity(makeContext({ agentId: 'unique-agent' }));
      expect(entity.uid.id).toBe('unique-agent');
    });

    it('CE-E06: agent entity uid type is OpenAuthority::Agent', () => {
      const entity = captureAgentEntity(makeContext());
      expect(entity.uid.type).toBe('OpenAuthority::Agent');
    });

    it('CE-E07: verified false is forwarded (not treated as falsy-omit)', () => {
      const entity = captureAgentEntity(makeContext({ verified: false }));
      expect(entity.attrs['verified']).toBe(false);
    });

    it('CE-E08: agentId and channel always present in entity attrs', () => {
      const entity = captureAgentEntity(makeContext({ agentId: 'a', channel: 'prod' }));
      expect(entity.attrs['agentId']).toBe('a');
      expect(entity.attrs['channel']).toBe('prod');
    });

    it('CE-E09: resource entity uid concatenates type and name with colon', () => {
      const mock = vi.fn().mockReturnValue(makeAllow());
      const engine = new CedarEngine();
      injectMock(engine, mock);
      engine.evaluateByActionClass('payment.transfer', 'transfer_funds', makeContext());
      const req = mock.mock.calls[0][0] as CedarRequest;
      const resourceEntity = req.entities.find(e => e.uid.type === 'OpenAuthority::Resource');
      expect(resourceEntity!.uid.id).toBe('payment:transfer_funds');
    });
  });

  // ── init() — WASM loading ─────────────────────────────────────────────────────

  describe('init() — WASM loading', () => {
    const WASM_TIMEOUT = 15_000;

    it(
      'CE-INIT-01: init() resolves without throwing',
      async () => {
        const engine = new CedarEngine({ defaultEffect: 'permit' });
        await expect(engine.init()).resolves.toBeUndefined();
      },
      WASM_TIMEOUT,
    );

    it(
      'CE-INIT-02: evaluate() after init() returns a valid EvaluationDecision',
      async () => {
        const engine = new CedarEngine();
        await engine.init();
        const decision = engine.evaluate('tool', 'read_file', makeContext());
        expect(['permit', 'forbid']).toContain(decision.effect);
      },
      WASM_TIMEOUT,
    );
  });

  // ── Decisions — real Cedar WASM ───────────────────────────────────────────────

  describe('decisions — real Cedar WASM', () => {
    let engine: CedarEngine;

    const WASM_TIMEOUT = 15_000;
    const ctx = makeContext();

    beforeAll(async () => {
      engine = new CedarEngine();
      await engine.init();
      engine.policies = loadPolicies();
    }, WASM_TIMEOUT);

    // ── Permitted action classes ─────────────────────────────────────────────

    it('CE-D01: filesystem.read → permit', () => {
      expect(engine.evaluateByActionClass('filesystem.read', 'read_file', ctx).effect).toBe('permit');
    });

    it('CE-D02: browser.navigate → permit', () => {
      expect(engine.evaluateByActionClass('browser.navigate', 'navigate', ctx).effect).toBe('permit');
    });

    it('CE-D03: filesystem.list → permit', () => {
      expect(engine.evaluateByActionClass('filesystem.list', 'list_dir', ctx).effect).toBe('permit');
    });

    it('CE-D04: memory.read → permit', () => {
      expect(engine.evaluateByActionClass('memory.read', 'memory_read', ctx).effect).toBe('permit');
    });

    // ── Forbidden action classes ─────────────────────────────────────────────

    it('CE-D05: payment.transfer → forbid', () => {
      expect(engine.evaluateByActionClass('payment.transfer', 'transfer_funds', ctx).effect).toBe('forbid');
    });

    it('CE-D06: payment.initiate → forbid', () => {
      expect(engine.evaluateByActionClass('payment.initiate', 'initiate_payment', ctx).effect).toBe('forbid');
    });

    it('CE-D07: credential.access → forbid', () => {
      expect(engine.evaluateByActionClass('credential.access', 'get_secret', ctx).effect).toBe('forbid');
    });

    it('CE-D08: credential.write → forbid', () => {
      expect(engine.evaluateByActionClass('credential.write', 'set_secret', ctx).effect).toBe('forbid');
    });

    it('CE-D09: system.execute → forbid', () => {
      expect(engine.evaluateByActionClass('system.execute', 'execute_command', ctx).effect).toBe('forbid');
    });

    it('CE-D10: account.permission.change → forbid', () => {
      expect(engine.evaluateByActionClass('account.permission.change', 'change_permissions', ctx).effect).toBe('forbid');
    });

    it('CE-D11: unknown_sensitive_action → forbid', () => {
      expect(engine.evaluateByActionClass('unknown_sensitive_action', 'unknown_tool_xyz', ctx).effect).toBe('forbid');
    });

    // ── Cedar default deny semantics ─────────────────────────────────────────

    it('CE-D12: no matching policy → forbid (Cedar default deny)', () => {
      // Reuse the initialized WASM module but with no policies loaded.
      const emptyEngine = new CedarEngine();
      (emptyEngine as unknown as { cedar: unknown }).cedar =
        (engine as unknown as { cedar: unknown }).cedar;
      emptyEngine.policies = '';
      expect(emptyEngine.evaluateByActionClass('filesystem.read', 'read_file', ctx).effect).toBe('forbid');
    });

    // ── Entity hydration with all optional fields ────────────────────────────

    it('CE-D13: context with all optional fields raises no errors', () => {
      const fullCtx = makeContext({ verified: true, userId: 'user-42', sessionId: 'sess-abc' });
      const decision = engine.evaluateByActionClass('filesystem.read', 'read_file', fullCtx);
      expect(decision.effect).toBe('permit');
    });

    it('CE-D13b: context with verified: false → permit (filesystem.read)', () => {
      const decision = engine.evaluateByActionClass(
        'filesystem.read', 'read_file', makeContext({ verified: false }),
      );
      expect(decision.effect).toBe('permit');
    });

    // ── Policy validation failures ───────────────────────────────────────────

    it('CE-D14: invalid Cedar policy syntax → forbid', () => {
      const badEngine = new CedarEngine();
      (badEngine as unknown as { cedar: unknown }).cedar =
        (engine as unknown as { cedar: unknown }).cedar;
      badEngine.policies = 'this is not valid cedar syntax !!!';
      const decision = badEngine.evaluateByActionClass('filesystem.read', 'read_file', ctx);
      expect(decision.effect).toBe('forbid');
    });

    // ── Decision comparison table (semantic equivalence) ─────────────────────

    it('CE-SUMMARY: all workload decisions match expected policy outcomes', () => {
      const workload: Array<{ actionClass: string; name: string; expected: 'permit' | 'forbid' }> = [
        { actionClass: 'filesystem.read',           name: 'read_file',          expected: 'permit' },
        { actionClass: 'filesystem.list',           name: 'list_dir',           expected: 'permit' },
        { actionClass: 'browser.navigate',          name: 'navigate',           expected: 'permit' },
        { actionClass: 'memory.read',               name: 'memory_read',        expected: 'permit' },
        { actionClass: 'payment.transfer',          name: 'transfer_funds',     expected: 'forbid' },
        { actionClass: 'payment.initiate',          name: 'initiate_payment',   expected: 'forbid' },
        { actionClass: 'credential.access',         name: 'get_secret',         expected: 'forbid' },
        { actionClass: 'credential.write',          name: 'set_secret',         expected: 'forbid' },
        { actionClass: 'system.execute',            name: 'execute_command',    expected: 'forbid' },
        { actionClass: 'account.permission.change', name: 'change_permissions', expected: 'forbid' },
        { actionClass: 'unknown_sensitive_action',  name: 'unknown_tool_xyz',   expected: 'forbid' },
      ];

      const divergences: string[] = [];
      for (const { actionClass, name, expected } of workload) {
        const { effect } = engine.evaluateByActionClass(actionClass, name, ctx);
        if (effect !== expected) {
          divergences.push(`${actionClass} (${name}): expected ${expected}, got ${effect}`);
        }
      }

      expect(divergences).toHaveLength(0);
    });
  });

  // ── CedarPolicyLoadError ───────────────────────────────────────────────────────

  describe('CedarPolicyLoadError', () => {
    it('CE-ERR-01: is an instance of Error', () => {
      const err = new CedarPolicyLoadError('test error');
      expect(err).toBeInstanceOf(Error);
    });

    it('CE-ERR-02: has name CedarPolicyLoadError', () => {
      const err = new CedarPolicyLoadError('test error');
      expect(err.name).toBe('CedarPolicyLoadError');
    });

    it('CE-ERR-03: exposes cause when provided', () => {
      const cause = new Error('original error');
      const err = new CedarPolicyLoadError('wrapper message', cause);
      expect(err.cause).toBe(cause);
    });

    it('CE-ERR-04: message is preserved', () => {
      const err = new CedarPolicyLoadError('load failed: missing file');
      expect(err.message).toBe('load failed: missing file');
    });

    it('CE-ERR-05: cause is undefined when not provided', () => {
      const err = new CedarPolicyLoadError('no cause');
      expect(err.cause).toBeUndefined();
    });
  });
});
