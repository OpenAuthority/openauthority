import { describe, it } from 'vitest';
import { createDashboardServer } from './server.js';
import type { DashboardServerOptions, DashboardHandle } from './server.js';

describe('createDashboardServer', () => {
  it.todo('returns an object with start, stop, and boundPort');

  describe('boundPort', () => {
    it.todo('is null before start() is called');
    it.todo('equals the configured port after start() resolves');
    it.todo('equals the default port (3744) when no port option is provided');
    it.todo('is null after stop() is called');
  });

  describe('start', () => {
    it.todo('binds to the specified port and begins accepting connections');
    it.todo('resolves only after the server is listening');
    it.todo('rejects when the port is already in use');
    it.todo('mounts /api/rules, /api/audit, and /api/coverage routes');
    it.todo('serves static files from the client dist directory');
  });

  describe('stop', () => {
    it.todo('closes the server and releases the port');
    it.todo('resolves immediately when the server is not started');
    it.todo('is safe to call multiple times without throwing');
  });
});

void createDashboardServer;
void ({} as DashboardServerOptions);
void ({} as DashboardHandle);
