/** The effect a rule produces when matched */
export type Effect = 'permit' | 'forbid';

/** The resource type a rule applies to */
export type Resource = 'tool' | 'command' | 'channel' | 'prompt' | 'model';

/** Context passed to rule condition functions */
export interface RuleContext {
  /** The ID of the agent making the request */
  agentId: string;
  /** The channel through which the request is made */
  channel: string;
  /**
   * Whether the agentId and channel have been verified by the identity registry.
   *
   * When false, the agentId/channel values are untrusted (self-reported by the
   * agent) and MUST NOT be used for privilege-escalation decisions such as
   * admin or support role checks. Rules that gate access based on agentId
   * prefixes (e.g. `admin-*`, `support-*`) or channel membership (e.g.
   * `['admin','trusted','ci'].includes(ctx.channel)`) MUST check `ctx.verified`
   * first and default to deny when verification is absent.
   */
  verified: boolean;
  /** Optional user ID associated with the request */
  userId?: string;
  /** Optional session ID for the current session */
  sessionId?: string;
  /** Arbitrary additional metadata */
  metadata?: Record<string, unknown>;
}

/** Rate limiting configuration for a rule */
export interface RateLimit {
  /** Maximum number of calls allowed within the time window */
  maxCalls: number;
  /** Duration of the time window in seconds */
  windowSeconds: number;
}

/** A policy rule defining access control for a resource */
export interface Rule {
  /** Whether this rule permits or forbids access */
  effect: Effect;
  /** The type of resource this rule applies to */
  resource: Resource;
  /** Pattern or identifier to match against the resource name */
  match: string | RegExp;
  /** Optional condition function for fine-grained control */
  condition?: (context: RuleContext) => boolean;
  /** Human-readable reason for the rule */
  reason?: string;
  /** Tags for categorizing or filtering rules */
  tags?: string[];
  /** Optional rate limiting configuration */
  rateLimit?: RateLimit;
}
