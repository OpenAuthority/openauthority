/**
 * RFC process automation (G-01).
 *
 * Provides automated RFC filing, tracking, SLA enforcement, status notifications,
 * and audit-trail recording for capability-gap requests surfaced by edge case
 * handlers. Intended for use as part of the capability-addition workflow.
 *
 * SLA: 2 weeks (14 calendar days) from filing date.
 *
 * Integration points:
 *   - `EdgeCaseContext` — attach via `triggerContext` when filing from a handler.
 *   - `capabilityRequest` — structured proposal for adding a new action class.
 *   - `notify` callback — supply a function to forward notifications (Slack,
 *     email, etc.). Absent by default; notifications are recorded in the audit
 *     trail regardless.
 *
 * Terminology:
 *   - "breach" means the SLA deadline has passed without resolution.
 *   - "resolution" means the RFC reached `approved`, `rejected`, or
 *     `implemented` status.
 *
 * @see EdgeCaseRegistry  (src/validation/edge-case-registry.ts)
 * @see T92, T96
 */

import { randomUUID } from 'node:crypto';
import type { EdgeCaseContext } from './edge-case-registry.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** SLA window in calendar days. */
export const RFC_SLA_DAYS = 14;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Lifecycle status of an RFC. */
export type RFCStatus = 'open' | 'in_review' | 'approved' | 'rejected' | 'implemented';

/** Structured proposal to extend the action-registry with a new capability. */
export interface CapabilityRequest {
  /** Proposed canonical action class (e.g. `network.dns.query`). */
  readonly proposedActionClass: string;
  /** Proposed tool name aliases for the new class. */
  readonly proposedAliases: readonly string[];
  /** Anticipated default risk level for the new capability. */
  readonly riskLevel: string;
}

/** A single entry in an RFC's immutable audit trail. */
export interface RFCAuditEntry {
  /** ISO 8601 timestamp of the event. */
  readonly ts: string;
  /** Event type. */
  readonly event:
    | 'rfc_created'
    | 'status_changed'
    | 'notification_sent'
    | 'sla_breached';
  /** Human-readable detail of what occurred. */
  readonly detail: string;
  /** Actor that caused the event (system, requestor, reviewer, etc.). */
  readonly actor?: string;
}

/** Notification emitted by the processor and delivered via the notify callback. */
export interface RFCNotification {
  /** ISO 8601 timestamp. */
  readonly ts: string;
  /** Recipient identifier (e.g. email address, Slack channel, user ID). */
  readonly recipient: string;
  /** Notification category. */
  readonly type:
    | 'acknowledgment'
    | 'status_update'
    | 'sla_warning'
    | 'resolution';
  /** Notification message body. */
  readonly message: string;
}

/** A filed RFC record managed by `RFCProcessor`. */
export interface RFC {
  /** UUID v4 identifier. */
  readonly id: string;
  /** Short title describing the capability gap or change request. */
  readonly title: string;
  /** Full description of the request. */
  readonly description: string;
  /** Identifier of the party that filed the RFC (e.g. user ID, agent ID). */
  readonly requestor: string;
  /** Current lifecycle status. */
  status: RFCStatus;
  /** ISO 8601 timestamp when the RFC was filed. */
  readonly createdAt: string;
  /** ISO 8601 timestamp of the most recent status change. */
  updatedAt: string;
  /** ISO 8601 deadline for 2-week SLA resolution. */
  readonly slaDeadline: string;
  /** `true` once the SLA deadline has passed without resolution. */
  slaBreached: boolean;
  /**
   * Edge case context that triggered this RFC, when filed automatically from
   * an edge case handler.
   */
  readonly triggerContext?: EdgeCaseContext;
  /**
   * Structured capability addition proposal; present when the RFC requests a
   * new action class to be added to the registry.
   */
  readonly capabilityRequest?: CapabilityRequest;
  /** Ordered audit trail. Entries are appended and never mutated. */
  readonly auditTrail: RFCAuditEntry[];
  /**
   * All notifications sent for this RFC, in dispatch order.
   * Includes both delivered and attempted (when notify callback is absent).
   */
  readonly notifications: RFCNotification[];
}

/**
 * Fields required to file a new RFC.
 *
 * `id`, `createdAt`, `slaDeadline`, and `status` are assigned by the processor.
 */
export interface RFCSubmission {
  /** Short title describing the capability gap or change request. */
  readonly title: string;
  /** Full description of the request. */
  readonly description: string;
  /** Identifier of the filing party (user ID, agent ID, etc.). */
  readonly requestor: string;
  /** Edge case context that triggered this RFC, if applicable. */
  readonly triggerContext?: EdgeCaseContext;
  /** Capability addition proposal, if applicable. */
  readonly capabilityRequest?: CapabilityRequest;
}

