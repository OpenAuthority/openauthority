import type { CoverageMap } from '../policy/coverage.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Configuration for the OpenAuthority dashboard HTTP server.
 */
export interface DashboardServerOptions {
  /** TCP port to listen on. Defaults to 3744. */
  port?: number;
  /** CoverageMap instance whose data is exposed at GET /api/coverage. */
  coverageMap: CoverageMap;
  /** Absolute path to the JSONL audit log file for GET /api/audit. */
  auditLogFile?: string;
  /** Absolute path to the JSON rules data file for the /api/rules CRUD endpoints. */
  rulesDataFile?: string;
}

/**
 * Handle returned by {@link createDashboardServer}.
 * Call {@link start} once during plugin activation and {@link stop} during deactivation.
 */
export interface DashboardHandle {
  /** Start the HTTP server and begin accepting connections. */
  start(): Promise<void>;
  /** Stop the HTTP server and release the port. Safe to call when not started. */
  stop(): Promise<void>;
  /** The TCP port actually bound after {@link start} resolves, or `null` if not started. */
  readonly boundPort: number | null;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Creates a {@link DashboardHandle} that will serve the OpenAuthority dashboard
 * over HTTP when {@link DashboardHandle.start} is called.
 *
 * The server is **not** started by this call — call `handle.start()` explicitly.
 * During plugin deactivation call `handle.stop()` to release the port.
 *
 * @param options Server configuration including port and data sources.
 * @returns A handle for starting and stopping the dashboard HTTP server.
 */
export function createDashboardServer(_options: DashboardServerOptions): DashboardHandle {
  // TODO(phase2): implement with Express — mount rules-api and audit-api routers,
  // serve static client/dist, add SPA fallback for non-API 404s.
  return {
    async start(): Promise<void> { /* stub — implement in phase 2 */ },
    async stop(): Promise<void> { /* stub — implement in phase 2 */ },
    get boundPort(): number | null { return null; },
  };
}
