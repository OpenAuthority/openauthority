# Architecture Overview

This document describes the design of the Open Authority policy engine plugin, the decisions behind the architecture, and how the components fit together.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         openclaw                             │
│                                                              │
│  ┌─────────────┐   hook events   ┌───────────────────────┐  │
│  │   Agent /   │ ──────────────► │   policy-engine        │  │
│  │   Gateway   │ ◄────────────── │   plugin (index.ts)    │  │
│  └─────────────┘   allow/block   └──────────┬────────────┘  │
│                                              │               │
└──────────────────────────────────────────────┼───────────────┘
                                               │
               ┌───────────────────────────────┼──────────┐
               │           Plugin Core          │          │
               │                               │          │
               │  ┌──────────────────┐  ┌──────▼───────┐  │
               │  │  ABAC Engine     │  │  Cedar Engine │  │
               │  │  (engine.ts)     │  │  (policy/     │  │
               │  │                  │  │   engine.ts)  │  │
               │  └──────────────────┘  └──────┬───────┘  │
               │                               │          │
               │  ┌──────────────────┐  ┌──────▼───────┐  │
               │  │  Audit Logger    │  │  Rules Watcher│  │
               │  │  (audit.ts)      │  │  (watcher.ts) │  │
               │  └──────────────────┘  └──────────────┘  │
               │                                           │
               └────────────────────────────────────┬──────┘
                                                    │
                          ┌─────────────────────────▼──────┐
                          │       UI Dashboard (ui/)         │
                          │                                  │
                          │  Express server ─── React SPA    │
                          │  REST API        ─── SSE stream  │
                          └──────────────────────────────────┘
```

---

## Plugin Lifecycle

openclaw loads the plugin by importing `dist/index.js`. The module export must conform to the openclaw plugin interface, which consists of:

- A `capabilities` array declaring what the plugin provides
- Hook handler functions for lifecycle events
- `activate()` and `deactivate()` methods for startup and shutdown

### activate()

On activation the plugin:

1. Constructs both the ABAC `PolicyEngine` and Cedar-style `PolicyEngine`
2. Loads the default rules into the Cedar engine
3. Starts the file watcher via `startRulesWatcher()`, receiving a `WatcherHandle`
4. Wraps the Cedar engine in a mutable `engineRef: { current: Engine }` container

The `engineRef` container is the key to hot reload: hook handlers dereference `.current` at call time, so the watcher can atomically swap in a new engine without touching the hooks.

### deactivate()

On deactivation the plugin calls `watcherHandle.stop()` to shut down the chokidar watcher. The watcher is created with `persistent: false`, so it does not keep the Node process alive independently.

---

## Two-Engine Design

### Why two engines?

The plugin exposes two distinct evaluation models because they serve different use cases:

| | ABAC Engine | Cedar-Style Engine |
|---|---|---|
| **Semantics** | Priority-ordered, allow/deny | Forbid-wins, permit/forbid |
| **Rule format** | TypeBox-validated schema | Plain TypeScript objects |
| **Conditions** | Structured field/operator/value | Arbitrary functions |
| **Rate limiting** | Not supported | Built-in sliding window |
| **Use case** | Attribute-based access control | Lifecycle hook gating |

The **ABAC engine** is designed for policy-as-data: rules are structured JSON, validated by TypeBox, and can be stored, queried, and audited systematically. It supports complex attribute matching with dot-notation field paths and eight comparison operators.

The **Cedar-style engine** is designed for lifecycle hooks: it needs to answer permit/forbid quickly, support runtime conditions and rate limits, and use the Cedar semantics where an explicit forbid always wins. It is named "Cedar-style" because it follows the same deny-overrides principle as AWS Cedar, though it is a custom implementation.

### Cedar semantics: forbid wins

In the Cedar engine, evaluation short-circuits on the first matching `forbid` rule without checking rate limits. Only after all `forbid` rules are checked without a match are `permit` rules evaluated. If a `permit` rule is matched and it has a `rateLimit`, the rate limit is applied — if exceeded, the result is converted to `forbid`.

This means:
- `forbid` rules are absolute; they cannot be overridden by any `permit` rule
- Rate limits only reduce the scope of `permit`; they can never make a `forbid` into a `permit`

### Implicit deny

If no rule matches a request, the Cedar engine returns `forbid` with reason `"implicit deny"`. The ABAC engine uses a configurable `defaultEffect` per policy.

---

## Hot Reload Architecture

Editing `src/policy/rules.ts` triggers a live engine swap without restarting the gateway. This works through three mechanisms working together:

### 1. Mutable engine reference

```typescript
const cedarEngineRef: { current: PolicyEngine } = {
  current: new PolicyEngine()
};
```

Hook handlers dereference `.current` on every invocation:

```typescript
hooks.before_tool_call = async (event) => {
  const result = cedarEngineRef.current.evaluate(...);
  // ...
};
```

Swapping `cedarEngineRef.current` atomically updates all three hooks simultaneously.

### 2. ESM cache busting

Node.js caches ESM modules by URL. To force a fresh import, a timestamp query parameter is appended to the file URL:

```typescript
const url = new URL(`./policy/rules.js?t=${Date.now()}`, import.meta.url).href;
const { default: rules } = await import(url);
```

Each unique URL is treated as a separate cache entry, guaranteeing a fresh module evaluation.

### 3. Debounced file watcher

The chokidar watcher fires on every file system event. A 300 ms debounce coalesces rapid saves into a single reload:

```typescript
let debounceTimer: NodeJS.Timeout | undefined;

