/**
 * MCP tool registry gate.
 *
 * Validates MCP and third-party tool calls against the @openclaw/action-registry
 * before execution. Implements gating patterns:
 *
 *   E-03: Exec wrapper tool names (bash, exec, sh, shell_exec, …) that resolve
 *         to the shell.exec action class are always forbidden at the MCP gate
 *         boundary. The operator allowlist cannot override this block.
 *   E-07: Unregistered tool names (no alias entry in the registry) trigger
 *         unknown_sensitive_action (critical risk, per_request HITL) and are
 *         forbidden by default. Operators may explicitly permit specific
 *         unregistered tools via the allowlist.
 *
 * Default behavior is fail-closed: any tool not found in the registry alias
 * index and not on the operator allowlist returns `effect: 'forbid'`.
 *
 * All gate decisions are audit-logged when a logger is supplied.
 *
 * @see T177 (dependency)
 */

import { REGISTRY, ActionClass } from '@openclaw/action-registry';
import type { ActionRegistryEntry, RiskLevel, HitlModeNorm } from '@openclaw/action-registry';
import type { JsonlAuditLogger } from '../audit.js';

export type { RiskLevel, HitlModeNorm };

// ─── Types ────────────────────────────────────────────────────────────────────

/** Effect of a gate decision. */
export type GateEffect = 'permit' | 'forbid';

/**
 * Reason for a gate decision.
 *
 * - `registered_tool`:      tool was found in the registry with a non-exec
 *                           action class → permit
 * - `exec_wrapper_blocked`: tool resolved to shell.exec in the registry →
 *                           forbid (E-03)
 * - `operator_allowlisted`: unregistered tool was on the operator allowlist →
 *                           permit (resolves to unknown_sensitive_action)
 * - `unregistered_tool`:    tool not in registry and not allowlisted →
 *                           forbid (E-07)
 */
export type GateReason =
  | 'registered_tool'
  | 'exec_wrapper_blocked'
  | 'operator_allowlisted'
  | 'unregistered_tool';

/** Evaluation context for audit logging. */
export interface GateContext {
  /** Agent ID performing the tool call. */
  agentId: string;
  /** Channel through which the tool call arrived. */
  channel: string;
  /** Whether the agent identity was verified. */
  verified?: boolean;
}

/** Result of evaluating a tool name through the {@link MCPToolGate}. */
export interface MCPToolGateDecision {
  /** Gate effect — "permit" allows execution; "forbid" blocks it. */
  effect: GateEffect;
  /**
   * Resolved action class.
   *
   * - Registered non-exec tools: their registry action class (e.g. "filesystem.read")
   * - Exec wrapper tools (E-03): "shell.exec" (the registry class that triggered the block)
   * - Unregistered tools (allowlisted or forbidden): "unknown_sensitive_action"
   */
  actionClass: string;
  /** Risk level of the resolved action class. */
  risk: RiskLevel;
  /** HITL mode of the resolved action class. */
  hitlMode: HitlModeNorm;
  /** Reason for the gate decision. */
  reason: GateReason;
  /** Whether the tool name was found in the registry alias index. */
  registered: boolean;
  /** Whether the tool was on the operator allowlist. */
  allowlisted: boolean;
}

/** Options for constructing an {@link MCPToolGate}. */
export interface MCPToolGateOptions {
  /**
   * Operator allowlist of tool names that are permitted even when not
   * registered in the action registry. Names are matched case-insensitively.
   *
   * Allowlisted unregistered tools resolve to `unknown_sensitive_action` with
   * critical risk and per_request HITL mode. The reason in the audit log is
   * `"operator_allowlisted"`.
   *
   * Note: exec wrapper tools (those that resolve to shell.exec in the registry)
   * are blocked via E-03 before the allowlist is consulted and cannot be
   * permitted via this mechanism.
   */
  allowlist?: readonly string[] | ReadonlySet<string>;
  /**
   * Audit logger for recording gate decisions. When omitted, decisions are
   * evaluated but not persisted.
   */
  logger?: Pick<JsonlAuditLogger, 'log'>;
}

// ─── MCPToolGate ──────────────────────────────────────────────────────────────

