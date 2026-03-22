# Human-in-the-Loop (HITL)

> **Status: framework built, integration pending.** The policy schema, action matcher, file parser, and hot-reload watcher are built and fully tested. The remaining work is: (1) wiring `checkAction()` into the `before_tool_call` hook, and (2) building the Telegram approval adapter. See the [roadmap](roadmap.md) for details.

This guide covers how OpenAuthority will route high-stakes agent actions to a human for approval before execution, using Telegram or other messaging channels.

---

## Why HITL Matters

AI agents interpret instructions. Sometimes they interpret them wrong. "Clean up this thread" becomes "delete 340 emails." "Organize my files" becomes "move everything, including `.env`."

The HITL system ensures that irreversible or high-impact actions require explicit human approval before they execute. The agent pauses, a message is sent to you via Telegram (or another channel), and the action only proceeds if you approve.

This is not a prompt asking the model to check with you. It is a code-level gate in the execution path. The model cannot decide to skip it, forget it, or reason its way around it.

---

## How It Works

```
Agent attempts email.delete
        │
        ▼
  HITL matcher checks action against policies
        │
        ├── No match → action proceeds to policy engine
        │
        └── Match found → approval required
                │
                ▼
        Approval request sent to channel (e.g. Telegram)
                │
                ├── User approves  → action proceeds
                ├── User rejects   → action blocked, agent notified
                └── Timeout        → fallback applies (deny or auto-approve)
```

When integrated, the HITL check will happen **before** the policy engine evaluation. If an action matches a HITL policy, it will need to be approved by a human before any other rules are evaluated.

---

## Policy File Format

HITL policies are defined in a YAML or JSON file. The file is hot-reloaded --- edit it while the plugin is running and the new policies take effect immediately.

### YAML example

```yaml
version: "1"
policies:
  - name: destructive-actions
    description: Require approval before deleting anything
    actions:
      - "email.delete"
      - "file.delete"
      - "calendar.delete"
    approval:
      channel: telegram
      timeout: 120
      fallback: deny
    tags: [safety, production]

  - name: external-communication
    description: Human must approve outbound messages
    actions:
      - "email.send"
      - "slack.send"
      - "sms.send"
    approval:
      channel: telegram
      timeout: 180
      fallback: deny
    tags: [communication]

  - name: deployment-actions
    description: All deploy actions need sign-off
    actions:
      - "*.deploy"
      - "*.publish"
    approval:
      channel: telegram
      timeout: 300
      fallback: deny
    tags: [ops, deploy]
```

### JSON example

```json
{
  "version": "1",
  "policies": [
    {
      "name": "destructive-actions",
      "actions": ["email.delete", "file.delete"],
      "approval": {
        "channel": "telegram",
        "timeout": 120,
        "fallback": "deny"
      }
    }
  ]
}
```

---

## Schema Reference

### Top-level: `HitlPolicyConfig`

| Field | Type | Required | Description |
|---|---|---|---|
| `version` | `string` | Yes | Schema version. Must be `"1"`. |
| `policies` | `HitlPolicy[]` | Yes | Ordered list of policies. First match wins. |

### Policy: `HitlPolicy`

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | Yes | Human-readable name for this policy. |
| `description` | `string` | No | Documentation / explanation. |
| `actions` | `string[]` | Yes | Action patterns that require approval. Min 1. |
| `approval` | `HitlApprovalConfig` | Yes | Where and how to request approval. |
| `tags` | `string[]` | No | Tags for filtering or categorisation. |

### Approval config: `HitlApprovalConfig`

| Field | Type | Required | Description |
|---|---|---|---|
| `channel` | `string` | Yes | Channel to send approval requests to. Examples: `"telegram"`, `"slack"`, `"console"`. |
| `timeout` | `number` | Yes | Seconds to wait for a response. Minimum: 1. |
| `fallback` | `"deny"` \| `"auto-approve"` | Yes | What happens when timeout elapses without a response. |

### Fallback behaviour

| Value | Behaviour |
|---|---|
| `"deny"` | Action is blocked. Agent receives a rejection. Safest option for production. |
| `"auto-approve"` | Action proceeds after timeout. Use only for low-risk actions where blocking would degrade the user experience. |

---

## Action Pattern Matching

Patterns use dot-notation with per-segment wildcards.

### Rules

1. `"*"` alone matches **any** action string, regardless of segment count.
2. Exact match: `"email.delete"` matches only `"email.delete"`.
3. Per-segment wildcard: `"email.*"` matches `"email.send"`, `"email.delete"`, etc.
4. Patterns with **different segment counts** do NOT match. `"email.*"` does not match `"email"` or `"email.draft.save"`.

### Examples

| Pattern | Input | Result |
|---|---|---|
| `"*"` | `"anything.at.all"` | Match |
| `"email.delete"` | `"email.delete"` | Match |
| `"email.delete"` | `"email.send"` | No match |
| `"email.*"` | `"email.send"` | Match |
| `"email.*"` | `"file.delete"` | No match |
| `"email.*"` | `"email.draft.save"` | No match (3 segments vs 2) |
| `"*.delete"` | `"email.delete"` | Match |
| `"*.delete"` | `"file.delete"` | Match |
| `"*.delete"` | `"email.send"` | No match |

