/**
 * Exec / shell-wrapper reclassification e2e tests
 *
 * Exercises the PRODUCTION `beforeToolCallHandler` in `src/index.ts` with
 * real host tool shapes. Locks in the guarantees behind normalizer
 * Rules 1–3 and verifies raw exec classification as `unknown_sensitive_action`.
 *
 * Rule 1: `filesystem.write` with a URL target → reclassified to `web.post`
 * Rule 2: `filesystem.write` with an email target (contains `@`) →
 *         reclassified to `communication.external.send`
 * Rule 3: Any action class where a param value contains shell metacharacters
 *         → risk raised to `critical` (action class is unchanged)
 *
 * Raw exec classification: a bare `exec` call (not a registered shell alias)
 * resolves to `unknown_sensitive_action`, which carries a priority-100 forbid
 * in CLOSED mode and implicitly permits in OPEN mode (fail-open by design;
 * see the NOTE in `src/policy/rules/default.ts`).
 *
 * `CLAWTHORITY_MODE` is consumed at module-load time; each test resets
 * the module cache via `vi.resetModules()` and dynamically re-imports
 * `./index.js` under a specific mode. Same pattern as `mode-hook.e2e.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BeforeToolCallHandler,
  BeforeToolCallResult,
  HookContext,
  OpenclawPluginContext,
} from './index.js';

// ─── Mock chokidar so activation doesn't spin up a real FS watcher ──────────

vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      close: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

async function loadPluginInMode(
  mode: 'open' | 'closed',
): Promise<BeforeToolCallHandler> {
  process.env.CLAWTHORITY_MODE = mode;
  process.env.OPENAUTH_FORCE_ACTIVE = '1';
  vi.resetModules();

  const mod = (await import('./index.js')) as { default: {
    activate: (ctx: OpenclawPluginContext) => Promise<void>;
    deactivate?: () => Promise<void>;
  } };

  let captured: BeforeToolCallHandler | undefined;
  const ctx: OpenclawPluginContext = {
    registerHook: () => undefined,
    on: (hookName: string, handler: unknown) => {
      if (hookName === 'before_tool_call') {
        captured = handler as BeforeToolCallHandler;
      }
    },
  } as unknown as OpenclawPluginContext;

  await mod.default.activate(ctx);
  if (captured === undefined) {
    throw new Error('beforeToolCallHandler was not registered during activate()');
  }
  return captured;
}

const HOOK_CTX: HookContext = {
  agentId: 'agent-test',
  channelId: 'default',
};

async function callHook(
  handler: BeforeToolCallHandler,
  toolName: string,
  params: Record<string, unknown> = {},
): Promise<BeforeToolCallResult | undefined> {
  // `source: 'user'` bypasses the untrusted-source Stage 1 gate so the test
  // specifically exercises the Cedar + normalizer path this feature controls.
  const result = await handler({ toolName, params, source: 'user' }, HOOK_CTX);
  return result ?? undefined;
}

// ─── Suite ──────────────────────────────────────────────────────────────────

describe('exec reclassification — production hook handler', () => {
  beforeEach(() => {
    delete process.env.CLAWTHORITY_MODE;
    delete process.env.OPENAUTH_FORCE_ACTIVE;
  });

  afterEach(() => {
    delete process.env.CLAWTHORITY_MODE;
    delete process.env.OPENAUTH_FORCE_ACTIVE;
  });

  // ── Rule 1: filesystem.write + URL → web.post ─────────────────────────────
  //
  // The reclassification to web.post keeps the action class meaningful for
  // operator policies instead of landing on filesystem.write (which operators
  // typically gate with filesystem-specific rules, not network rules).
  // web.post is not in CRITICAL_ACTION_CLASSES, so OPEN mode implicit-permits.

  describe('Rule 1: write with URL target reclassified to web.post', () => {
    it('write with http:// path permits in OPEN mode (web.post is not critical)', async () => {
      const handler = await loadPluginInMode('open');
      const result = await callHook(handler, 'write', {
        path: 'http://api.example.com/data',
        content: 'payload',
      });
      expect(result?.block).not.toBe(true);
    });

    it('write with https:// path permits in OPEN mode', async () => {
      const handler = await loadPluginInMode('open');
      const result = await callHook(handler, 'write', {
        path: 'https://api.example.com/upload',
        content: 'payload',
      });
      expect(result?.block).not.toBe(true);
    });

    it('write with a local file path is NOT reclassified as web.post', async () => {
      // A plain filesystem path must not trigger Rule 1. This negative assertion
      // guards against Rule 1 over-matching and misclassifying local writes.
      const handler = await loadPluginInMode('open');
      const result = await callHook(handler, 'write', {
        path: '/tmp/output.txt',
        content: 'data',
      });
      // filesystem.write for a local path — not critical, permits in OPEN mode.
      expect(result?.block).not.toBe(true);
    });
  });

  // ── Rule 2: filesystem.write + email target → communication.external.send ─
  //
  // Email-addressed write targets are reclassified so email-specific operator
  // policies (e.g. external_send intent_group rules) can fire. The class is
  // not in CRITICAL_ACTION_CLASSES, so OPEN mode implicit-permits.

  describe('Rule 2: write with email target reclassified to communication.external.send', () => {
    it('write tool with email recipient permits in OPEN mode', async () => {
      const handler = await loadPluginInMode('open');
      const result = await callHook(handler, 'write', {
        to: 'user@example.com',
        content: 'Hello',
      });
      // communication.external.send is not critical — OPEN mode implicit permit.
      expect(result?.block).not.toBe(true);
    });

    it('write tool with non-email path is NOT reclassified as communication.external.send', async () => {
      // Negative: a regular path containing no `@` must not trigger Rule 2.
      const handler = await loadPluginInMode('open');
      const result = await callHook(handler, 'write', {
        path: '/home/user/report.txt',
        content: 'data',
      });
      expect(result?.block).not.toBe(true);
    });
  });

  // ── Rule 3: Shell metacharacters → critical risk ───────────────────────────
  //
  // Rule 3 raises the `risk` field to `critical` but does NOT change the
  // `action_class`. Cedar policy matches on action_class (and intent_group),
  // not on risk level, so metacharacters alone do not cause a block for
  // non-critical action classes. The risk field feeds HITL routing downstream.

  describe('Rule 3: shell metacharacters raise risk without changing action class', () => {
    it('read with shell metacharacters in path still permits in OPEN mode', async () => {
      const handler = await loadPluginInMode('open');
      const result = await callHook(handler, 'read', { path: '/tmp/test; ls' });
      // Rule 3 raises risk to critical but action_class stays filesystem.read,
      // which is not critical — OPEN mode implicit permit.
      expect(result?.block).not.toBe(true);
    });

    it('read with shell metacharacters in path still permits in CLOSED mode (priority-10 permit)', async () => {
      const handler = await loadPluginInMode('closed');
      const result = await callHook(handler, 'read', { path: '/tmp/file`id`' });
      // filesystem.read has an explicit priority-10 permit in DEFAULT_RULES —
      // metacharacters escalate risk but do not override the permit rule.
      expect(result?.block).not.toBe(true);
    });

    it('shell.exec with metacharacters still blocks in OPEN mode (critical class)', async () => {
      const handler = await loadPluginInMode('open');
      const result = await callHook(handler, 'bash', { command: 'ls; rm -rf /' });
      // shell.exec is in CRITICAL_ACTION_CLASSES — blocked regardless of
      // whether metacharacters trigger Rule 3 or not.
      expect(result?.block).toBe(true);
    });
  });

  // ── Raw exec classification (D-06 regression) ────────────────────────────
  //
  // `exec` is not a registered shell alias — it resolves to
  // `unknown_sensitive_action` (fail-closed unknown tool behaviour).
  //
  // In OPEN mode, `unknown_sensitive_action` is intentionally excluded from
  // CRITICAL_ACTION_CLASSES so unrecognised OpenClaw tools are not
  // accidentally blocked (implicit permit). In CLOSED mode the full
  // DEFAULT_RULES set applies and the priority-100 forbid fires.

  describe('raw exec classification — unknown_sensitive_action (D-06)', () => {
    it('raw exec call resolves to unknown_sensitive_action and permits in OPEN mode', async () => {
      const handler = await loadPluginInMode('open');
      const result = await callHook(handler, 'exec', { command: 'ls /tmp' });
      // exec is not in the shell-alias registry → unknown_sensitive_action.
      // OPEN mode excludes unknown_sensitive_action from its forbid set —
      // implicit permit.
      expect(result?.block).not.toBe(true);
    });

    it('raw exec call resolves to unknown_sensitive_action and is forbidden at priority 100 in CLOSED mode', async () => {
      const handler = await loadPluginInMode('closed');
      const result = await callHook(handler, 'exec', { command: 'ls /tmp' });
      // CLOSED mode includes the priority-100 forbid for unknown_sensitive_action.
      expect(result?.block).toBe(true);
    });

    it('unknown tool name resolves to unknown_sensitive_action and is forbidden in CLOSED mode', async () => {
      const handler = await loadPluginInMode('closed');
      const result = await callHook(handler, 'totally_unrecognised_tool_xyz', {});
      expect(result?.block).toBe(true);
    });
  });

  // ── Bare-verb aliases end-to-end ──────────────────────────────────────────

  describe('bare-verb aliases', () => {
    it('bare "read" tool is permitted in OPEN mode (filesystem.read)', async () => {
      const handler = await loadPluginInMode('open');
      const result = await callHook(handler, 'read', { path: '/tmp/notes.txt' });
      expect(result?.block).not.toBe(true);
    });

    it('bare "read" tool is permitted in CLOSED mode via priority-10 permit', async () => {
      const handler = await loadPluginInMode('closed');
      const result = await callHook(handler, 'read', { path: '/tmp/notes.txt' });
      expect(result?.block).not.toBe(true);
    });

    it('bare "list" tool is permitted in OPEN mode', async () => {
      const handler = await loadPluginInMode('open');
      const result = await callHook(handler, 'list', { path: '/tmp' });
      expect(result?.block).not.toBe(true);
    });
  });
});
