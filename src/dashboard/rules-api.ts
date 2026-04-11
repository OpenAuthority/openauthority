// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single rule record as persisted in the JSON rules data file and returned
 * by the /api/rules endpoints.
 */
export interface RuleRecord {
  /** Stable unique identifier assigned on create. */
  id: string;
  effect: 'permit' | 'forbid';
  resource: string;
  /** Exact string or RegExp source pattern to match the resource name. */
  match: string;
  reason?: string;
  tags?: string[];
  rateLimit?: { maxCalls: number; windowSeconds: number };
}

/** Options for {@link createRulesApi}. */
export interface RulesApiOptions {
  /** Absolute path to the JSON file that persists user-defined rules. */
  rulesDataFile: string;
}

/**
 * Collection of HTTP handler functions for the /api/rules endpoints.
 *
 * Handlers receive the raw Node.js request/response objects so they can be
 * mounted on any HTTP framework. The concrete type is `unknown` here because
 * the Express dependency is not yet installed; implementations will narrow to
 * `express.Request` / `express.Response`.
 */
export interface RulesApiRouter {
  /** GET /api/rules — list all persisted rules. */
  handleList(req: unknown, res: unknown): void | Promise<void>;
  /** POST /api/rules — create a new rule; returns 201 with the created record. */
  handleCreate(req: unknown, res: unknown): void | Promise<void>;
  /** PUT /api/rules/:id — update an existing rule; returns 200 with the updated record. */
  handleUpdate(req: unknown, res: unknown): void | Promise<void>;
  /** DELETE /api/rules/:id — delete a rule; returns 204 on success. */
  handleDelete(req: unknown, res: unknown): void | Promise<void>;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Creates a {@link RulesApiRouter} backed by the given JSON data file.
 *
 * Rules are persisted on every create, update, and delete. The data directory
 * is created recursively on first write if it does not exist.
 *
 * @param options  API configuration including the rules data file path.
 * @returns A router containing handler functions for each /api/rules endpoint.
 */
export function createRulesApi(_options: RulesApiOptions): RulesApiRouter {
  // TODO(phase2): implement CRUD handlers with file persistence
  return {
    handleList(_req, _res) { /* stub */ },
    handleCreate(_req, _res) { /* stub */ },
    handleUpdate(_req, _res) { /* stub */ },
    handleDelete(_req, _res) { /* stub */ },
  };
}