### Evaluation order

Policies are evaluated in **declaration order**. The first policy with a matching pattern wins. Subsequent policies are not checked for that action.

This means you can layer policies from most specific to most general:

```yaml
policies:
  # Specific: financial deletes need finance team approval
  - name: finance-delete
    actions: ["invoice.delete", "payment.delete"]
    approval:
      channel: telegram
      timeout: 300
      fallback: deny

  # General: all other deletes need standard approval
  - name: general-delete
    actions: ["*.delete"]
    approval:
      channel: telegram
      timeout: 120
      fallback: deny
```

---

## Approval Channels

The `channel` field in the approval config determines where the approval request is sent. The HITL framework is channel-agnostic --- it defines the policy and matching logic, while the actual message delivery is handled by channel adapters.

### Telegram

The primary integration target. When an action requires approval:

1. The plugin sends a message to the configured Telegram chat/bot with details of the requested action (tool name, arguments, agent context)
2. The user replies with an approve or reject decision
3. The plugin receives the response and either allows or blocks the action

**Timeout handling:** If no response is received within the configured timeout, the fallback action applies. For `deny`, the agent receives a structured rejection: `"action timed out, no operation performed."`

### Other channels

The architecture supports any messaging channel that can send a message and receive a response. Future integrations:

- **Slack** --- approve/reject via message buttons
- **Web dashboard** --- approve/reject from the OpenAuthority UI
- **Console** --- interactive terminal prompt (development/testing)
- **Webhook** --- POST to any HTTP endpoint, await callback

---

## Hot Reload

The HITL policy file is watched for changes. When you edit and save the file:

1. The watcher detects the change (debounced at 300ms)
2. The file is re-parsed and validated
3. If valid, the new config is swapped in atomically
4. If invalid, the previous config remains active and an error is logged

This means you can add, remove, or modify HITL policies without restarting the plugin or the agent.

---

## Integration with the Policy Engine

When fully integrated, the HITL check will be one layer in the action pipeline:

```
Agent action
  │
  ▼
1. Normalise (raw event → action request)
  │
  ▼
2. HITL check (does this action need human approval?)    ← planned
  │── yes → route to approval channel, wait
  │── no  → continue
  │
  ▼
3. Policy evaluation (Cedar engine: permit / forbid / rate limit)
  │
  ▼
4. Execute (if permitted) or block (if denied)
  │
  ▼
5. Audit log (request + decision + result)
```

A HITL-approved action will still pass through the policy engine. Approval from a human will not bypass budget caps, capability gates, or forbid rules. The two systems are complementary:

- **HITL** answers: "Does a human consent to this action?"
- **Policy engine** answers: "Is this action permitted by the rules?"

Both must pass for the action to execute.

---

## Practical Examples

### Protecting against misinterpretation

Your agent has email access. A user types "clean up this thread." The agent interprets this as "delete all messages."

Without HITL: 340 emails deleted. No recovery.

With HITL:
```
Telegram message:
  OpenAuthority: Agent is requesting email.delete on 340
  messages in thread [Project Weekly].
  Approve? Reply YES or NO.

You reply: NO

Agent receives rejection. You clarify: "I meant archive, not delete."
Agent calls email.archive instead. 340 emails archived. Data intact.
```

### Budget-sensitive operations with fallback

```yaml
- name: expensive-operations
  actions: ["api.batch_process", "ml.train"]
  approval:
    channel: telegram
    timeout: 60
    fallback: deny
```

The agent wants to kick off a batch job that will cost $50 in API calls. You get a Telegram ping. If you're available, you approve. If you're asleep, the timeout fires and the action is denied. Your bill stays bounded.

### Multi-tier approval

```yaml
policies:
  # Tier 1: critical actions --- long timeout, always deny on timeout
  - name: critical
    actions: ["*.delete", "*.deploy", "payment.*"]
    approval:
      channel: telegram
      timeout: 300
      fallback: deny

  # Tier 2: reversible actions --- shorter timeout, auto-approve if no response
  - name: reversible
    actions: ["email.archive", "file.move"]
    approval:
      channel: telegram
      timeout: 60
      fallback: auto-approve
```

---

## Testing HITL Policies

The HITL system has a comprehensive test suite covering pattern matching, policy evaluation, schema validation, file parsing, and watcher behaviour.

```bash
npm test
```

Key test areas:
- **Pattern matching**: 13 test cases covering wildcards, exact match, segment count rules, edge cases
- **Policy evaluation**: first-match-wins semantics, no-match returns, optional fields
- **Schema validation**: required fields, type checking, edge cases
- **File parsing**: JSON and YAML formats, error handling
- **Watcher**: debounce, reload on change, error isolation, idempotent stop