/**
 * Callback invoked whenever `RFCProcessor` dispatches a notification.
 *
 * The callback receives the notification record and the full RFC it belongs to.
 * Implementations may deliver via Slack, email, webhook, etc.
 * Throwing from this callback is safe — the processor catches and records the
 * error in the audit trail.
 */
export type NotifyFn = (notification: RFCNotification, rfc: RFC) => Promise<void>;

/** Options for constructing an `RFCProcessor`. */
export interface RFCProcessorOptions {
  /**
   * Clock function returning the current `Date`. Overridable in tests to
   * simulate time without mocking globals.
   *
   * @default () => new Date()
   */
  readonly clock?: () => Date;
  /**
   * Notification delivery callback. When absent, notifications are recorded
   * in the RFC's `notifications` array and audit trail but not delivered.
   */
  readonly notify?: NotifyFn;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true when the RFC is in a terminal (resolved) status. */
function isResolved(status: RFCStatus): boolean {
  return status === 'approved' || status === 'rejected' || status === 'implemented';
}

/** Adds `days` calendar days to `from` and returns the resulting ISO string. */
function addDays(from: Date, days: number): string {
  const result = new Date(from.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString();
}

// ─── RFCProcessor ─────────────────────────────────────────────────────────────

/**
 * Manages the full lifecycle of RFC records: filing, SLA tracking, status
 * transitions, notifications, and audit logging.
 *
 * Each processor instance maintains its own in-memory store. For persistence
 * across restarts, callers must serialise `listAll()` and restore via
 * `importRFC()`.
 *
 * @example
 * ```ts
 * const processor = new RFCProcessor({
 *   notify: async (n, rfc) => slackClient.post(n.message),
 * });
 *
 * const rfc = await processor.file({
 *   title: 'Add network.dns.query capability',
 *   description: 'DNS resolution needed for external connectivity checks.',
 *   requestor: 'agent-47',
 *   capabilityRequest: {
 *     proposedActionClass: 'network.dns.query',
 *     proposedAliases: ['nslookup', 'dig'],
 *     riskLevel: 'medium',
 *   },
 * });
 *
 * await processor.updateStatus(rfc.id, 'in_review', 'reviewer-1');
 * await processor.checkSLA(); // marks breached RFCs
 * ```
 */
export class RFCProcessor {
  /** SLA window in calendar days (public for callers and tests). */
  static readonly SLA_DAYS = RFC_SLA_DAYS;

  private readonly store = new Map<string, RFC>();
  private readonly clock: () => Date;
  private readonly notify?: NotifyFn;

  constructor(options: RFCProcessorOptions = {}) {
    this.clock = options.clock ?? (() => new Date());
    if (options.notify !== undefined) {
      this.notify = options.notify;
    }
  }

  // ── Filing ─────────────────────────────────────────────────────────────────

  /**
   * Files a new RFC and dispatches an acknowledgment notification to the
   * requestor.
   *
   * The RFC is assigned a UUID, a `createdAt` timestamp, and a `slaDeadline`
   * set to `RFC_SLA_DAYS` calendar days from now. Initial status is `'open'`.
   *
   * @param submission  Fields provided by the requestor or edge case handler.
   * @returns           The created RFC record.
   */
  async file(submission: RFCSubmission): Promise<RFC> {
    const now = this.clock();
    const id = randomUUID();
    const createdAt = now.toISOString();
    const slaDeadline = addDays(now, RFC_SLA_DAYS);

    const rfc: RFC = {
      id,
      title: submission.title,
      description: submission.description,
      requestor: submission.requestor,
      status: 'open',
      createdAt,
      updatedAt: createdAt,
      slaDeadline,
      slaBreached: false,
      ...(submission.triggerContext !== undefined
        ? { triggerContext: submission.triggerContext }
        : {}),
      ...(submission.capabilityRequest !== undefined
        ? { capabilityRequest: submission.capabilityRequest }
        : {}),
      auditTrail: [],
      notifications: [],
    };

    this.appendAudit(rfc, {
      event: 'rfc_created',
      detail: `RFC filed by ${submission.requestor}: "${submission.title}"`,
      actor: submission.requestor,
    });

    this.store.set(id, rfc);

    await this.dispatchNotification(rfc, {
      recipient: submission.requestor,
      type: 'acknowledgment',
      message:
        `RFC ${id} received: "${submission.title}". ` +
        `SLA deadline: ${slaDeadline}. We will notify you of status changes.`,
    });

    return rfc;
  }

  // ── Status management ──────────────────────────────────────────────────────

  /**
   * Transitions an RFC to a new status and appends an audit entry.
   *
   * Dispatches a `resolution` notification when the RFC reaches a terminal
   * status (`approved`, `rejected`, `implemented`), or a `status_update`
   * notification for non-terminal transitions.
   *
   * @param id      RFC identifier.
   * @param status  Target status.
   * @param actor   Optional identifier of the party making the change.
   * @returns       The updated RFC.
   * @throws        If no RFC with the given ID exists.
   */
  async updateStatus(id: string, status: RFCStatus, actor?: string): Promise<RFC> {
    const rfc = this.getById(id);
    if (rfc === undefined) {
      throw new Error(`RFC not found: ${id}`);
    }

    const previous = rfc.status;
    rfc.status = status;
    rfc.updatedAt = this.clock().toISOString();

    this.appendAudit(rfc, {
      event: 'status_changed',
      detail: `Status changed from "${previous}" to "${status}"`,
      ...(actor !== undefined ? { actor } : {}),
    });

    const notifType = isResolved(status) ? 'resolution' : 'status_update';
    await this.dispatchNotification(rfc, {
      recipient: rfc.requestor,
      type: notifType,
      message: `RFC ${id} ("${rfc.title}") status updated to "${status}".`,
    });

    return rfc;
  }

  // ── SLA enforcement ────────────────────────────────────────────────────────

  /**
   * Evaluates all unresolved RFCs against the current time and marks those
   * that have exceeded their SLA deadline.
   *
   * For each newly-breached RFC a `sla_warning` notification is dispatched to
   * the requestor and an `sla_breached` audit entry is appended. Already-
   * breached or resolved RFCs are skipped.
   *
   * Call this on a periodic schedule (e.g. daily) to keep SLA state current.
   */
  async checkSLA(): Promise<void> {
    const now = this.clock();
    for (const rfc of this.store.values()) {
      if (rfc.slaBreached || isResolved(rfc.status)) continue;

      if (now > new Date(rfc.slaDeadline)) {
        rfc.slaBreached = true;
        rfc.updatedAt = now.toISOString();

        this.appendAudit(rfc, {
          event: 'sla_breached',
          detail: `SLA deadline ${rfc.slaDeadline} exceeded without resolution.`,
          actor: 'system',
        });

        await this.dispatchNotification(rfc, {
          recipient: rfc.requestor,
          type: 'sla_warning',
          message:
            `RFC ${rfc.id} ("${rfc.title}") has exceeded its 2-week SLA deadline. ` +
            `Deadline was ${rfc.slaDeadline}. Escalation required.`,
        });
      }
    }
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  /**
   * Returns the RFC with the given ID, or `undefined` if not found.
   */
  getById(id: string): RFC | undefined {
    return this.store.get(id);
  }

  /**
   * Returns all RFCs in filing order.
   */
  listAll(): RFC[] {
    return Array.from(this.store.values());
  }

  /**
   * Returns all RFCs that have not reached a terminal status.
   */
  listOpen(): RFC[] {
    return this.listAll().filter((rfc) => !isResolved(rfc.status));
  }

  /**
   * Returns all RFCs whose SLA has been breached and that remain unresolved.
   */
  listSLABreached(): RFC[] {
    return this.listAll().filter((rfc) => rfc.slaBreached && !isResolved(rfc.status));
  }

  // ── Import / restore ───────────────────────────────────────────────────────

  /**
   * Restores a previously-serialised RFC into the processor's store.
   *
   * If an RFC with the same ID already exists it is silently replaced.
   * Intended for reconstructing state after a restart.
   */
  importRFC(rfc: RFC): void {
    this.store.set(rfc.id, rfc);
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  private appendAudit(
    rfc: RFC,
    fields: Omit<RFCAuditEntry, 'ts'>,
  ): void {
    (rfc.auditTrail as RFCAuditEntry[]).push({
      ts: this.clock().toISOString(),
      ...fields,
    });
  }

  private async dispatchNotification(
    rfc: RFC,
    fields: Omit<RFCNotification, 'ts'>,
  ): Promise<void> {
    const notification: RFCNotification = {
      ts: this.clock().toISOString(),
      ...fields,
    };

    (rfc.notifications as RFCNotification[]).push(notification);

    this.appendAudit(rfc, {
      event: 'notification_sent',
      detail: `Notification "${notification.type}" sent to "${notification.recipient}"`,
      actor: 'system',
    });

    if (this.notify !== undefined) {
      try {
        await this.notify(notification, rfc);
      } catch (err) {
        this.appendAudit(rfc, {
          event: 'notification_sent',
          detail: `Notification delivery failed: ${String(err)}`,
          actor: 'system',
        });
      }
    }
  }
}

// ─── Default instance ─────────────────────────────────────────────────────────

/**
 * Shared `RFCProcessor` instance for production use.
 *
 * Tests should construct their own `new RFCProcessor()` instance to avoid
 * cross-test state leakage.
 */
export const defaultRFCProcessor = new RFCProcessor();
