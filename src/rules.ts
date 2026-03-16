import { TPolicyCondition, TPolicyRule, TEvaluationContext } from "./types.js";

function getFieldValue(
  context: TEvaluationContext,
  field: string
): unknown {
  const parts = field.split(".");
  let current: Record<string, unknown> = {
    subject: context.subject,
    resource: context.resource,
    action: context.action,
    environment: context.environment ?? {},
  };

  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part] as Record<string, unknown>;
  }

  return current;
}

function evaluateCondition(
  condition: TPolicyCondition,
  context: TEvaluationContext
): boolean {
  const fieldValue = getFieldValue(context, condition.field);

  switch (condition.operator) {
    case "eq":
      return fieldValue === condition.value;
    case "neq":
      return fieldValue !== condition.value;
    case "in":
      return Array.isArray(condition.value) &&
        condition.value.includes(fieldValue);
    case "nin":
      return Array.isArray(condition.value) &&
        !condition.value.includes(fieldValue);
    case "contains":
      return typeof fieldValue === "string" &&
        typeof condition.value === "string" &&
        fieldValue.includes(condition.value);
    case "startsWith":
      return typeof fieldValue === "string" &&
        typeof condition.value === "string" &&
        fieldValue.startsWith(condition.value);
    case "regex":
      return typeof fieldValue === "string" &&
        typeof condition.value === "string" &&
        new RegExp(condition.value).test(fieldValue);
    default:
      return false;
  }
}

export function evaluateRule(
  rule: TPolicyRule,
  context: TEvaluationContext
): boolean {
  return rule.conditions.every((condition) =>
    evaluateCondition(condition, context)
  );
}

export function sortRulesByPriority(rules: TPolicyRule[]): TPolicyRule[] {
  return [...rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}
