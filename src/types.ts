import { Type, Static } from "@sinclair/typebox";

export const PolicyEffect = Type.Union([
  Type.Literal("allow"),
  Type.Literal("deny"),
]);

export const PolicyCondition = Type.Object({
  field: Type.String(),
  operator: Type.Union([
    Type.Literal("eq"),
    Type.Literal("neq"),
    Type.Literal("in"),
    Type.Literal("nin"),
    Type.Literal("contains"),
    Type.Literal("startsWith"),
    Type.Literal("regex"),
  ]),
  value: Type.Unknown(),
});

export const PolicyRule = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.Optional(Type.String()),
  effect: PolicyEffect,
  conditions: Type.Array(PolicyCondition),
  priority: Type.Optional(Type.Number({ default: 0 })),
});

export const Policy = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.Optional(Type.String()),
  version: Type.String(),
  rules: Type.Array(PolicyRule),
  defaultEffect: PolicyEffect,
  createdAt: Type.Optional(Type.String({ format: "date-time" })),
  updatedAt: Type.Optional(Type.String({ format: "date-time" })),
});

export const EvaluationContext = Type.Object({
  subject: Type.Record(Type.String(), Type.Unknown()),
  resource: Type.Record(Type.String(), Type.Unknown()),
  action: Type.String(),
  environment: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

export const EvaluationResult = Type.Object({
  allowed: Type.Boolean(),
  effect: PolicyEffect,
  matchedRuleId: Type.Optional(Type.String()),
  reason: Type.Optional(Type.String()),
});

export type TPolicyEffect = Static<typeof PolicyEffect>;
export type TPolicyCondition = Static<typeof PolicyCondition>;
export type TPolicyRule = Static<typeof PolicyRule>;
export type TPolicy = Static<typeof Policy>;
export type TEvaluationContext = Static<typeof EvaluationContext>;
export type TEvaluationResult = Static<typeof EvaluationResult>;

// ---------------------------------------------------------------------------
// OpenAuthority v0.1 — semantic authorization runtime core types
// ---------------------------------------------------------------------------

/** Rate limit bounds attached to a CeeDecision. */
export interface RateLimitInfo {
  /** Maximum calls allowed within the window. */
  maxCalls: number;
  /** Duration of the rate limit window in seconds. */
  windowSeconds: number;
}

/** Decision produced by the authorization pipeline. */
export interface CeeDecision {
  /** Authorization effect. */
  effect: 'permit' | 'forbid';
  /** Human-readable explanation of the decision. */
  reason: string;
  /** Identifier of the rule that produced this decision, if any. */
  matchedRule?: string;
  /** Rate limit bounds when the decision includes throttling. */
  rateLimit?: RateLimitInfo;
}

/** Semantic description of what an agent intends to do. */
export interface Intent {
  /** Canonical dot-separated action class (e.g. 'email.send', 'filesystem.delete'). */
  action_class: string;
  /** Target resource of the action (e.g. email address, file path). */
  target: string;
  /** Human-readable summary of the intended action. */
  summary: string;
  /** SHA-256 hex digest of the tool call payload for binding verification. */
  payload_hash: string;
  /** Raw tool call parameters. */
  parameters: Record<string, unknown>;
}

/** Capability token issued after HITL approval, bound to a specific session scope. */
export interface Capability {
  /** UUID v7 identifier of the approval that issued this capability. */
  approval_id: string;
  /** ISO 8601 timestamp when this capability expires. */
  expires_at: string;
  /** Session scope identifier this capability is bound to. */
  session_scope: string;
  /** Additional scope metadata (e.g. allowed targets, action constraints). */
  scope_meta: Record<string, unknown>;
}

/** Runtime metadata attached to every execution envelope. */
export interface Metadata {
  /** Unique session identifier. */
  session_id: string;
  /** UUID v7 of the approval backing this execution. */
  approval_id: string;
  /** ISO 8601 timestamp when the envelope was created. */
  timestamp: string;
  /** Monotonically increasing version of the policy bundle in effect. */
  bundle_version: number;
  /** Distributed trace identifier for observability. */
  trace_id: string;
  /** Trust level of the source issuing the intent (e.g. 'user', 'agent', 'system'). */
  source_trust_level: string;
}

/**
 * Execution envelope wrapping a single agent action through the
 * OpenAuthority authorization pipeline.
 */
export interface ExecutionEnvelope {
  /** The agent's stated intent. */
  intent: Intent;
  /** Capability token authorizing this action; null when no approval has been granted. */
  capability: Capability | null;
  /** Runtime metadata for tracing and auditing. */
  metadata: Metadata;
  /** Provenance record describing the origin of this envelope. */
  provenance: Record<string, unknown>;
}

/** Discrete event emitted at each stage of the enforcement pipeline. */
export interface ExecutionEvent {
  /** Event type identifier (e.g. 'envelope.received', 'decision.emit'). */
  type: string;
  /** Snapshot of the envelope at the time this event was emitted. */
  envelope: ExecutionEnvelope;
  /** ISO 8601 timestamp when this event occurred. */
  timestamp: string;
  /** Stage that emitted this event, if applicable. */
  stage?: string;
}

/** Final result returned by the enforcement pipeline for an execution envelope. */
export interface PipelineResult {
  /** Authorization decision. */
  decision: CeeDecision;
  /** The envelope that was evaluated. */
  envelope: ExecutionEnvelope;
  /** Pipeline events emitted during evaluation, in order. */
  events: ExecutionEvent[];
}
