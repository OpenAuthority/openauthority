import { PolicyEngine } from '../policy/engine.js';
import type { RuleContext, Resource } from '../policy/types.js';
import type { EvaluationDecision } from '../policy/engine.js';

/** HITL enforcement mode for the capability gate. */
export type HitlMode = 'none' | 'per_request' | 'session_approval';

/** Context threaded through the two-stage enforcement pipeline. */
export interface PipelineContext {
  /** Logical action class (e.g. 'email.send', 'file.delete'). */
  action_class: string;
  /** Target resource of the action (e.g. email address, file path). */
  target: string;
  /** SHA-256 hex digest of the tool call payload used for binding verification. */
  payload_hash: string;
  /** Capability token issued after HITL approval. Absent when no approval has been granted. */
  approval_id?: string;
  /** Session identifier for session-scoped approvals. */
  session_id?: string;
  /** HITL mode driving capability gate behavior in Stage 1. */
  hitl_mode: HitlMode;
  /** Cedar rule evaluation context forwarded to Stage 2. */
  rule_context: RuleContext;
}

export type CeeEffect = 'permit' | 'forbid';

/** Decision produced by a pipeline stage. */
export interface CeeDecision {
  effect: CeeEffect;
  reason: string;
  /** Identifier of the stage that produced this decision. */
  stage?: string;
}

/** Stage 1: capability gate — validates an issued capability token. */
export type Stage1Fn = (ctx: PipelineContext) => Promise<CeeDecision>;

/** Stage 2: policy evaluation — delegates to the Cedar engine. */
export type Stage2Fn = (ctx: PipelineContext) => Promise<CeeDecision>;

/** Maps action-class prefixes to Cedar Resource types. */
const ACTION_CLASS_PREFIXES: ReadonlyArray<readonly [string, Resource]> = [
  ['communication.', 'channel'],
  ['command.', 'command'],
  ['prompt.', 'prompt'],
  ['model.', 'model'],
];

/**
 * Extends PolicyEngine with action-class-aware evaluation.
 *
 * Maps action-class prefixes to Cedar Resource types:
 *   communication.* → channel
 *   command.*       → command
 *   prompt.*        → prompt
 *   model.*         → model
 *   (all others)    → tool
 */
export class EnforcementPolicyEngine extends PolicyEngine {
  evaluateByActionClass(
    action_class: string,
    target: string,
    context: RuleContext,
  ): EvaluationDecision {
    let resource: Resource = 'tool';
    for (const [prefix, res] of ACTION_CLASS_PREFIXES) {
      if (action_class.startsWith(prefix)) {
        resource = res;
        break;
      }
    }
    return this.evaluate(resource, target, context);
  }
}