watcher.on("change", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    // reload
  }, 300);
});
```

### Error isolation

If the reload throws (syntax error, invalid export, etc.), the catch block logs the error and returns early without touching `cedarEngineRef.current`. The previous engine remains active until a successful reload.

---

## Rate Limiting Design

Rate limits are implemented as sliding windows stored in memory.

### Data structure

```
Map<Rule, Map<string, number[]>>
      │              │       └─ array of call timestamps (ms)
      │              └─ key: "${agentId}:${resourceName}"
      └─ rule reference (identity, not id)
```

Each rule carries its own per-caller timestamp array. This allows different rules for the same resource to have independent rate limit counters.

### Sliding window algorithm

On each `evaluate()` call for a permit rule with `rateLimit`:

1. Look up the timestamp array for `(rule, agentId:resourceName)`
2. Filter out entries older than `Date.now() - windowSeconds * 1000`
3. If `filteredEntries.length >= maxCalls`: return `forbid` (rate limit exceeded), do not record
4. Otherwise: push `Date.now()`, write back, return `permit` with current count

### Cleanup

Expired entries are only removed during evaluation of a specific rule/caller pair, or when `cleanup()` is called. This is a deliberate trade-off: per-evaluation cleanup keeps hot paths fast, while the explicit `cleanup()` sweeps the entire map.

The optional `cleanupIntervalMs` constructor parameter enables a background timer that calls `cleanup()` on an interval.

---

## Prompt Injection Detection

The `before_prompt_build` hook checks prompt text against 8 regex patterns before policy evaluation:

```
/ignore\s+(previous|prior|all)\s+instructions/i
/disregard\s+(previous|prior|all|the)/i
/forget\s+(previous|prior|all|the|your)/i
/DAN\s+mode/i
/jailbreak/i
/bypass\s+(safety|restrictions|guidelines|policies)/i
/override\s+(system\s+)?prompt/i
/you\s+are\s+now\s+.*(different|new|another)\s+AI/i
```

If any pattern matches, the hook blocks the prompt and returns a rejection reason without performing policy evaluation. This provides a hard-coded safety layer independent of the configurable rule set.

---

## UI Dashboard Architecture

The dashboard is a thin Express server with a React SPA client.

### Server (`ui/server.ts`)

- Single Express app with CORS for the Vite dev server origin
- Routes mounted under `/api/`
- Static files served from `client/dist/`
- SPA fallback: any `404` that is not an API route serves `index.html`

### Rules persistence (`ui/routes/rules.ts`)

Rules are persisted to a JSON file on every create, update, and delete. Reads load the full file into memory. There is no database; the file is the source of truth. The directory is created recursively on first write.

### Audit log (`ui/routes/audit.ts`)

Two complementary data sources:

1. **JSONL file** — Historical entries, streamed line by line on read to avoid loading the full file into memory
2. **In-memory ring buffer** — Recent entries (max 1000), combined with file entries on `GET /api/audit`

Live streaming uses SSE. The server maintains a `Set<Response>` of connected clients. On `POST /api/audit`, the entry is pushed to the ring buffer and broadcast to all clients via `res.write()`.

A mock data generator fires every 3 seconds when at least one SSE client is connected, enabling UI development without a live engine.

### Client (`ui/client/src/`)

Single-page React application built with Vite. Navigation via React Router v6. Pages:

- **Home** — Welcome and overview
- **Authorities** — Rule management (RulesTable + RuleEditor views)
- **Audit Log** — Paginated log with live SSE feed
- **Coverage Map** — Matrix visualization of rule coverage by resource and effect
- **Settings** — Configuration options

Component CSS files are co-located with their view file in `ui/client/src/views/`.

---

## Design Decisions

### Why not a database?

The plugin is designed to be installed as a standalone openclaw plugin, not as a service requiring infrastructure. A JSON file for rules and a JSONL file for audit logs eliminates operational dependencies and keeps the plugin self-contained.

For production deployments with high audit log volume, the `AUDIT_LOG_FILE` path can point to a log-rotated file managed externally.

### Why ESM?

The plugin uses Node ESM (`"type": "module"`, `"module": "NodeNext"`) to match the openclaw plugin host environment and to take advantage of native top-level async. The ESM cache-busting approach for hot reload depends on ESM semantics.

### Why chokidar?

chokidar provides reliable cross-platform file watching with efficient event batching. It is widely used in the Node ecosystem and supports the `persistent: false` option needed for clean plugin shutdown.

### Why TypeBox for the ABAC engine?

TypeBox generates both runtime validators and TypeScript types from a single schema definition, eliminating the risk of type drift between the validator and the TypeScript interface. It produces JSON Schema–compatible schemas, making them useful for documentation and external tooling.

### Forbid-wins vs. permit-wins

The Cedar-style engine uses forbid-wins (deny-overrides) semantics rather than permit-wins. This is a security-conservative choice: an incorrectly written permit rule cannot accidentally override a security restriction. Administrators must explicitly remove `forbid` rules to expand access, rather than relying on rule ordering or priority to prevent conflicts.
