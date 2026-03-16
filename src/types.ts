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
