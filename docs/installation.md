# Installation Guide

This guide walks through installing and registering the Open Authority policy engine plugin for openclaw, and setting up the UI dashboard for rule management.

## Prerequisites

- [openclaw](https://github.com/Firma-AI/openauthority) installed and configured
- Node.js 18 or later
- npm 9 or later

## Plugin Installation

### 1. Clone the repository

```bash
git clone https://github.com/Firma-AI/openauthority ~/.openclaw/plugins/policy-engine
cd ~/.openclaw/plugins/policy-engine
```

### 2. Install dependencies

```bash
npm install
```

### 3. Build the plugin

```bash
npm run build
```

The compiled plugin is output to `dist/`.

### 4. Register with openclaw

Add the plugin to your openclaw configuration file at `~/.openclaw/config.json`:

```json
{
  "plugins": ["policy-engine"]
}
```

openclaw will load `dist/index.js` as the plugin entry point on next start.

### 5. Verify installation

Restart openclaw and check the logs for a line like:

```
[policy-engine] Plugin activated. Watching src/policy/rules.ts for changes.
```

---

## UI Dashboard Installation

The dashboard is an optional Express + React application for managing rules and viewing the audit log.

### 1. Install UI dependencies

```bash
# Server dependencies
cd ~/.openclaw/plugins/policy-engine/ui
npm install

# Client dependencies
cd ~/.openclaw/plugins/policy-engine/ui/client
npm install
```

### 2. Build the client

```bash
cd ~/.openclaw/plugins/policy-engine/ui/client
npm run build
```

This compiles the React app to `ui/client/dist/`, which the server serves as static files.

### 3. Start the dashboard server

```bash
cd ~/.openclaw/plugins/policy-engine/ui
npm start
```

The server listens on **port 7331** by default. Open `http://localhost:7331` in your browser.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `7331` | HTTP port for the dashboard server |
| `RULES_FILE` | `../../data/rules.json` | Path to the persisted rules JSON file |
| `AUDIT_LOG_FILE` | `../../data/audit.jsonl` | Path to the JSONL audit log file |

Example with custom paths:

```bash
PORT=8080 RULES_FILE=/var/openauthority/rules.json AUDIT_LOG_FILE=/var/log/openauthority/audit.jsonl npm start
```

### Data directory

By default, persisted data is written to a `data/` directory at the repository root. The server creates this directory automatically if it does not exist. You can override both paths using environment variables above.

---

## Development Setup

Use this setup when working on the plugin or dashboard locally.

### Plugin (watch mode)

```bash
cd ~/.openclaw/plugins/policy-engine
npm run dev
```

TypeScript source is compiled and re-compiled automatically on change.

### UI server (watch mode)

```bash
cd ~/.openclaw/plugins/policy-engine/ui
npm run dev
```

Uses `tsx watch` for instant TypeScript reload on save.

### UI client (Vite dev server)

```bash
cd ~/.openclaw/plugins/policy-engine/ui/client
npm run dev
```

Starts a Vite dev server on **port 5173** with HMR. The server allows CORS from `http://localhost:5173` and `http://127.0.0.1:5173` for local development.

### Running tests

```bash
# Plugin tests
cd ~/.openclaw/plugins/policy-engine
npm test

# Client tests
cd ~/.openclaw/plugins/policy-engine/ui/client
npm test

# Client tests with coverage
cd ~/.openclaw/plugins/policy-engine/ui/client
npm run test:coverage
```

---

## Upgrading

```bash
cd ~/.openclaw/plugins/policy-engine
git pull
npm install
npm run build
```

Restart openclaw after upgrading. The hot-reload watcher does not require a full restart for rule changes, but a code change to the plugin itself does.

---

## Uninstallation

Remove the plugin directory and the entry from `~/.openclaw/config.json`:

```bash
rm -rf ~/.openclaw/plugins/policy-engine
```

Edit `~/.openclaw/config.json` and remove `"policy-engine"` from the `plugins` array.
