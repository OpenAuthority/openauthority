OPEN AUTHORITY

# policy-engine

Authorization policy engine plugin for [openclaw](https://github.com/Firma-AI/openauthority). Evaluates ABAC/RBAC policies with structured rules and built-in audit logging. Includes a UI dashboard for rule management and live audit streaming.

## Documentation

| Guide | Description |
|---|---|
| [Installation](docs/installation.md) | Step-by-step setup for the plugin and UI dashboard |
| [Configuration](docs/configuration.md) | All configuration options and schema reference |
| [Usage](docs/usage.md) | Common policy patterns and examples |
| [API Reference](docs/api.md) | REST endpoints for the dashboard server |
| [Troubleshooting](docs/troubleshooting.md) | Common issues and fixes |
| [Architecture](docs/architecture.md) | Design overview and key decisions |
| [Contributing](docs/contributing.md) | Development setup and PR process |
| [Cedar Compilation](docs/cedar-compilation.md) | Cedar policy language compilation guide |
| [SecuritySPEC Schema](docs/securityspec-schema.md) | SecuritySPEC YAML schema reference |

## Quick Start

```bash
# Install into openclaw plugins directory
git clone https://github.com/Firma-AI/openauthority ~/.openclaw/plugins/policy-engine
cd ~/.openclaw/plugins/policy-engine
npm install && npm run build
```

Register in `~/.openclaw/config.json`:

```json
{
  "plugins": ["policy-engine"]
}
```

## Usage

Define a policy and evaluate it against a context:

```typescript
import { PolicyEngine, AuditLogger, consoleAuditHandler } from "@openauthority/policy-engine";

const auditLogger = new AuditLogger();
auditLogger.addHandler(consoleAuditHandler);

const engine = new PolicyEngine({ auditLogger });

engine.addPolicy({
  id: "resource-access",
  name: "Resource Access Policy",
  version: "1.0.0",
  defaultEffect: "deny",
  rules: [
    {
      id: "admin-allow",
      name: "Allow admins",
      effect: "allow",
      priority: 10,
      conditions: [
        { field: "subject.role", operator: "eq", value: "admin" }
      ]
    }
  ]
});

const result = await engine.evaluate("resource-access", {
  subject: { id: "user-1", role: "admin" },
  resource: { id: "doc-42", type: "document" },
  action: "read"
});

console.log(result.allowed); // true
```

## Development

```bash
# Install dependencies
npm install

# Watch mode
npm run dev

# Build
npm run build

# Clean build artifacts
npm run clean

# Tests
npm test
```

## Project Structure

```
src/
  index.ts        — Plugin entry point and openclaw integration
  engine.ts       — PolicyEngine class (add/remove/evaluate policies)
  rules.ts        — Rule evaluation logic and condition operators
  types.ts        — TypeBox schemas and TypeScript types
  audit.ts        — AuditLogger and audit handlers
  watcher.ts      — Hot-reload file watcher
  policy/
    engine.ts     — Cedar-style PolicyEngine (forbid-wins, rate limiting)
    types.ts      — Cedar types (Effect, Resource, Rule, RuleContext)
    rules.ts      — Default rule set (24 rules across 5 resource types)
ui/
  server.ts       — Express dashboard server
  routes/
    rules.ts      — Rules CRUD API
    audit.ts      — Audit log API and SSE streaming
  client/         — React 18 + Vite SPA
docs/             — Full documentation
```

## License

MIT
