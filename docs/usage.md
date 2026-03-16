# Usage Guide

This document covers common policy patterns, usage examples for both policy engines, and how to use the UI dashboard.

## Two Policy Engines

Open Authority ships with two complementary engines:

| Engine | Module | Semantics | Best for |
|---|---|---|---|
| **ABAC engine** | `src/engine.ts` | allow / deny, priority-based | Structured attribute-based policies via TypeBox schemas |
| **Cedar-style engine** | `src/policy/engine.ts` | permit / forbid, forbid-wins | Lifecycle hooks, tool/command/prompt/model gating, rate limiting |

The Cedar-style engine powers the three openclaw lifecycle hooks (`before_tool_call`, `before_prompt_build`, `before_model_resolve`). The ABAC engine is exposed through the `policy-evaluation` capability and available for direct programmatic use.

---

## Cedar-Style Engine: Common Patterns

Rules are defined in `src/policy/rules.ts` as a plain array exported as the default export. The hot-reload watcher picks up changes automatically.

### Permitting a specific tool

```typescript
{
  effect: "permit",
  resource: "tool",
  match: "read_file",
  reason: "Allow reading files"
}
```

### Wildcard matching

Use `*` as the entire match string to match any resource name of the given type:

```typescript
{
  effect: "permit",
  resource: "tool",
  match: "*",
  reason: "Permit all tools (catch-all)"
}
```

### RegExp matching

```typescript
{
  effect: "permit",
  resource: "tool",
  match: /^(read_file|list_dir|glob)$/,
  reason: "Read-only tool set"
}
```

### Restricting by channel

Use a `condition` function to gate access by the caller's channel:

```typescript
{
  effect: "permit",
  resource: "tool",
  match: "write_file",
  condition: (ctx) => ["trusted", "admin", "ci"].includes(ctx.channel),
  reason: "Only trusted channels may write"
}
```

### Restricting by agent ID

```typescript
{
  effect: "permit",
  resource: "channel",
  match: "admin",
  condition: (ctx) => ctx.agentId.startsWith("admin-"),
  reason: "Admin channel reserved for admin agents"
}
```

### Forbidding destructive commands

`forbid` rules take precedence over any `permit` rule (Cedar semantics):

```typescript
{
  effect: "forbid",
  resource: "command",
  match: /^(rm|rmdir|dd|shred)$/,
  reason: "Destructive commands are never permitted"
}
```

### Restricting models by provider

```typescript
{
  effect: "forbid",
  resource: "model",
  match: /^(openai|google|mistral)\//,
  reason: "Only Anthropic models are approved"
}
```

### Rate limiting

Add a `rateLimit` object to any `permit` rule. The engine converts it to a `forbid` if the window is exceeded:

```typescript
{
  effect: "permit",
  resource: "tool",
  match: "write_file",
  rateLimit: {
    maxCalls: 20,
    windowSeconds: 60
  },
  reason: "Allow writes, but max 20 per minute"
}
```

Rate limits track per-rule and per `agentId:resourceName` pair using a sliding window.

### Combined pattern: read-write split with rate limit

```typescript
const rules: Rule[] = [
  // Read-only tools: unlimited
  {
    effect: "permit",
    resource: "tool",
    match: /^(read_file|list_dir|search_files|glob)$/,
    reason: "Unrestricted read access"
  },

  // Write tools: rate-limited, trusted channels only
  {
    effect: "permit",
    resource: "tool",
    match: /^(write_file|edit_file|create_file)$/,
    condition: (ctx) => ["trusted", "admin", "ci"].includes(ctx.channel),
    rateLimit: { maxCalls: 50, windowSeconds: 3600 },
    reason: "Writes capped at 50/hour on trusted channels"
  },

  // Shell commands: forbidden entirely
  {
    effect: "forbid",
    resource: "tool",
    match: /^(bash|shell|terminal|run_command)$/,
    reason: "Shell access is disabled"
  }
];
```

---

## ABAC Engine: Common Patterns

The ABAC engine evaluates structured policies with typed conditions.

### Basic allow by role

```typescript
import { PolicyEngine, AuditLogger, consoleAuditHandler } from "@openauthority/policy-engine";

const auditLogger = new AuditLogger();
auditLogger.addHandler(consoleAuditHandler);

const engine = new PolicyEngine({ auditLogger });

engine.addPolicy({
  id: "document-access",
  name: "Document Access",
  version: "1.0.0",
  defaultEffect: "deny",
  rules: [
    {
      id: "admin-all",
      name: "Admins get full access",
      effect: "allow",
      priority: 10,
      conditions: [
        { field: "subject.role", operator: "eq", value: "admin" }
      ]
    },
    {
      id: "editor-write",
      name: "Editors can write",
      effect: "allow",
      priority: 5,
      conditions: [
        { field: "subject.role", operator: "eq", value: "editor" },
        { field: "action", operator: "in", value: ["read", "write"] }
      ]
    },
    {
      id: "viewer-read",
      name: "Viewers can only read",
      effect: "allow",
      priority: 1,
      conditions: [
        { field: "subject.role", operator: "eq", value: "viewer" },
        { field: "action", operator: "eq", value: "read" }
      ]
    }
  ]
});

const result = await engine.evaluate("document-access", {
  subject: { id: "user-1", role: "editor" },
  resource: { id: "doc-42", type: "document" },
  action: "write"
});

console.log(result.allowed);       // true
console.log(result.matchedRuleId); // "editor-write"
```

