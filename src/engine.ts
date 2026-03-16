import { TPolicy, TEvaluationContext, TEvaluationResult } from "./types.js";
import { evaluateRule, sortRulesByPriority } from "./rules.js";
import { AuditLogger } from "./audit.js";

export interface PolicyEngineOptions {
  auditLogger?: AuditLogger;
}

export class PolicyEngine {
  private policies: Map<string, TPolicy> = new Map();
  private auditLogger?: AuditLogger;

  constructor(options: PolicyEngineOptions = {}) {
    if (options.auditLogger !== undefined) {
      this.auditLogger = options.auditLogger;
    }
  }

  addPolicy(policy: TPolicy): void {
    this.policies.set(policy.id, policy);
  }

  removePolicy(policyId: string): boolean {
    return this.policies.delete(policyId);
  }

  getPolicy(policyId: string): TPolicy | undefined {
    return this.policies.get(policyId);
  }

  listPolicies(): TPolicy[] {
    return Array.from(this.policies.values());
  }

  async evaluate(
    policyId: string,
    context: TEvaluationContext
  ): Promise<TEvaluationResult> {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Policy not found: ${policyId}`);
    }

    const sortedRules = sortRulesByPriority(policy.rules);

    for (const rule of sortedRules) {
      if (evaluateRule(rule, context)) {
        const result: TEvaluationResult = {
          allowed: rule.effect === "allow",
          effect: rule.effect,
          matchedRuleId: rule.id,
          ...(rule.description !== undefined ? { reason: rule.description } : {}),
        };

        await this.auditLogger?.log(policy, context, result);
        return result;
      }
    }

    const defaultResult: TEvaluationResult = {
      allowed: policy.defaultEffect === "allow",
      effect: policy.defaultEffect,
      reason: "No matching rule; default effect applied",
    };

    await this.auditLogger?.log(policy, context, defaultResult);
    return defaultResult;
  }

  async evaluateAll(
    context: TEvaluationContext
  ): Promise<Map<string, TEvaluationResult>> {
    const results = new Map<string, TEvaluationResult>();
    for (const policy of this.policies.values()) {
      results.set(policy.id, await this.evaluate(policy.id, context));
    }
    return results;
  }
}
