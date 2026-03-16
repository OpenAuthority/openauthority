// ─── TypeBox-based engine re-exports (backwards-compatible) ──────────────────
export { PolicyEngine } from "./engine.js";
export type { PolicyEngineOptions } from "./engine.js";
export { AuditLogger, consoleAuditHandler, JsonlAuditLogger } from "./audit.js";
export { evaluateRule, sortRulesByPriority } from "./rules.js";
export type {
  TPolicyEffect,
  TPolicyCondition,
  TPolicyRule,
  TPolicy,
  TEvaluationContext,
  TEvaluationResult,
} from "./types.js";
export type {
  AuditEntry,
  AuditHandler,
  PolicyDecisionEntry,
  JsonlAuditLoggerOptions,
} from "./audit.js";

// ─── Cedar-style engine re-exports ───────────────────────────────────────────
export { PolicyEngine as CedarPolicyEngine } from "./policy/engine.js";
export type { EvaluationDecision, EvaluationEffect } from "./policy/engine.js";
export type { Rule, RuleContext, Resource, Effect, RateLimit } from "./policy/types.js";
export { default as defaultRules, mergeRules } from "./policy/rules.js";

// ─── Human-in-the-loop policy configuration ──────────────────────────────────
export {
  HitlFallbackSchema,
  HitlApprovalConfigSchema,
  HitlPolicySchema,
  HitlPolicyConfigSchema,
  matchesActionPattern,
  checkAction,
  parseHitlPolicyFile,
  validateHitlPolicyConfig,
  HitlPolicyParseError,
  HitlPolicyValidationError,
  startHitlPolicyWatcher,
} from "./hitl/index.js";
export type {
  HitlFallback,
  HitlApprovalConfig,
  HitlPolicy,
  HitlPolicyConfig,
  HitlCheckResult,
  HitlWatcherHandle,
} from "./hitl/index.js";

// ─── Internal imports ─────────────────────────────────────────────────────────
import { PolicyEngine as TypeboxPolicyEngine } from "./engine.js";
import { AuditLogger, consoleAuditHandler } from "./audit.js";
import type { TPolicy } from "./types.js";
import { PolicyEngine as CedarPolicyEngine } from "./policy/engine.js";
import type { RuleContext } from "./policy/types.js";
import defaultRules from "./policy/rules.js";
import { startRulesWatcher, type WatcherHandle } from "./watcher.js";

// ─── Hook types ───────────────────────────────────────────────────────────────

/** Result returned by every lifecycle hook handler. */
export interface HookDecision {
  /** Whether the operation should proceed. */
  proceed: boolean;
  /** Human-readable reason for the decision, required when proceed is false. */
  reason?: string;
}

/** Event payload for the before_tool_call hook. */
export interface BeforeToolCallEvent {
  /** The name of the tool about to be called. */
  toolName: string;
  /** The arguments that will be passed to the tool. */
  args?: unknown;
  /** The agent/user context for this request. */
  context: RuleContext;
}

/** Event payload for the before_prompt_build hook. */
export interface BeforePromptBuildEvent {
  /** The prompt identifier. */
  promptId: string;
  /** The messages that will be included in the prompt. */
  messages?: unknown[];
  /** The agent/user context for this request. */
  context: RuleContext;
}

/** Event payload for the before_model_resolve hook. */
export interface BeforeModelResolveEvent {
  /** The requested model name (e.g. "claude-3-sonnet"). */
  model: string;
  /** The model provider (e.g. "anthropic"). Empty string if unspecified. */
  provider: string;
  /** The agent/user context for this request. */
  context: RuleContext;
}

export type BeforeToolCallHandler = (
  event: BeforeToolCallEvent
) => HookDecision | Promise<HookDecision>;

export type BeforePromptBuildHandler = (
  event: BeforePromptBuildEvent
) => HookDecision | Promise<HookDecision>;

export type BeforeModelResolveHandler = (
  event: BeforeModelResolveEvent
) => HookDecision | Promise<HookDecision>;

// ─── Plugin interfaces ────────────────────────────────────────────────────────

export interface OpenclawPlugin {
  name: string;
  version: string;
  activate(context: OpenclawPluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

export interface OpenclawPluginContext {
  /** Register the ABAC policy engine for the policy-evaluation capability. */
  registerPolicyEngine(engine: TypeboxPolicyEngine): void;
  /** Subscribe to policy-load events so new policies are added to the engine. */
  onPolicyLoad(callback: (policy: TPolicy) => void): void;
  /** Register a handler for the before_tool_call lifecycle hook. */
  registerHook(hookName: "before_tool_call", handler: BeforeToolCallHandler): void;
  /** Register a handler for the before_prompt_build lifecycle hook. */
  registerHook(hookName: "before_prompt_build", handler: BeforePromptBuildHandler): void;
  /** Register a handler for the before_model_resolve lifecycle hook. */
  registerHook(hookName: "before_model_resolve", handler: BeforeModelResolveHandler): void;
}

// ─── Prompt injection detection ───────────────────────────────────────────────

/**
 * Known prompt injection patterns.
 * These phrases are commonly used to override model instructions or bypass
 * safety policies embedded in the system prompt.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
  /disregard\s+(all\s+)?(previous|prior|above|your)\s+/i,
  /forget\s+(everything|all|your\s+(instructions?|rules?|guidelines?|context|training))/i,
  /\bDAN\s+mode\b/i,
  /\bjailbreak\b/i,
  /bypass\s+(your\s+)?(safety|restrictions?|guidelines?|filters?|rules?)/i,
  /override\s+(your\s+)?(instructions?|rules?|safety|system\s+prompt)/i,
  /pretend\s+you\s+have\s+no\s+restrictions/i,
  /act\s+as\s+if\s+you\s+(have\s+no\s+restrictions|are\s+not\s+bound)/i,
  /new\s+(persona|identity|role)\s*[:=]/i,
];

function extractMessageText(message: unknown): string | null {
  if (typeof message === "string") return message;
  if (typeof message === "object" && message !== null) {
    const m = message as Record<string, unknown>;
    if (typeof m.content === "string") return m.content;
    if (typeof m.text === "string") return m.text;
  }
  return null;
}

/** Returns true if any message contains a known prompt injection pattern. */
function detectPromptInjection(messages?: unknown[]): boolean {
  if (!messages || messages.length === 0) return false;
  for (const message of messages) {
    const text = extractMessageText(message);
    if (text === null) continue;
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(text)) return true;
    }
  }
  return false;
}

