/**
 * One-off operation handler tests.
 *
 * Verifies that `OneOffOperationHandler` correctly detects operations not in
 * the taxonomy, routes them to the `request_new_capability` meta-tool (HITL),
 * files RFCs automatically via G-01, never falls back to exec, and logs all
 * one-off requests in an immutable audit trail.
 *
 * Test IDs:
 *   TC-OOH-01: Unregistered tool returns forbid decision
 *   TC-OOH-02: Unregistered tool result includes HITL routing in metadata
 *   TC-OOH-03: Unregistered tool files an RFC via G-01
 *   TC-OOH-04: Exec wrapper tool returns forbid without RFC filing
 *   TC-OOH-05: Registered non-exec tool defers (not a one-off operation)
 *   TC-OOH-06: One-off request is logged with tool name and RFC ID
 *   TC-OOH-07: Audit log records request_received, rfc_filed, hitl_routed
 *   TC-OOH-08: hitlRouting.metaTool is always 'request_new_capability'
 *   TC-OOH-09: listRequests returns snapshot (mutations do not affect state)
 *   TC-OOH-10: getAuditLog returns snapshot (mutations do not affect state)
 *   TC-OOH-11: RFC capabilityRequest includes tool name as proposed alias
 *   TC-OOH-12: default instance is exported
 *   TC-OOH-13: Multiple handlers are isolated (no shared state)
 */

import { describe, it, expect } from 'vitest';
import {
  OneOffOperationHandler,
  defaultOneOffOperationHandler,
  type HITLRoutingResult,
  type OneOffAuditEntry,
} from './one-off-operation-handler.js';
import { RFCProcessor } from './rfc-processor.js';
import type { EdgeCaseContext } from './edge-case-registry.js';

// ─── Fixture helpers ───────────────────────────────────────────────────────────

/** Context for a tool name not in the registry. */
function unregisteredContext(
  overrides: Partial<EdgeCaseContext> = {},
): EdgeCaseContext {
  return {
    type: 'one-off-operation',
    command: 'custom_network_probe',
    metadata: { actor: 'agent-42', description: 'Custom network probe tool' },
    ...overrides,
  };
}

/** Context for an exec wrapper tool name. */
function execContext(toolName = 'bash'): EdgeCaseContext {
  return {
    type: 'one-off-operation',
    command: toolName,
  };
}

/** Context for a tool registered in the taxonomy (non-exec). */
function registeredContext(toolName = 'read_file'): EdgeCaseContext {
  return {
    type: 'one-off-operation',
    command: toolName,
  };
}

/** Returns a fixed-clock RFCProcessor + handler pair for deterministic tests. */
function fixedClockHandler(isoTs = '2026-01-15T12:00:00.000Z') {
  const clock = () => new Date(isoTs);
  const rfcProcessor = new RFCProcessor({ clock });
  const handler = new OneOffOperationHandler({ rfcProcessor, clock });
  return { handler, rfcProcessor, clock };
}

// ─── TC-OOH-01: Unregistered tool returns forbid decision ─────────────────────

describe('TC-OOH-01: unregistered tool returns forbid decision', () => {
  it('decision is forbid for an unregistered tool name', async () => {
    const { handler } = fixedClockHandler();
    const result = await handler.handle(unregisteredContext());

    expect(result.handled).toBe(true);
    expect(result.decision).toBe('forbid');
  });

  it('reason includes the tool name', async () => {
    const { handler } = fixedClockHandler();
    const result = await handler.handle(
      unregisteredContext({ command: 'mystery_tool_xyz' }),
    );

    expect(result.reason).toContain('mystery_tool_xyz');
  });

  it('case-insensitive tool name still returns forbid', async () => {
    const { handler } = fixedClockHandler();
    const result = await handler.handle(
      unregisteredContext({ command: 'CUSTOM_NETWORK_PROBE' }),
    );

    expect(result.decision).toBe('forbid');
  });
});

// ─── TC-OOH-02: Unregistered tool result includes HITL routing in metadata ────