### Deny by attribute

```typescript
engine.addPolicy({
  id: "sensitive-data",
  name: "Sensitive Data Protection",
  version: "1.0.0",
  defaultEffect: "allow",
  rules: [
    {
      id: "block-contractors",
      name: "Contractors cannot access sensitive resources",
      effect: "deny",
      priority: 20,
      conditions: [
        { field: "subject.type", operator: "eq", value: "contractor" },
        { field: "resource.sensitivity", operator: "eq", value: "high" }
      ]
    }
  ]
});
```

### Using regex conditions

```typescript
{
  id: "service-account-rule",
  name: "Service accounts match svc- prefix",
  effect: "allow",
  priority: 5,
  conditions: [
    { field: "subject.id", operator: "regex", value: "^svc-" },
    { field: "action", operator: "in", value: ["read", "list"] }
  ]
}
```

### Evaluating all policies

```typescript
const results = await engine.evaluateAll({
  subject: { id: "user-1", role: "admin" },
  resource: { id: "file.txt", type: "file" },
  action: "delete"
});

// results is a Map<policyId, EvaluationResult>
for (const [policyId, result] of results) {
  console.log(`${policyId}: ${result.allowed}`);
}
```

---

## Audit Logging

### Console logging

```typescript
import { AuditLogger, consoleAuditHandler } from "@openauthority/policy-engine";

const logger = new AuditLogger();
logger.addHandler(consoleAuditHandler);
```

### File logging (JSONL)

```typescript
import { AuditLogger, JsonlAuditLogger } from "@openauthority/policy-engine";

const jsonlLogger = new JsonlAuditLogger("/var/log/openauthority/audit.jsonl");
const logger = new AuditLogger();
logger.addHandler(jsonlLogger.handler);
```

### Multiple sinks

```typescript
logger.addHandler(consoleAuditHandler);
logger.addHandler(jsonlLogger.handler);
```

### Custom handler

```typescript
logger.addHandler(async (entry) => {
  await sendToSplunk(entry);
});
```

---

## Hot Reload

The plugin watches `src/policy/rules.ts` and reloads the Cedar engine automatically when the file changes, without restarting openclaw.

1. Edit `src/policy/rules.ts`
2. Save the file
3. After a 300 ms debounce, the engine reloads
4. The new rule set takes effect immediately for all subsequent requests

If the updated file fails to parse or throws during import, the previous engine instance remains active and an error is logged.

---

## UI Dashboard

### Managing rules

1. Open `http://localhost:7331` in your browser
2. Navigate to **Authorities** in the top navigation
3. The **Rules Table** shows all current rules with sort and filter options
4. Click **New Rule** to open the rule editor
5. Fill in effect, resource, match, and optional fields
6. Click **Save** — the rule is persisted to the rules file immediately

### Viewing the audit log

1. Navigate to **Audit Log**
2. Use the date range, agent ID, and resource type filters to narrow entries
3. Live entries stream in real time via SSE as policy decisions are made
4. Historical entries are paginated (default 10 per page)

### Policy coverage map

Navigate to **Coverage Map** to see a matrix of which resource types have permit and forbid rules defined. Cells with rate-limited rules display an ⏱ badge. Hover over a cell to see matched rules and their rate limit details.

---

## Default Rule Set

The plugin ships with 24 default rules in `src/policy/rules.ts` covering five resource types. These are production-ready defaults suitable for most deployments. Override or extend them by editing the file or using the UI dashboard.

### What the defaults permit

- **Tools**: Read-only tools (read_file, list_dir, search_files, glob) for all channels; write tools only on trusted/admin/ci channels
- **Commands**: Safe read-only shell commands (ls, cat, grep, etc.) for all; git/package managers only on trusted channels with an authenticated user
- **Channels**: `default`, `trusted`, `ci`, `readonly` open; `untrusted` blocked; `admin` requires `admin-` agent ID prefix
- **Prompts**: `user:*` open; `system:*` blocked; jailbreak patterns blocked; `custom:*` requires authenticated user
- **Models**: Anthropic Claude models permitted; preview/experimental variants require admin agent; non-Anthropic providers blocked
