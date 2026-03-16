# Contributing Guide

Thank you for contributing to Open Authority. This guide covers development setup, code conventions, testing requirements, and the pull request process.

---

## Development Setup

### Prerequisites

- Node.js 18 or later
- npm 9 or later
- Git

### Clone and install

```bash
git clone https://github.com/Firma-AI/openauthority
cd openauthority

# Plugin dependencies
npm install

# UI server dependencies
cd ui && npm install

# UI client dependencies
cd client && npm install
```

### Start development servers

```bash
# In one terminal: plugin (watch mode)
npm run dev

# In another terminal: UI server (watch mode)
cd ui && npm run dev

# In another terminal: Vite client dev server
cd ui/client && npm run dev
```

The dashboard is available at `http://localhost:7331` (served by Express) or `http://localhost:5173` (Vite HMR, proxied to the Express API).

---

## Project Structure

```
openauthority/
├── src/                        # Policy engine source
│   ├── index.ts                # Plugin entry point and openclaw hooks
│   ├── engine.ts               # ABAC PolicyEngine class
│   ├── rules.ts                # Rule evaluation and condition operators
│   ├── types.ts                # TypeBox schemas and TypeScript types
│   ├── audit.ts                # AuditLogger and handlers
│   ├── watcher.ts              # Hot-reload file watcher
│   └── policy/
│       ├── engine.ts           # Cedar-style PolicyEngine
│       ├── types.ts            # Cedar types (Effect, Resource, Rule, RuleContext)
│       ├── rules.ts            # Default rule set
│       └── engine.test.ts      # Cedar engine tests
│
├── ui/
│   ├── server.ts               # Express server entry point
│   ├── routes/
│   │   ├── rules.ts            # Rules CRUD API
│   │   └── audit.ts            # Audit log API and SSE
│   └── client/
│       ├── src/
│       │   ├── api.ts          # HTTP client for the REST API
│       │   ├── pages/          # React page components
│       │   ├── views/          # Reusable view components + CSS
│       │   ├── components/     # Shared UI components
│       │   └── test/
│       │       └── setup.ts    # Test setup (jest-dom)
│       ├── vitest.config.ts
│       └── package.json
│
├── docs/                       # Documentation
├── data/                       # Persisted rules and audit log (gitignored)
├── openclaw.plugin.json        # Plugin manifest
├── tsconfig.json
└── package.json
```

---

## Code Conventions

### TypeScript

- **Strict mode** is enabled. All code must satisfy `strict: true`.
- Use `.js` extensions on all relative imports in ESM source files:
  ```typescript
  import { PolicyEngine } from "./policy/engine.js"; // correct
  import { PolicyEngine } from "./policy/engine";    // wrong
  ```
- Prefer `const` over `let`. Never use `var`.
- Avoid `any`. Use `unknown` and narrow with type guards when the type is genuinely unknown.

### File organization

- Local client-side types (`Effect`, `Resource`, `RateLimit`, `Rule`) are defined at the top of the view file that first needs them, not in a shared `types.ts`. Keep each view self-contained.
- View components co-locate their CSS file in `ui/client/src/views/<ComponentName>.css` and import it directly.
- `startRulesWatcher` lives in `src/watcher.ts` and is imported inline into `src/index.ts`. Watcher logic is not inlined into the plugin file.

### Architecture patterns

- **Hot reload**: Wrap the live Cedar engine in `engineRef: { current: Engine }`. Hook handlers dereference `.current` at call time. The watcher swaps `.current` atomically.
- **ESM cache busting**: Append `?t=Date.now()` to the import URL when dynamically importing a module that may have changed on disk.
- **Chokidar lifecycle**: Start in `activate()`, stop in `async deactivate()` via `WatcherHandle`. Always set `persistent: false`.
- **Debounce**: 300 ms default on file-change events. `clearTimeout` before each new `setTimeout`.
- **Error isolation**: Wrap reload paths in `try/catch`. Log and return early on failure; leave the previous engine active.

---

## Testing

### Running tests

```bash
# Plugin tests
npm test

# Plugin tests in watch mode
npm run test:watch

# UI client tests
cd ui/client && npm test

# UI client tests with coverage report
cd ui/client && npm run test:coverage
```

### Coverage thresholds

The client enforces 80% coverage thresholds via `@vitest/coverage-v8`. A PR must not reduce coverage below the threshold.

### Writing tests

**Co-location**: Test files live next to their source file:
```
views/RulesTable.tsx
views/RulesTable.test.tsx   ← here
```

**API mocking**: Mock `../api` with `vi.mock`. Include a hand-crafted `ApiError` class matching the real constructor signature. Never import the real `ApiError` in mocks.

**SSE (EventSource) testing**: Stub `EventSource` globally with a class that stores the instance; dispatch events inside `act()` using helpers like `fireMessage`, `fireOpen`, `fireError`.

**`navigator.clipboard` mock**: Use `Object.defineProperty` with `{ configurable: true, writable: true }`. Re-assign the mock inside `beforeEach` (not at module level) to survive replacement by `userEvent.setup()`. Use `fireEvent.click` (not `userEvent.click`) for buttons that trigger clipboard calls.

**Special input characters**: Use `userEvent.paste` instead of `userEvent.type` when the input string contains regex special characters like `[` that userEvent v14 interprets as keyboard modifiers.

**Select assertions**: Assert select value after `userEvent.selectOptions` with `expect(selectEl).toHaveValue("value")`, not `getByDisplayValue`, since display value returns option text (capitalized), not the HTML value attribute.

---

## Pull Request Process

1. Create a feature branch from `main`:
   ```bash
   git checkout -b my-feature
   ```
2. Make your changes, keeping commits focused.
3. Run tests and ensure they pass:
   ```bash
   npm test
   cd ui/client && npm test
   ```
4. Run the TypeScript compiler with no emit to catch type errors:
   ```bash
   npx tsc --noEmit
   cd ui && npx tsc --noEmit
   ```
5. Push your branch and open a pull request against `main`.
6. Describe what the PR changes and why.

### Commit messages

Write commit messages in the imperative mood, focused on the "why" not the "what":

```
Add rate limiting to write_file tool rule
Prevent admin channel access for unrecognized agent prefixes
Fix sliding window cleanup leaving stale entries after engine reload
```

---

## Adding New Rules

To add a rule to the default rule set:

1. Open `src/policy/rules.ts`
2. Add your rule object to the exported array
3. Save the file — the hot-reload watcher will pick it up immediately if openclaw is running
4. Add a test case in `src/policy/engine.test.ts` covering the new rule's behavior
5. Update `docs/usage.md` if the rule introduces a new pattern

---

## Adding a New Resource Type

To support a new resource type beyond the five built-in types:

1. Add the new type literal to the `Resource` union in `src/policy/types.ts`
2. Update the `resource` validation in `ui/routes/rules.ts`
3. Update the `resource` field's accepted values in `docs/configuration.md` and `docs/api.md`
4. Add a hook handler in `src/index.ts` if the new resource type requires a new openclaw lifecycle hook
5. Update the Coverage Map component if you want the new type to appear in the UI matrix

---

## Reporting Issues

Open an issue on GitHub with:

- Steps to reproduce
- Expected behavior
- Actual behavior
- Node.js version (`node --version`)
- npm version (`npm --version`)
- Any relevant log output

For security vulnerabilities, please email the maintainers directly rather than opening a public issue.