/**
 * Gate that validates MCP and third-party tool names against the
 * @openclaw/action-registry before execution.
 *
 * Evaluation order:
 *   1. Alias lookup in the registry (case-insensitive).
 *   2. If found and action class is `shell.exec` → forbid (E-03).
 *   3. If found and action class is not `shell.exec` → permit.
 *   4. If not found and tool name is on the operator allowlist → permit
 *      (resolved to `unknown_sensitive_action`).
 *   5. If not found and not allowlisted → forbid (E-07), resolved to
 *      `unknown_sensitive_action`.
 *
 * @example
 * ```ts
 * const gate = new MCPToolGate({
 *   allowlist: ['my_custom_mcp_tool'],
 *   logger,
 * });
 *
 * const decision = await gate.evaluate('read_file', {
 *   agentId: 'agent-1',
 *   channel: 'default',
 * });
 * // decision.effect === 'permit'
 * // decision.actionClass === 'filesystem.read'
 * // decision.reason === 'registered_tool'
 *
 * const blocked = await gate.evaluate('unknown_tool', {
 *   agentId: 'agent-1',
 *   channel: 'default',
 * });
 * // blocked.effect === 'forbid'
 * // blocked.actionClass === 'unknown_sensitive_action'
 * // blocked.reason === 'unregistered_tool'
 * ```
 */
export class MCPToolGate {
  private readonly aliasIndex: ReadonlyMap<string, ActionRegistryEntry>;
  private readonly allowlist: ReadonlySet<string>;
  private readonly logger: Pick<JsonlAuditLogger, 'log'> | undefined;
  private readonly unknownEntry: ActionRegistryEntry;

  constructor(options: MCPToolGateOptions = {}) {
    // Build alias index for O(1) tool name lookup (mirrors normalize.ts ALIAS_INDEX)
    const idx = new Map<string, ActionRegistryEntry>();
    for (const entry of REGISTRY) {
      for (const alias of entry.aliases) {
        idx.set(alias, entry);
      }
    }
    this.aliasIndex = idx;

    // Resolve the unknown_sensitive_action sentinel entry explicitly by action_class
    const unknownEntry = REGISTRY.find(
      (e) => e.action_class === ActionClass.UnknownSensitiveAction,
    );
    if (unknownEntry === undefined) {
      throw new Error(
        'MCPToolGate: unknown_sensitive_action entry not found in action registry',
      );
    }
    this.unknownEntry = unknownEntry;

    // Normalize allowlist entries to lowercase for case-insensitive matching
    const raw = options.allowlist;
    if (raw === undefined) {
      this.allowlist = new Set<string>();
    } else {
      this.allowlist = new Set([...raw].map((n) => n.toLowerCase()));
    }

    this.logger = options.logger;
  }

  /**
   * Evaluates a tool name against the registry gate.
   *
   * All decisions are audit-logged when a logger was supplied at construction.
   *
   * @param toolName  Name of the MCP or third-party tool to evaluate.
   * @param context   Evaluation context used for audit logging.
   * @returns         Gate decision describing the effect and resolved action class.
   */
  async evaluate(toolName: string, context: GateContext): Promise<MCPToolGateDecision> {
    const lowerName = toolName.toLowerCase();
    const entry = this.aliasIndex.get(lowerName);

    let decision: MCPToolGateDecision;

    if (entry !== undefined) {
      if (entry.action_class === ActionClass.ShellExec) {
        // E-03: exec wrapper tools resolve to shell.exec and are always forbidden
        decision = {
          effect: 'forbid',
          actionClass: entry.action_class,
          risk: entry.default_risk,
          hitlMode: entry.default_hitl_mode,
          reason: 'exec_wrapper_blocked',
          registered: true,
          allowlisted: false,
        };
      } else {
        // Registered non-exec tool: permit
        decision = {
          effect: 'permit',
          actionClass: entry.action_class,
          risk: entry.default_risk,
          hitlMode: entry.default_hitl_mode,
          reason: 'registered_tool',
          registered: true,
          allowlisted: false,
        };
      }
    } else if (this.allowlist.has(lowerName)) {
      // Unregistered tool on operator allowlist: permit with unknown_sensitive_action
      decision = {
        effect: 'permit',
        actionClass: this.unknownEntry.action_class,
        risk: this.unknownEntry.default_risk,
        hitlMode: this.unknownEntry.default_hitl_mode,
        reason: 'operator_allowlisted',
        registered: false,
        allowlisted: true,
      };
    } else {
      // Unregistered tool not on allowlist: forbid (E-07)
      decision = {
        effect: 'forbid',
        actionClass: this.unknownEntry.action_class,
        risk: this.unknownEntry.default_risk,
        hitlMode: this.unknownEntry.default_hitl_mode,
        reason: 'unregistered_tool',
        registered: false,
        allowlisted: false,
      };
    }

    if (this.logger !== undefined) {
      await this.logger.log({
        ts: new Date().toISOString(),
        type: 'policy' as const,
        effect: decision.effect,
        resource: 'tool',
        match: toolName,
        reason: decision.reason,
        agentId: context.agentId,
        channel: context.channel,
        ...(context.verified !== undefined && { verified: context.verified }),
        toolName,
        actionClass: decision.actionClass,
        stage: 'stage1-trust' as const,
      });
    }

    return decision;
  }
}
