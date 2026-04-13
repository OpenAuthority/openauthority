# OpenAuthority

**A governance layer for AI agents. Define what your agent can do, enforce it at the boundary, and keep a human in the loop for what matters.**

OpenAuthority is a policy engine plugin for [OpenClaw](https://github.com/openclaw/openclaw) that sits between your AI agent and every tool it calls. It evaluates rules before execution happens --- not by asking the model to comply, but by intercepting the call at the code boundary. If the policy says no, the call is never placed.

## Why This Exists

AI agents are powerful. They're also unpredictable. A misconfigured cron job can burn through your API budget overnight. A third-party skill can silently read files outside its declared scope. An ambiguous instruction like "clean up this thread" can result in 340 deleted emails.

OpenAuthority gives you three things the agent runtime doesn't:

- **Hard enforcement** --- budget caps, capability gates, and tool restrictions that the model cannot bypass
- **Human-in-the-Loop (HITL)** --- route high-stakes actions to a human for approval via Telegram or other messaging channels before execution
- **Audit trail** --- every tool call logged at code level with exact arguments, timestamps, and policy decisions

## How It Works

```
Agent reasons → picks a tool → OpenAuthority intercepts
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
               Policy Engine    HITL Check       Audit Logger
               (permit/forbid)  (ask-user?)      (provenance log)
                    │                 │                 │
                    └─────────────────┼─────────────────┘
                                      │
                              allow ──┤── deny: call never placed
                                      │── ask-user: pause, route to
                                      │   human via Telegram/messaging
                                      ▼
                              Tool executes (or doesn't)
```

Every agent action flows through a pipeline:

1. **Normalise** --- the raw tool call is converted into a structured action request
2. **Evaluate** --- the Cedar-style policy engine checks rules (forbid-wins semantics)
3. **Gate** --- if `forbid`, the call is blocked; if `permit`, it proceeds. HITL `ask-user` routing is on the [roadmap](docs/roadmap.md).
4. **Audit** --- the decision is logged for provenance

## Human-in-the-Loop (HITL)

> **Status: framework built, integration pending.** The HITL policy schema, action pattern matcher, file parser, and hot-reload watcher are built and tested (48 test cases). The hook integration (wiring into `before_tool_call`) and the Telegram approval adapter are the next items on the [roadmap](docs/roadmap.md).

For irreversible or high-stakes actions, the HITL system will pause the agent and route the decision to a human for approval via Telegram or other messaging channels.

### How it will work

1. You declare which actions require approval in a policy file (YAML or JSON)
2. When the agent attempts a matching action, the plugin intercepts it
3. An approval request is sent to the configured channel (Telegram, Slack, or other messaging integration)
4. The agent waits for a response (approve/reject) or until timeout
5. On timeout, the configured fallback applies (`deny` or `auto-approve`)

### Example policy

```yaml
version: "1"
policies:
  - name: destructive-actions
    description: Require human approval for irreversible operations
    actions:
      - "email.delete"
      - "email.send"
      - "file.delete"
      - "*.deploy"
    approval:
      channel: telegram
      timeout: 120
      fallback: deny
    tags: [production, safety]

  - name: financial-actions
    actions:
      - "payment.*"
      - "invoice.send"
    approval:
      channel: telegram
      timeout: 300
      fallback: deny
    tags: [finance]
```

### Pattern matching

Actions use dot-notation with wildcards:

| Pattern | Matches | Does NOT match |
|---|---|---|
| `"email.delete"` | `email.delete` | `email.send`, `file.delete` |
| `"email.*"` | `email.delete`, `email.send` | `file.delete`, `email.draft.save` |
| `"*.delete"` | `email.delete`, `file.delete` | `email.send` |
| `"*"` | everything | --- |

Policies are evaluated in declaration order. First match wins.

For the full HITL reference, see [docs/human-in-the-loop.md](docs/human-in-the-loop.md).

## The Skill vs The Plugin

OpenAuthority ships as two components that serve different purposes:

| | **The Skill** | **The Plugin** |
|---|---|---|
| **Lives in** | Context window (model sees it) | Execution path (between agent + tools) |
| **Enforces via** | Model reasoning --- asks it to comply | Code boundary --- before call is placed |
| **Can be bypassed?** | Yes --- prompt injection, loop misfire | No --- operates outside the model's loop |
| **Gives you** | Observability + soft stop | Hard enforcement + immutable audit log |
| **Best for** | Day-one visibility, understanding your agent | Production, user-facing agents, anything irreversible |

**Start with the skill** to see what your agent is doing. **Graduate to the plugin** when you need enforcement that can't be talked past.

> *A skill asks the model to enforce. A plugin enforces regardless of what the model decides. This is not a marketing distinction --- it is an architectural one.*

## Quick Start

### Plugin installation

```bash
git clone https://github.com/Firma-AI/openauthority ~/.openclaw/plugins/openauthority
cd ~/.openclaw/plugins/openauthority
npm install && npm run build
```

Register in `~/.openclaw/config.json`:

```json
{
  "plugins": ["openauthority"]
}
```

### Define your policy

Create `data/rules.json` with your rules, or edit `src/policy/rules/default.ts` for TypeScript-based rules. The plugin hot-reloads on save --- no restart needed.

### HITL policy

Create a `hitl-policy.yaml` file:

```yaml
version: "1"
policies:
  - name: require-approval
    actions: ["email.delete", "file.delete", "*.deploy"]
    approval:
      channel: telegram
      timeout: 120
      fallback: deny
```

## Documentation

| Guide | Description |
|---|---|
| [Installation](docs/installation.md) | Step-by-step setup for the plugin and UI dashboard |
| [Configuration](docs/configuration.md) | All configuration options and schema reference |
| [Usage](docs/usage.md) | Common policy patterns and examples |
| [Human-in-the-Loop](docs/human-in-the-loop.md) | HITL approval flows, Telegram integration, and policy reference |
| [Architecture](docs/architecture.md) | Design overview, hooks pipeline, and key decisions |
| [API Reference](docs/api.md) | REST endpoints for the dashboard server |
| [Action Registry](docs/action-registry.md) | Canonical action classes, risk levels, and HITL modes |
| [Roadmap](docs/roadmap.md) | What's shipped, in progress, and planned next |
| [Troubleshooting](docs/troubleshooting.md) | Common issues and fixes |
| [Contributing](docs/contributing.md) | Development setup and PR process |

## Architecture

### Policy engine

Open Authority uses a single Cedar-style policy engine with **forbid-wins** semantics. Rules are evaluated against normalised action contexts. A single `forbid` rule overrides any number of `permit` rules.

| Feature | Detail |
|---|---|
| **Semantics** | Forbid-wins, permit/forbid |
| **Rule formats** | Action-class rules (TypeScript) + resource-match rules (JSON) |
| **Rate limiting** | Built-in sliding window per rule and agent |
| **Hot reload** | ~300 ms debounce, no restart required |

### Gateway hooks

The plugin implements the `before_tool_call` OpenClaw gateway hook:

- **`before_tool_call`** (active) --- primary enforcement hook. Normalises the tool call to a semantic action class, evaluates rules in Stage 1 (capability gate) and Stage 2 (Cedar engine). Can block execution or route to HITL.

### Key design decisions

- **Forbid-wins semantics** --- a single `forbid` rule overrides any number of `permit` rules. Security-conservative by default.
- **Configurable default** --- no matching rule defaults to `permit` (implicit allow) so OpenClaw tools are never accidentally blocked. Can be set to `forbid` for locked-down deployments.
- **Hot reload** --- edit rules, save, new rules take effect in ~300ms. No restart.
- **Fail closed** --- if the engine errors during evaluation, the action is denied.

## Project Structure

```
src/
  index.ts          — Plugin entry point and OpenClaw hook registration
  types.ts          — Core v0.1 runtime types (Intent, Capability, ExecutionEnvelope, CeeDecision)
  audit.ts          — JsonlAuditLogger for append-only JSONL audit log
  envelope.ts       — Re-export shim (buildEnvelope, sortedJsonStringify, uuidv7)
  watcher.ts        — Hot-reload watcher for JSON + TypeScript rules
  enforcement/
    pipeline.ts     — runPipeline, EnforcementPolicyEngine, envelope builder
    normalize.ts    — Action normalization registry (tool name → action_class)
    decision.ts     — StructuredDecision type layer
    stage2-policy.ts — Stage 2 evaluator factory
  policy/
    engine.ts       — Cedar-style PolicyEngine (forbid-wins, rate limiting)
    types.ts        — Rule, RuleContext, Effect, Resource, RateLimit
    rules/
      default.ts    — Baseline action-class rules (priority 10/90/100)
      index.ts      — mergeRules() + combined default export
  hitl/
    types.ts        — HITL policy schemas (TypeBox)
    matcher.ts      — Action pattern matching (dot-notation wildcards)
    parser.ts       — YAML/JSON policy file parsing and validation
    watcher.ts      — HITL policy hot-reload watcher
    approval-manager.ts — Approval lifecycle and token management
    telegram.ts     — Telegram approval channel adapter
    slack.ts        — Slack approval channel adapter
  adapter/
    index.ts        — IAuthorityAdapter interface
    file-adapter.ts — File-based adapter implementation
skills/
  token-budget/     — /token-budget skill for ClawHub (token tracking, spend alerts)
  whatdidyoudo/     — /whatdidyoudo skill for ClawHub (action replay log)
  human-approval/   — /human-approval skill for ClawHub (soft HITL approval gate)
ui/
  server.ts         — Express dashboard server
  routes/
    rules.ts        — Rules CRUD API
    audit.ts        — Audit log API and SSE streaming
  client/           — React 18 + Vite SPA
docs/               — Full documentation
data/
  rules.json        — JSON-format runtime rules (hot-reloaded)
  audit.jsonl       — Append-only JSONL audit log
  bundles/          — Policy bundle directory
```

## Development

```bash
npm install       # Install dependencies
npm run dev       # Watch mode (TypeScript recompilation on save)
npm run build     # Production build
npm test          # Run test suite (vitest)
npm run clean     # Remove dist/
```

## Roadmap

- **Telegram/messaging bot integration** --- live approval routing for HITL `ask-user` decisions, with approve/reject buttons and timeout handling
- **Structured Decision objects** --- enrich policy responses with `ruleId` for audit traceability and capability scaffolds for credential injection
- **Capability registration** --- register as an OpenClaw capability provider for full hook coverage across all tool execution paths
- **Control plane API** --- multi-tenant policy management with migration support
- **Web dashboard HITL view** --- approve/reject pending actions from the UI dashboard

## License

Apache-2.0