describe('TC-OOH-02: unregistered tool result includes HITL routing in metadata', () => {
  it('metadata.hitlRouting is present', async () => {
    const { handler } = fixedClockHandler();
    const result = await handler.handle(unregisteredContext());

    expect(result.metadata).toBeDefined();
    expect(result.metadata!['hitlRouting']).toBeDefined();
  });

  it('hitlRouting.metaTool is request_new_capability', async () => {
    const { handler } = fixedClockHandler();
    const result = await handler.handle(unregisteredContext());

    const routing = result.metadata!['hitlRouting'] as HITLRoutingResult;
    expect(routing.metaTool).toBe('request_new_capability');
  });

  it('hitlRouting.toolName matches the submitted tool name', async () => {
    const { handler } = fixedClockHandler();
    const result = await handler.handle(
      unregisteredContext({ command: 'custom_network_probe' }),
    );

    const routing = result.metadata!['hitlRouting'] as HITLRoutingResult;
    expect(routing.toolName).toBe('custom_network_probe');
  });

  it('hitlRouting.requestId is a valid UUID', async () => {
    const { handler } = fixedClockHandler();
    const result = await handler.handle(unregisteredContext());

    const routing = result.metadata!['hitlRouting'] as HITLRoutingResult;
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(routing.requestId).toMatch(uuidPattern);
  });

  it('hitlRouting.rfcId matches metadata.rfc.id', async () => {
    const { handler } = fixedClockHandler();
    const result = await handler.handle(unregisteredContext());

    const routing = result.metadata!['hitlRouting'] as HITLRoutingResult;
    const rfc = result.metadata!['rfc'] as { id: string };
    expect(routing.rfcId).toBe(rfc.id);
  });
});

// ─── TC-OOH-03: Unregistered tool files an RFC via G-01 ───────────────────────

