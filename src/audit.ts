import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// ─── Types ────────────────────────────────────────────────────────────────────

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
