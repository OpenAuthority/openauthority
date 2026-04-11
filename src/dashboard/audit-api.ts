// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single audit log entry as returned by GET /api/audit and broadcast over
 * the SSE stream. Mirrors the `ExecutionEvent` written to the JSONL log file.
 */
export interface AuditApiEntry {
  /** ISO 8601 timestamp of the event. */
  ts: string;
  /** Discriminator for the entry type. */
  type: string;
  [key: string]: unknown;
}

/** Options for {@link createAuditApi}. */
export interface AuditApiOptions {
  /** Absolute path to the JSONL audit log file for historical entries. */
  auditLogFile: string;
  /**
   * Maximum number of recent entries held in the in-memory ring buffer.
   * Oldest entries are evicted when the buffer is full. Defaults to 1000.
   */
  ringBufferSize?: number;
}

/**
 * Collection of HTTP handler functions for the /api/audit endpoints.
 *
 * Handler argument types are `unknown` because the Express dependency is not
 * yet installed; implementations will narrow to `express.Request` / `express.Response`.
 */
export interface AuditApiRouter {
  /** GET /api/audit — return combined JSONL-file + ring-buffer entries. */
  handleList(req: unknown, res: unknown): void | Promise<void>;
  /** POST /api/audit — append an entry to the ring buffer and broadcast to SSE clients. */
  handleAppend(req: unknown, res: unknown): void | Promise<void>;
  /** GET /api/audit/stream — open an SSE connection for live audit event streaming. */
  handleStream(req: unknown, res: unknown): void | Promise<void>;
  /**
   * Push an entry directly from server-side code without going through HTTP.
   * Adds the entry to the ring buffer and broadcasts it to all SSE clients.
   */
  push(entry: AuditApiEntry): void;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Creates an {@link AuditApiRouter} backed by the given JSONL log file.
 *
 * Historical entries are read from the JSONL file on each GET /api/audit request.
 * Recent entries are cached in an in-memory ring buffer (default 1000 entries).
 * Live events are broadcast to all connected SSE clients via {@link AuditApiRouter.push}
 * and the POST /api/audit endpoint.
 *
 * A mock data generator fires every 3 seconds while at least one SSE client is
 * connected, enabling UI development without a live policy engine.
 *
 * @param options Audit API configuration including the JSONL file path.
 * @returns A router containing handler functions for each /api/audit endpoint.
 */
export function createAuditApi(_options: AuditApiOptions): AuditApiRouter {
  // TODO(phase2): implement with ring buffer, JSONL streaming, and SSE broadcast
  return {
    handleList(_req, _res) { /* stub */ },
    handleAppend(_req, _res) { /* stub */ },
    handleStream(_req, _res) { /* stub */ },
    push(_entry) { /* stub */ },
  };
}