describe('TC-OOH-03: unregistered tool files an RFC via G-01', () => {
  it('metadata.rfc has status: open', async () => {
    const { handler } = fixedClockHandler();
    const result = await handler.handle(unregisteredContext());

    const rfc = result.metadata!['rfc'] as { status: string };
    expect(rfc.status).toBe('open');
  });

  it('RFC is retrievable from the rfcProcessor by ID', async () => {
    const { handler, rfcProcessor } = fixedClockHandler();
    const result = await handler.handle(unregisteredContext());

    const rfc = result.metadata!['rfc'] as { id: string };
    const retrieved = rfcProcessor.getById(rfc.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(rfc.id);
  });

  it('RFC requestor matches context.metadata.actor', async () => {
    const { handler } = fixedClockHandler();
    const result = await handler.handle(
      unregisteredContext({ metadata: { actor: 'my-agent' } }),
    );

    const rfc = result.metadata!['rfc'] as { requestor: string };
    expect(rfc.requestor).toBe('my-agent');
  });

  it('RFC requestor falls back to handler sentinel when actor is absent', async () => {
    const { handler } = fixedClockHandler();
    const result = await handler.handle(
      unregisteredContext({ metadata: undefined }),
    );

    const rfc = result.metadata!['rfc'] as { requestor: string };
    expect(rfc.requestor).toBe('one-off-operation-handler');
  });

  it('RFC title includes the tool name', async () => {
    const { handler } = fixedClockHandler();
    const result = await handler.handle(
      unregisteredContext({ command: 'mystery_probe' }),
    );

    const rfc = result.metadata!['rfc'] as { title: string };
    expect(rfc.title).toContain('mystery_probe');
  });
});

// ─── TC-OOH-04: Exec wrapper tool returns forbid without RFC filing ────────────

describe('TC-OOH-04: exec wrapper tool returns forbid without RFC filing', () => {
  it('bash returns forbid', async () => {
    const { handler } = fixedClockHandler();
    const result = await handler.handle(execContext('bash'));

    expect(result.decision).toBe('forbid');
  });

  it('exec forbid result does not include hitlRouting in metadata', async () => {
    const { handler } = fixedClockHandler();
    const result = await handler.handle(execContext('shell_exec'));

    // No RFC filing means no hitlRouting metadata
    expect(result.metadata?.['hitlRouting']).toBeUndefined();
  });

  it('no RFC is filed for exec wrapper tools', async () => {
    const { handler, rfcProcessor } = fixedClockHandler();
    await handler.handle(execContext('run_command'));

    expect(rfcProcessor.listAll()).toHaveLength(0);
  });

  it('exec wrapper reason mentions exec and never-fallback policy', async () => {
    const { handler } = fixedClockHandler();
    const result = await handler.handle(execContext('bash'));

    expect(result.reason).toContain('shell.exec');
    expect(result.reason).toContain('exec');
  });

  it('exec wrapper handled is true', async () => {
    const { handler } = fixedClockHandler();
    const result = await handler.handle(execContext('zsh'));

    expect(result.handled).toBe(true);
  });
});

// ─── TC-OOH-05: Registered non-exec tool defers ───────────────────────────────

describe('TC-OOH-05: registered non-exec tool defers', () => {
  it('decision is defer for a registered non-exec tool', async () => {
    const { handler } = fixedClockHandler();
    const result = await handler.handle(registeredContext('read_file'));

    expect(result.decision).toBe('defer');
  });

  it('defer result is handled: true', async () => {
    const { handler } = fixedClockHandler();
    const result = await handler.handle(registeredContext('read_file'));

    expect(result.handled).toBe(true);
  });

  it('no RFC is filed for a registered tool', async () => {
    const { handler, rfcProcessor } = fixedClockHandler();
    await handler.handle(registeredContext('read_file'));

    expect(rfcProcessor.listAll()).toHaveLength(0);
  });

  it('defer reason mentions the action class', async () => {
    const { handler } = fixedClockHandler();
    const result = await handler.handle(registeredContext('read_file'));

    expect(result.reason).toContain('filesystem.read');
  });

  it('registered tool is not added to listRequests', async () => {
    const { handler } = fixedClockHandler();
    await handler.handle(registeredContext('read_file'));

    expect(handler.listRequests()).toHaveLength(0);
  });
});

// ─── TC-OOH-06: One-off request is logged with tool name and RFC ID ───────────

describe('TC-OOH-06: one-off request is logged with tool name and RFC ID', () => {
  it('listRequests returns one entry after a single unregistered submission', async () => {
    const { handler } = fixedClockHandler();
    await handler.handle(unregisteredContext());

    expect(handler.listRequests()).toHaveLength(1);
  });

  it('request.toolName matches the submitted tool name', async () => {
    const { handler } = fixedClockHandler();
    await handler.handle(unregisteredContext({ command: 'my_tool' }));

    expect(handler.listRequests()[0]!.toolName).toBe('my_tool');
  });

  it('request.rfcId matches the RFC filed', async () => {
    const { handler } = fixedClockHandler();
    const result = await handler.handle(unregisteredContext());

    const rfc = result.metadata!['rfc'] as { id: string };
    expect(handler.listRequests()[0]!.rfcId).toBe(rfc.id);
  });

  it('request.actor matches context.metadata.actor', async () => {
    const { handler } = fixedClockHandler();
    await handler.handle(
      unregisteredContext({ metadata: { actor: 'agent-007' } }),
    );

    expect(handler.listRequests()[0]!.actor).toBe('agent-007');
  });

  it('request.requestedAt matches the clock timestamp', async () => {
    const ts = '2026-03-10T09:00:00.000Z';
    const { handler } = fixedClockHandler(ts);
    await handler.handle(unregisteredContext());

    expect(handler.listRequests()[0]!.requestedAt).toBe(ts);
  });

  it('request.description uses context.metadata.description when present', async () => {
    const { handler } = fixedClockHandler();
    await handler.handle(
      unregisteredContext({
        metadata: { description: 'Custom probe for network analysis' },
      }),
    );

    expect(handler.listRequests()[0]!.description).toBe(
      'Custom probe for network analysis',
    );
  });

  it('request.description falls back to derived description when absent', async () => {
    const { handler } = fixedClockHandler();
    await handler.handle(
      unregisteredContext({ command: 'probe_tool', metadata: {} }),
    );

    expect(handler.listRequests()[0]!.description).toContain('probe_tool');
  });
});

// ─── TC-OOH-07: Audit log records request_received, rfc_filed, hitl_routed ────

describe('TC-OOH-07: audit log records correct events', () => {
  it('unregistered tool appends request_received, rfc_filed, hitl_routed', async () => {
    const { handler } = fixedClockHandler();
    await handler.handle(unregisteredContext());

    const events = handler.getAuditLog().map((e) => e.event);
    expect(events).toEqual(['request_received', 'rfc_filed', 'hitl_routed']);
  });

  it('exec wrapper tool appends only request_received', async () => {
    const { handler } = fixedClockHandler();
    await handler.handle(execContext('bash'));

    const events = handler.getAuditLog().map((e) => e.event);
    expect(events).toEqual(['request_received']);
  });

  it('registered non-exec tool appends only request_received', async () => {
    const { handler } = fixedClockHandler();
    await handler.handle(registeredContext('read_file'));

    const events = handler.getAuditLog().map((e) => e.event);
    expect(events).toEqual(['request_received']);
  });

  it('request_received detail includes the tool name', async () => {
    const { handler } = fixedClockHandler();
    await handler.handle(unregisteredContext({ command: 'probe_xyz' }));

    const entry = handler.getAuditLog()[0]!;
    expect(entry.detail).toContain('probe_xyz');
  });

  it('rfc_filed detail includes the RFC ID', async () => {
    const { handler } = fixedClockHandler();
    const result = await handler.handle(unregisteredContext());

    const rfc = result.metadata!['rfc'] as { id: string };
    const rfcEntry = handler.getAuditLog().find((e) => e.event === 'rfc_filed')!;
    expect(rfcEntry.detail).toContain(rfc.id);
  });

  it('hitl_routed detail mentions request_new_capability', async () => {
    const { handler } = fixedClockHandler();
    await handler.handle(unregisteredContext());

    const hitlEntry = handler.getAuditLog().find((e) => e.event === 'hitl_routed')!;
    expect(hitlEntry.detail).toContain('request_new_capability');
  });

  it('all audit entries for a request share the same requestId', async () => {
    const { handler } = fixedClockHandler();
    await handler.handle(unregisteredContext());

    const log = handler.getAuditLog();
    const requestId = log[0]!.requestId;
    for (const entry of log) {
      expect(entry.requestId).toBe(requestId);
    }
  });
});

// ─── TC-OOH-08: hitlRouting.metaTool is always 'request_new_capability' ────────

describe('TC-OOH-08: hitlRouting.metaTool is always request_new_capability', () => {
  it('first unregistered tool has metaTool request_new_capability', async () => {
    const { handler } = fixedClockHandler();
    const result = await handler.handle(unregisteredContext());

    const routing = result.metadata!['hitlRouting'] as HITLRoutingResult;
    expect(routing.metaTool).toBe('request_new_capability');
  });

  it('second unregistered tool also has metaTool request_new_capability', async () => {
    const { handler } = fixedClockHandler();
    await handler.handle(unregisteredContext({ command: 'tool_a' }));
    const result = await handler.handle(
      unregisteredContext({ command: 'tool_b' }),
    );

    const routing = result.metadata!['hitlRouting'] as HITLRoutingResult;
    expect(routing.metaTool).toBe('request_new_capability');
  });
});

// ─── TC-OOH-09: listRequests returns snapshot ──────────────────────────────────

describe('TC-OOH-09: listRequests returns snapshot', () => {
  it('mutations to returned array do not affect internal state', async () => {
    const { handler } = fixedClockHandler();
    await handler.handle(unregisteredContext());

    const requests = handler.listRequests() as OneOffAuditEntry[];
    const originalLength = requests.length;
    (requests as unknown[]).push({ fake: true });

    expect(handler.listRequests()).toHaveLength(originalLength);
  });

  it('two unregistered submissions produce two request entries', async () => {
    const { handler } = fixedClockHandler();
    await handler.handle(unregisteredContext({ command: 'tool_one' }));
    await handler.handle(unregisteredContext({ command: 'tool_two' }));

    expect(handler.listRequests()).toHaveLength(2);
  });

  it('exec wrapper submissions are not included in listRequests', async () => {
    const { handler } = fixedClockHandler();
    await handler.handle(execContext('bash'));
    await handler.handle(unregisteredContext({ command: 'real_one_off' }));

    const requests = handler.listRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0]!.toolName).toBe('real_one_off');
  });
});