// ─── Singleton instances ──────────────────────────────────────────────────────

const auditLogger = new AuditLogger();
auditLogger.addHandler(consoleAuditHandler);

/** ABAC engine for the policy-evaluation capability. */
const abacEngine = new TypeboxPolicyEngine({ auditLogger });

/** Mutable container for the Cedar-style engine used by lifecycle hooks.
 *  Hot reload swaps `.current` in-place so all hook handlers pick up new rules
 *  without requiring a Gateway restart. */
const cedarEngineRef: { current: CedarPolicyEngine } = {
  current: new CedarPolicyEngine(),
};
cedarEngineRef.current.addRules(defaultRules);

// ─── Hook implementations ─────────────────────────────────────────────────────

/**
 * before_tool_call
 *
 * Evaluates whether a tool may be called by consulting the Cedar policy engine.
 * Blocks execution when the engine returns forbid or deny.
 * Fails closed on unexpected errors.
 */
const beforeToolCallHandler: BeforeToolCallHandler = ({ toolName, context }) => {
  try {
    const decision = cedarEngineRef.current.evaluate("tool", toolName, context);
    if (decision.effect === "forbid" || decision.effect === "deny") {
      const reason = decision.reason ?? "Tool call denied by policy";
      console.log(
        `[hook:before_tool_call] BLOCK tool=${toolName} agentId=${context.agentId} reason="${reason}"`
      );
      return { proceed: false, reason };
    }
    return { proceed: true };
  } catch (err) {
    console.error(`[hook:before_tool_call] ERROR evaluating tool=${toolName}`, err);
    return { proceed: false, reason: "Policy evaluation error" };
  }
};

/**
 * before_prompt_build
 *
 * 1. Checks the prompt identifier against the Cedar policy engine.
 * 2. Scans message content for known prompt injection patterns.
 * Fails closed on unexpected errors.
 */
const beforePromptBuildHandler: BeforePromptBuildHandler = ({
  promptId,
  messages,
  context,
}) => {
  try {
    const decision = cedarEngineRef.current.evaluate("prompt", promptId, context);
    if (decision.effect === "forbid" || decision.effect === "deny") {
      const reason = decision.reason ?? "Prompt denied by policy";
      console.log(
        `[hook:before_prompt_build] BLOCK promptId=${promptId} agentId=${context.agentId} reason="${reason}"`
      );
      return { proceed: false, reason };
    }

    if (detectPromptInjection(messages)) {
      const reason = "Prompt injection pattern detected in message content";
      console.log(
        `[hook:before_prompt_build] BLOCK promptId=${promptId} agentId=${context.agentId} reason="${reason}"`
      );
      return { proceed: false, reason };
    }

    return { proceed: true };
  } catch (err) {
    console.error(
      `[hook:before_prompt_build] ERROR evaluating promptId=${promptId}`,
      err
    );
    return { proceed: false, reason: "Policy evaluation error" };
  }
};

/**
 * before_model_resolve
 *
 * Restricts which AI models an agent may use.  The resource name is formed as
 * "provider/model" when a provider is supplied, or just "model" otherwise.
 * Fails closed on unexpected errors.
 */
const beforeModelResolveHandler: BeforeModelResolveHandler = ({
  model,
  provider,
  context,
}) => {
  const resourceName = provider ? `${provider}/${model}` : model;
  try {
    const decision = cedarEngineRef.current.evaluate("model", resourceName, context);
    if (decision.effect === "forbid" || decision.effect === "deny") {
      const reason = decision.reason ?? "Model access denied by policy";
      console.log(
        `[hook:before_model_resolve] BLOCK model=${resourceName} agentId=${context.agentId} reason="${reason}"`
      );
      return { proceed: false, reason };
    }
    return { proceed: true };
  } catch (err) {
    console.error(
      `[hook:before_model_resolve] ERROR evaluating model=${resourceName}`,
      err
    );
    return { proceed: false, reason: "Policy evaluation error" };
  }
};

// ─── Plugin definition ────────────────────────────────────────────────────────

let rulesWatcher: WatcherHandle | null = null;

const plugin: OpenclawPlugin = {
  name: "policy-engine",
  version: "1.0.0",

  activate(ctx: OpenclawPluginContext) {
    ctx.registerPolicyEngine(abacEngine);
    ctx.onPolicyLoad((policy) => abacEngine.addPolicy(policy));

    ctx.registerHook("before_tool_call", beforeToolCallHandler);
    ctx.registerHook("before_prompt_build", beforePromptBuildHandler);
    ctx.registerHook("before_model_resolve", beforeModelResolveHandler);

    rulesWatcher = startRulesWatcher(cedarEngineRef);

    console.log("[plugin:policy-engine] activated – lifecycle hooks registered");
  },

  async deactivate() {
    if (rulesWatcher !== null) {
      await rulesWatcher.stop();
      rulesWatcher = null;
    }
    console.log("[plugin:policy-engine] deactivated");
  },
};

export default plugin;
