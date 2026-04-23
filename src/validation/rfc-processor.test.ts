/**
 * RFCProcessor test suite (G-01).
 *
 * Covers:
 *   TC-RFC-01  file() creates RFC with correct fields and status
 *   TC-RFC-02  file() computes slaDeadline as 14 days from createdAt
 *   TC-RFC-03  file() dispatches acknowledgment notification to requestor
 *   TC-RFC-04  file() appends rfc_created and notification_sent audit entries
 *   TC-RFC-05  file() attaches triggerContext and capabilityRequest when supplied
 *   TC-RFC-06  updateStatus() transitions status and appends audit entry
 *   TC-RFC-07  updateStatus() dispatches resolution notification on terminal status
 *   TC-RFC-08  updateStatus() dispatches status_update for non-terminal transitions
 *   TC-RFC-09  updateStatus() throws for unknown RFC id
 *   TC-RFC-10  checkSLA() marks overdue open RFCs as slaBreached
 *   TC-RFC-11  checkSLA() dispatches sla_warning notification on breach
 *   TC-RFC-12  checkSLA() does not re-breach already-breached RFCs
 *   TC-RFC-13  checkSLA() skips resolved RFCs regardless of deadline
 *   TC-RFC-14  listOpen() excludes terminal-status RFCs
 *   TC-RFC-15  listSLABreached() returns only unresolved breached RFCs
 *   TC-RFC-16  notify callback errors are caught and recorded in audit trail
 *   TC-RFC-17  importRFC() restores an RFC into the store
 *   TC-RFC-18  defaultRFCProcessor is a shared RFCProcessor instance
 *   TC-RFC-19  SLA_DAYS constant equals 14
 *   TC-RFC-20  Multiple RFCs are stored and listed independently
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RFCProcessor,
  RFC_SLA_DAYS,
  defaultRFCProcessor,
  type RFC,
  type RFCSubmission,
  type RFCNotification,
  type CapabilityRequest,
} from './rfc-processor.js';
import type { EdgeCaseContext } from './edge-case-registry.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE_DATE = new Date('2025-01-01T00:00:00.000Z');
const SLA_DATE  = new Date('2025-01-15T00:00:00.000Z'); // BASE_DATE + 14 days

function makeClock(date: Date = BASE_DATE): () => Date {
  return () => date;
}

function makeSubmission(overrides: Partial<RFCSubmission> = {}): RFCSubmission {
  return {
    title: 'Add network.dns.query capability',
    description: 'DNS resolution needed for external connectivity checks.',
    requestor: 'agent-47',
    ...overrides,
  };
}

function makeCapabilityRequest(): CapabilityRequest {
  return {
    proposedActionClass: 'network.dns.query',
    proposedAliases: ['nslookup', 'dig'],
    riskLevel: 'medium',
  };
}

function makeEdgeCaseContext(): EdgeCaseContext {
  return {
    type: 'one-off-operation',
    command: 'nslookup example.com',
    metadata: { source: 'compound-operation-handler' },
  };
}

// ─── TC-RFC-01: file() creates RFC with correct fields ────────────────────────

describe('TC-RFC-01: file() creates RFC with correct initial fields', () => {
  it('assigns a UUID id', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const rfc = await processor.file(makeSubmission());
    expect(rfc.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('sets initial status to "open"', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const rfc = await processor.file(makeSubmission());
    expect(rfc.status).toBe('open');
  });

  it('sets createdAt and updatedAt to the clock value', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const rfc = await processor.file(makeSubmission());
    expect(rfc.createdAt).toBe(BASE_DATE.toISOString());
    expect(rfc.updatedAt).toBe(BASE_DATE.toISOString());
  });

  it('copies title, description, and requestor from submission', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const sub = makeSubmission();
    const rfc = await processor.file(sub);
    expect(rfc.title).toBe(sub.title);
    expect(rfc.description).toBe(sub.description);
    expect(rfc.requestor).toBe(sub.requestor);
  });

  it('initialises slaBreached to false', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const rfc = await processor.file(makeSubmission());
    expect(rfc.slaBreached).toBe(false);
  });

  it('initialises auditTrail and notifications as arrays', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const rfc = await processor.file(makeSubmission());
    expect(Array.isArray(rfc.auditTrail)).toBe(true);
    expect(Array.isArray(rfc.notifications)).toBe(true);
  });
});

// ─── TC-RFC-02: slaDeadline is 14 days from createdAt ────────────────────────

describe('TC-RFC-02: file() computes slaDeadline as RFC_SLA_DAYS from createdAt', () => {
  it('slaDeadline equals BASE_DATE + 14 days', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const rfc = await processor.file(makeSubmission());
    expect(rfc.slaDeadline).toBe(SLA_DATE.toISOString());
  });

  it('RFC_SLA_DAYS constant is 14', () => {
    expect(RFC_SLA_DAYS).toBe(14);
  });

  it('RFCProcessor.SLA_DAYS static constant is 14', () => {
    expect(RFCProcessor.SLA_DAYS).toBe(14);
  });
});

// ─── TC-RFC-03: file() dispatches acknowledgment notification ─────────────────

describe('TC-RFC-03: file() dispatches acknowledgment notification', () => {
  it('sends one notification with type "acknowledgment"', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const rfc = await processor.file(makeSubmission());
    const ack = rfc.notifications.find((n) => n.type === 'acknowledgment');
    expect(ack).toBeDefined();
    expect(ack!.recipient).toBe('agent-47');
  });

  it('acknowledgment message includes the RFC id and slaDeadline', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const rfc = await processor.file(makeSubmission());
    const ack = rfc.notifications[0];
    expect(ack.message).toContain(rfc.id);
    expect(ack.message).toContain(rfc.slaDeadline);
  });

  it('invokes the notify callback for the acknowledgment', async () => {
    const notifyCalls: Array<{ notification: RFCNotification; rfc: RFC }> = [];
    const processor = new RFCProcessor({
      clock: makeClock(),
      notify: async (n, r) => { notifyCalls.push({ notification: n, rfc: r }); },
    });
    await processor.file(makeSubmission());
    expect(notifyCalls).toHaveLength(1);
    expect(notifyCalls[0].notification.type).toBe('acknowledgment');
  });
});

// ─── TC-RFC-04: file() appends audit entries ──────────────────────────────────

describe('TC-RFC-04: file() appends rfc_created and notification_sent audit entries', () => {
  it('audit trail has at least two entries after filing', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const rfc = await processor.file(makeSubmission());
    expect(rfc.auditTrail.length).toBeGreaterThanOrEqual(2);
  });

  it('first audit entry has event "rfc_created"', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const rfc = await processor.file(makeSubmission());
    expect(rfc.auditTrail[0].event).toBe('rfc_created');
  });

  it('rfc_created audit entry records requestor as actor', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const rfc = await processor.file(makeSubmission());
    expect(rfc.auditTrail[0].actor).toBe('agent-47');
  });

  it('audit trail contains a notification_sent entry after filing', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const rfc = await processor.file(makeSubmission());
    const notifAudit = rfc.auditTrail.find((e) => e.event === 'notification_sent');
    expect(notifAudit).toBeDefined();
  });

  it('all audit entries have ISO 8601 timestamps', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const rfc = await processor.file(makeSubmission());
    for (const entry of rfc.auditTrail) {
      expect(() => new Date(entry.ts)).not.toThrow();
      expect(new Date(entry.ts).toISOString()).toBe(entry.ts);
    }
  });
});

// ─── TC-RFC-05: file() attaches optional fields ───────────────────────────────

describe('TC-RFC-05: file() attaches triggerContext and capabilityRequest', () => {
  it('attaches triggerContext when supplied', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const ctx = makeEdgeCaseContext();
    const rfc = await processor.file(makeSubmission({ triggerContext: ctx }));
    expect(rfc.triggerContext).toStrictEqual(ctx);
  });

  it('triggerContext is absent when not supplied', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const rfc = await processor.file(makeSubmission());
    expect(rfc.triggerContext).toBeUndefined();
  });

  it('attaches capabilityRequest when supplied', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const cap = makeCapabilityRequest();
    const rfc = await processor.file(makeSubmission({ capabilityRequest: cap }));
    expect(rfc.capabilityRequest).toStrictEqual(cap);
  });

  it('capabilityRequest is absent when not supplied', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const rfc = await processor.file(makeSubmission());
    expect(rfc.capabilityRequest).toBeUndefined();
  });

  it('both triggerContext and capabilityRequest can be attached together', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const rfc = await processor.file(
      makeSubmission({
        triggerContext: makeEdgeCaseContext(),
        capabilityRequest: makeCapabilityRequest(),
      }),
    );
    expect(rfc.triggerContext).toBeDefined();
    expect(rfc.capabilityRequest).toBeDefined();
  });
});

// ─── TC-RFC-06: updateStatus() transitions status ────────────────────────────

describe('TC-RFC-06: updateStatus() transitions status and appends audit entry', () => {
  it('transitions from open to in_review', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const rfc = await processor.file(makeSubmission());
    await processor.updateStatus(rfc.id, 'in_review', 'reviewer-1');
    expect(rfc.status).toBe('in_review');
  });

  it('transitions from in_review to approved', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const rfc = await processor.file(makeSubmission());
    await processor.updateStatus(rfc.id, 'in_review');
    await processor.updateStatus(rfc.id, 'approved', 'lead-reviewer');
    expect(rfc.status).toBe('approved');
  });

  it('appends status_changed audit entry with previous and new status', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const rfc = await processor.file(makeSubmission());
    await processor.updateStatus(rfc.id, 'in_review', 'reviewer-1');
    const changeEntry = rfc.auditTrail.find((e) => e.event === 'status_changed');
    expect(changeEntry).toBeDefined();
    expect(changeEntry!.detail).toContain('open');
    expect(changeEntry!.detail).toContain('in_review');
    expect(changeEntry!.actor).toBe('reviewer-1');
  });

  it('updates updatedAt on status change', async () => {
    let tick = 0;
    const clock = () => new Date(BASE_DATE.getTime() + tick++ * 1000);
    const processor = new RFCProcessor({ clock });
    const rfc = await processor.file(makeSubmission());
    const beforeUpdate = rfc.updatedAt;
    await processor.updateStatus(rfc.id, 'in_review');
    expect(rfc.updatedAt).not.toBe(beforeUpdate);
  });

  it('returns the mutated RFC', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const rfc = await processor.file(makeSubmission());
    const returned = await processor.updateStatus(rfc.id, 'approved');
    expect(returned).toBe(rfc);
  });
});

// ─── TC-RFC-07: updateStatus() dispatches resolution notification ─────────────

describe('TC-RFC-07: updateStatus() dispatches resolution notification on terminal status', () => {
  it.each<RFCStatus>(['approved', 'rejected', 'implemented'])(
    'dispatches "resolution" notification for status "%s"',
    async (terminalStatus) => {
      const processor = new RFCProcessor({ clock: makeClock() });
      const rfc = await processor.file(makeSubmission());
      await processor.updateStatus(rfc.id, terminalStatus);
      const resolutionNotif = rfc.notifications.find((n) => n.type === 'resolution');
      expect(resolutionNotif).toBeDefined();
    },
  );

  it('resolution notification contains the terminal status', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const rfc = await processor.file(makeSubmission());
    await processor.updateStatus(rfc.id, 'approved');
    const notif = rfc.notifications.find((n) => n.type === 'resolution');
    expect(notif!.message).toContain('approved');
  });
});

// ─── TC-RFC-08: updateStatus() dispatches status_update for non-terminal ──────

describe('TC-RFC-08: updateStatus() dispatches status_update for non-terminal status', () => {
  it.each<RFCStatus>(['in_review'])(
    'dispatches "status_update" notification for status "%s"',
    async (nonTerminal) => {
      const processor = new RFCProcessor({ clock: makeClock() });
      const rfc = await processor.file(makeSubmission());
      await processor.updateStatus(rfc.id, nonTerminal);
      const updateNotif = rfc.notifications.find((n) => n.type === 'status_update');
      expect(updateNotif).toBeDefined();
    },
  );
});

// ─── TC-RFC-09: updateStatus() throws for unknown id ─────────────────────────

describe('TC-RFC-09: updateStatus() throws when RFC id is not found', () => {
  it('throws with a message containing the unknown id', async () => {
    const processor = new RFCProcessor();
    await expect(processor.updateStatus('nonexistent-id', 'approved')).rejects.toThrow(
      'nonexistent-id',
    );
  });
});

// ─── TC-RFC-10: checkSLA() marks overdue RFCs as breached ────────────────────

describe('TC-RFC-10: checkSLA() marks overdue open RFCs as slaBreached', () => {
  it('marks an open RFC past its deadline as slaBreached', async () => {
    const processor = new RFCProcessor({ clock: makeClock(BASE_DATE) });
    const rfc = await processor.file(makeSubmission());

    // Advance clock beyond SLA
    const afterSLA = new RFCProcessor({ clock: makeClock(new Date('2025-01-16T00:00:00.000Z')) });
    afterSLA.importRFC(rfc);
    await afterSLA.checkSLA();

    expect(rfc.slaBreached).toBe(true);
  });

  it('does not mark an RFC as breached when deadline has not passed', async () => {
    const processor = new RFCProcessor({ clock: makeClock(BASE_DATE) });
    const rfc = await processor.file(makeSubmission());

    // Advance clock to exactly the deadline (not past)
    const onDeadline = new RFCProcessor({ clock: makeClock(SLA_DATE) });
    onDeadline.importRFC(rfc);
    await onDeadline.checkSLA();

    expect(rfc.slaBreached).toBe(false);
  });

  it('appends sla_breached audit entry when breach is detected', async () => {
    const processor = new RFCProcessor({ clock: makeClock(BASE_DATE) });
    const rfc = await processor.file(makeSubmission());

    const afterSLA = new RFCProcessor({ clock: makeClock(new Date('2025-01-16T00:00:00.000Z')) });
    afterSLA.importRFC(rfc);
    await afterSLA.checkSLA();

    const breachEntry = rfc.auditTrail.find((e) => e.event === 'sla_breached');
    expect(breachEntry).toBeDefined();
    expect(breachEntry!.actor).toBe('system');
  });
});

// ─── TC-RFC-11: checkSLA() dispatches sla_warning on breach ──────────────────

describe('TC-RFC-11: checkSLA() dispatches sla_warning notification on breach', () => {
  it('sends a sla_warning notification to the requestor', async () => {
    const processor = new RFCProcessor({ clock: makeClock(BASE_DATE) });
    const rfc = await processor.file(makeSubmission());

    const afterSLA = new RFCProcessor({ clock: makeClock(new Date('2025-01-16T00:00:00.000Z')) });
    afterSLA.importRFC(rfc);
    await afterSLA.checkSLA();

    const warning = rfc.notifications.find((n) => n.type === 'sla_warning');
    expect(warning).toBeDefined();
    expect(warning!.recipient).toBe('agent-47');
  });

  it('sla_warning message mentions the deadline', async () => {
    const processor = new RFCProcessor({ clock: makeClock(BASE_DATE) });
    const rfc = await processor.file(makeSubmission());

    const afterSLA = new RFCProcessor({ clock: makeClock(new Date('2025-01-16T00:00:00.000Z')) });
    afterSLA.importRFC(rfc);
    await afterSLA.checkSLA();

    const warning = rfc.notifications.find((n) => n.type === 'sla_warning');
    expect(warning!.message).toContain(rfc.slaDeadline);
  });
});

// ─── TC-RFC-12: checkSLA() does not re-breach already-breached RFCs ──────────

describe('TC-RFC-12: checkSLA() does not re-breach already-breached RFCs', () => {
  it('does not add a second sla_breached audit entry', async () => {
    const processor = new RFCProcessor({ clock: makeClock(BASE_DATE) });
    const rfc = await processor.file(makeSubmission());

    const afterSLA = new RFCProcessor({ clock: makeClock(new Date('2025-01-20T00:00:00.000Z')) });
    afterSLA.importRFC(rfc);
    await afterSLA.checkSLA();
    await afterSLA.checkSLA(); // second call

    const breachEntries = rfc.auditTrail.filter((e) => e.event === 'sla_breached');
    expect(breachEntries).toHaveLength(1);
  });
});

// ─── TC-RFC-13: checkSLA() skips resolved RFCs ───────────────────────────────

describe('TC-RFC-13: checkSLA() skips resolved RFCs regardless of deadline', () => {
  it.each<RFCStatus>(['approved', 'rejected', 'implemented'])(
    'does not breach a "%s" RFC past its deadline',
    async (terminalStatus) => {
      const processor = new RFCProcessor({ clock: makeClock(BASE_DATE) });
      const rfc = await processor.file(makeSubmission());
      await processor.updateStatus(rfc.id, terminalStatus);

      const afterSLA = new RFCProcessor({ clock: makeClock(new Date('2025-01-20T00:00:00.000Z')) });
      afterSLA.importRFC(rfc);
      await afterSLA.checkSLA();

      expect(rfc.slaBreached).toBe(false);
    },
  );
});

// ─── TC-RFC-14: listOpen() excludes terminal RFCs ────────────────────────────

describe('TC-RFC-14: listOpen() excludes terminal-status RFCs', () => {
  it('includes open and in_review RFCs', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const rfc1 = await processor.file(makeSubmission({ title: 'RFC 1', requestor: 'a' }));
    const rfc2 = await processor.file(makeSubmission({ title: 'RFC 2', requestor: 'b' }));
    await processor.updateStatus(rfc2.id, 'in_review');

    const open = processor.listOpen();
    expect(open).toContain(rfc1);
    expect(open).toContain(rfc2);
  });

  it('excludes approved, rejected, and implemented RFCs', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const rfc1 = await processor.file(makeSubmission({ title: 'RFC A', requestor: 'a' }));
    const rfc2 = await processor.file(makeSubmission({ title: 'RFC B', requestor: 'b' }));
    const rfc3 = await processor.file(makeSubmission({ title: 'RFC C', requestor: 'c' }));
    await processor.updateStatus(rfc1.id, 'approved');
    await processor.updateStatus(rfc2.id, 'rejected');
    await processor.updateStatus(rfc3.id, 'implemented');

    const open = processor.listOpen();
    expect(open).not.toContain(rfc1);
    expect(open).not.toContain(rfc2);
    expect(open).not.toContain(rfc3);
  });
});

// ─── TC-RFC-15: listSLABreached() ────────────────────────────────────────────

describe('TC-RFC-15: listSLABreached() returns unresolved breached RFCs', () => {
  it('returns a breached open RFC', async () => {
    const processor = new RFCProcessor({ clock: makeClock(BASE_DATE) });
    const rfc = await processor.file(makeSubmission());

    const afterSLA = new RFCProcessor({ clock: makeClock(new Date('2025-01-20T00:00:00.000Z')) });
    afterSLA.importRFC(rfc);
    await afterSLA.checkSLA();

    expect(afterSLA.listSLABreached()).toContain(rfc);
  });

  it('excludes resolved breached RFCs', async () => {
    const processor = new RFCProcessor({ clock: makeClock(BASE_DATE) });
    const rfc = await processor.file(makeSubmission());

    const afterSLA = new RFCProcessor({ clock: makeClock(new Date('2025-01-20T00:00:00.000Z')) });
    afterSLA.importRFC(rfc);
    await afterSLA.checkSLA();
    await afterSLA.updateStatus(rfc.id, 'rejected');

    expect(afterSLA.listSLABreached()).not.toContain(rfc);
  });

  it('returns empty array when no RFCs are breached', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    await processor.file(makeSubmission());
    expect(processor.listSLABreached()).toHaveLength(0);
  });
});

// ─── TC-RFC-16: notify callback errors are caught ────────────────────────────

describe('TC-RFC-16: notify callback errors are caught and recorded in audit trail', () => {
  it('does not throw when the notify callback rejects', async () => {
    const processor = new RFCProcessor({
      clock: makeClock(),
      notify: async () => { throw new Error('notify failed'); },
    });
    await expect(processor.file(makeSubmission())).resolves.toBeDefined();
  });

  it('records the failure in the audit trail', async () => {
    const processor = new RFCProcessor({
      clock: makeClock(),
      notify: async () => { throw new Error('delivery error'); },
    });
    const rfc = await processor.file(makeSubmission());
    const failEntry = rfc.auditTrail.find(
      (e) => e.event === 'notification_sent' && e.detail.includes('delivery error'),
    );
    expect(failEntry).toBeDefined();
  });
});

// ─── TC-RFC-17: importRFC() restores an RFC ──────────────────────────────────

describe('TC-RFC-17: importRFC() restores an RFC into the store', () => {
  it('getById returns the imported RFC', async () => {
    const source = new RFCProcessor({ clock: makeClock() });
    const rfc = await source.file(makeSubmission());

    const target = new RFCProcessor({ clock: makeClock() });
    target.importRFC(rfc);

    expect(target.getById(rfc.id)).toBe(rfc);
  });

  it('listAll() includes the imported RFC', async () => {
    const source = new RFCProcessor({ clock: makeClock() });
    const rfc = await source.file(makeSubmission());

    const target = new RFCProcessor({ clock: makeClock() });
    target.importRFC(rfc);

    expect(target.listAll()).toContain(rfc);
  });

  it('importing an RFC with an existing id replaces the old one', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const rfc = await processor.file(makeSubmission());
    const updated = { ...rfc, status: 'approved' as const };

    processor.importRFC(updated);

    expect(processor.getById(rfc.id)!.status).toBe('approved');
  });
});

// ─── TC-RFC-18: defaultRFCProcessor ──────────────────────────────────────────

describe('TC-RFC-18: defaultRFCProcessor is a shared RFCProcessor instance', () => {
  it('is an instance of RFCProcessor', () => {
    expect(defaultRFCProcessor).toBeInstanceOf(RFCProcessor);
  });
});

// ─── TC-RFC-19: SLA_DAYS ─────────────────────────────────────────────────────

describe('TC-RFC-19: SLA constants', () => {
  it('RFC_SLA_DAYS named export equals 14', () => {
    expect(RFC_SLA_DAYS).toBe(14);
  });

  it('RFCProcessor.SLA_DAYS static equals 14', () => {
    expect(RFCProcessor.SLA_DAYS).toBe(14);
  });
});

// ─── TC-RFC-20: multiple RFCs are stored independently ───────────────────────

describe('TC-RFC-20: multiple RFCs are stored and listed independently', () => {
  it('listAll() returns all filed RFCs', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const rfc1 = await processor.file(makeSubmission({ title: 'RFC 1', requestor: 'a' }));
    const rfc2 = await processor.file(makeSubmission({ title: 'RFC 2', requestor: 'b' }));
    const rfc3 = await processor.file(makeSubmission({ title: 'RFC 3', requestor: 'c' }));

    const all = processor.listAll();
    expect(all).toHaveLength(3);
    expect(all).toContain(rfc1);
    expect(all).toContain(rfc2);
    expect(all).toContain(rfc3);
  });

  it('each RFC has a unique id', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const ids = await Promise.all([
      processor.file(makeSubmission({ requestor: 'a' })).then((r) => r.id),
      processor.file(makeSubmission({ requestor: 'b' })).then((r) => r.id),
      processor.file(makeSubmission({ requestor: 'c' })).then((r) => r.id),
    ]);
    expect(new Set(ids).size).toBe(3);
  });

  it('updating one RFC does not affect others', async () => {
    const processor = new RFCProcessor({ clock: makeClock() });
    const rfc1 = await processor.file(makeSubmission({ title: 'RFC 1', requestor: 'a' }));
    const rfc2 = await processor.file(makeSubmission({ title: 'RFC 2', requestor: 'b' }));

    await processor.updateStatus(rfc1.id, 'approved');

    expect(rfc2.status).toBe('open');
  });

  it('two processor instances do not share state', async () => {
    const processorA = new RFCProcessor({ clock: makeClock() });
    const processorB = new RFCProcessor({ clock: makeClock() });

    await processorA.file(makeSubmission({ requestor: 'a' }));

    expect(processorA.listAll()).toHaveLength(1);
    expect(processorB.listAll()).toHaveLength(0);
  });
});