// ─── TC-OOH-10: getAuditLog returns snapshot ──────────────────────────────────

describe('TC-OOH-10: getAuditLog returns snapshot', () => {
  it('mutations to returned array do not affect internal state', async () => {
    const { handler } = fixedClockHandler();
    await handler.handle(unregisteredContext());

    const log = handler.getAuditLog() as OneOffAuditEntry[];
    const originalLength = log.length;
    (log as unknown[]).push({ fake: true });

    expect(handler.getAuditLog()).toHaveLength(originalLength);
  });

  it('empty on a fresh handler before any submissions', () => {
    const handler = new OneOffOperationHandler();
    expect(handler.getAuditLog()).toHaveLength(0);
  });
});

// ─── TC-OOH-11: RFC capabilityRequest includes tool name as proposed alias ─────

describe('TC-OOH-11: RFC capabilityRequest includes tool name as proposed alias', () => {
  it('proposedAliases contains the lower-cased tool name', async () => {
    const { handler, rfcProcessor } = fixedClockHandler();
    const result = await handler.handle(
      unregisteredContext({ command: 'MyCustomTool' }),
    );

    const rfc = result.metadata!['rfc'] as { id: string };
    const retrieved = rfcProcessor.getById(rfc.id);
    expect(retrieved!.capabilityRequest!.proposedAliases).toContain('mycustomtool');
  });

  it('proposedActionClass is derived from the tool name', async () => {
    const { handler, rfcProcessor } = fixedClockHandler();
    const result = await handler.handle(
      unregisteredContext({ command: 'custom_probe' }),
    );

    const rfc = result.metadata!['rfc'] as { id: string };
    const retrieved = rfcProcessor.getById(rfc.id);
    expect(retrieved!.capabilityRequest!.proposedActionClass).toContain('custom_probe');
  });

  it('riskLevel is high for unknown one-off operations', async () => {
    const { handler, rfcProcessor } = fixedClockHandler();
    const result = await handler.handle(unregisteredContext());

    const rfc = result.metadata!['rfc'] as { id: string };
    const retrieved = rfcProcessor.getById(rfc.id);
    expect(retrieved!.capabilityRequest!.riskLevel).toBe('high');
  });
});

