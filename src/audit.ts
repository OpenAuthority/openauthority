import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { TPolicy, TEvaluationContext, TEvaluationResult } from "./types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/** An audit entry produced by the ABAC policy engine after each evaluation. */
export interface AuditEntry {
  /** ISO 8601 timestamp of the evaluation. */
  timestamp: string;
  /** ID of the policy that was evaluated. */
  policyId: string;
  /** Name of the policy that was evaluated. */
  policyName: string;
  /** Evaluation context passed to the engine. */
  context: TEvaluationContext;
  /** The evaluation result. */
  result: TEvaluationResult;
}

/** A handler function called with each audit entry after an evaluation. */
export type AuditHandler = (entry: AuditEntry) => void | Promise<void>;

/** A single Cedar-engine policy decision entry for JSONL logging. */
export interface PolicyDecisionEntry {
  /** ISO 8601 timestamp. */
  ts: string;
  /** Decision effect. */
  effect: string;
  /** Resource type. */
  resource: string;
  /** Matched name or pattern. */
  match: string;
  /** Decision reason. */
  reason: string;
  /** Agent ID. */
  agentId: string;
  /** Channel. */
  channel: string;
}

/** A HITL decision entry for JSONL logging. */
export interface HitlDecisionEntry {
  /** ISO 8601 timestamp. */
  ts: string;
  /** Entry type marker. */
  type: 'hitl';
  /** HITL decision outcome. */
  decision: 'approved' | 'denied' | 'fallback-deny' | 'fallback-auto-approve' | 'telegram-unreachable' | 'slack-unreachable';
  /** Approval token. */
  token: string;
  /** Tool name that required approval. */
  toolName: string;
  /** Agent ID. */
  agentId: string;
  /** Channel. */
  channel: string;
  /** HITL policy name. */
  policyName: string;
  /** Configured timeout in seconds. */
  timeoutSeconds: number;
}

/** Options for {@link JsonlAuditLogger}. */
export interface JsonlAuditLoggerOptions {
  /** Absolute or relative path to the JSONL log file. */
  logFile: string;
}

// ─── AuditLogger ─────────────────────────────────────────────────────────────

/** Dispatches ABAC audit entries to all registered handler functions. */
export class AuditLogger {
  private handlers: AuditHandler[] = [];

  addHandler(handler: AuditHandler): void {
    this.handlers.push(handler);
  }

  removeHandler(handler: AuditHandler): void {
    this.handlers = this.handlers.filter(h => h !== handler);
  }

  async log(policy: TPolicy, context: TEvaluationContext, result: TEvaluationResult): Promise<void> {
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      policyId: policy.id,
      policyName: policy.name,
      context,
      result,
    };
    for (const handler of this.handlers) {
      await handler(entry);
    }
  }
}

// ─── consoleAuditHandler ─────────────────────────────────────────────────────

/** Built-in audit handler that logs decisions to the console. */
export const consoleAuditHandler: AuditHandler = (entry: AuditEntry): void => {
  const verdict = entry.result.allowed ? 'ALLOW' : 'DENY';
  const ruleStr = entry.result.matchedRuleId !== undefined
    ? ` rule=${entry.result.matchedRuleId}`
    : '';
  console.log(`[audit] ${verdict} policy=${entry.policyId}${ruleStr}`);
};

// ─── JsonlAuditLogger ────────────────────────────────────────────────────────

/** Appends entries as newline-delimited JSON to a configurable log file. */
export class JsonlAuditLogger {
  private readonly filePath: string;

  constructor(options: JsonlAuditLoggerOptions) {
    this.filePath = options.logFile;
  }

  async log(entry: PolicyDecisionEntry | HitlDecisionEntry | Record<string, unknown>): Promise<void> {
    const line = JSON.stringify(entry) + "\n";
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      appendFileSync(this.filePath, line, { encoding: "utf-8" });
    } catch (err) {
      console.error("[audit] failed to write audit entry:", err);
    }
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }
}