// ─── TC-OOH-12: default instance is exported ──────────────────────────────────

describe('TC-OOH-12: default instance is exported', () => {
  it('defaultOneOffOperationHandler is an instance of OneOffOperationHandler', () => {
    expect(defaultOneOffOperationHandler).toBeInstanceOf(OneOffOperationHandler);
  });

  it('defaultOneOffOperationHandler exposes handle, listRequests, getAuditLog', () => {
    expect(typeof defaultOneOffOperationHandler.handle).toBe('function');
    expect(typeof defaultOneOffOperationHandler.listRequests).toBe('function');
    expect(typeof defaultOneOffOperationHandler.getAuditLog).toBe('function');
  });

  it('edgeCaseType is one-off-operation', () => {
    expect(defaultOneOffOperationHandler.edgeCaseType).toBe('one-off-operation');
  });
});

// ─── TC-OOH-13: Multiple handlers are isolated ─────────────────────────────────

describe('TC-OOH-13: multiple handlers have isolated state', () => {
  it('requests logged in handlerA are not visible in handlerB', async () => {
    const handlerA = new OneOffOperationHandler();
    const handlerB = new OneOffOperationHandler();

    await handlerA.handle(unregisteredContext({ command: 'isolated_tool' }));

    expect(handlerA.listRequests()).toHaveLength(1);
    expect(handlerB.listRequests()).toHaveLength(0);
  });

  it('audit entries in handlerA are not visible in handlerB', async () => {
    const handlerA = new OneOffOperationHandler();
    const handlerB = new OneOffOperationHandler();

    await handlerA.handle(unregisteredContext());

    expect(handlerA.getAuditLog().length).toBeGreaterThan(0);
    expect(handlerB.getAuditLog()).toHaveLength(0);
  });

  it('RFC filed in handlerA is not in handlerB rfcProcessor', async () => {
    const rfcA = new RFCProcessor();
    const rfcB = new RFCProcessor();
    const handlerA = new OneOffOperationHandler({ rfcProcessor: rfcA });
    const handlerB = new OneOffOperationHandler({ rfcProcessor: rfcB });

    await handlerA.handle(unregisteredContext());

    expect(rfcA.listAll()).toHaveLength(1);
    expect(rfcB.listAll()).toHaveLength(0);
  });
});
