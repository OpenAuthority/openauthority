/**
 * Unit tests for the unsafe_admin_exec tool.
 *
 * Each test group restores the CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC
 * environment variable to its original value after the group runs.
 *
 * Test IDs:
 *   TC-UAX-01: Execution when enabled (CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC=1)
 *   TC-UAX-02: Inert behavior when disabled (env var absent or not '1')
 *   TC-UAX-03: Audit logging — all invocation events are recorded
 *   TC-UAX-04: Result shape
 *   TC-UAX-05: Security — command is sanitized in audit log entries
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unsafeAdminExec, UnsafeAdminExecError } from './unsafe-admin-exec.js';
import type { UnsafeAdminExecLogger } from './unsafe-admin-exec.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a stub logger that records all entries. */
function makeLogger(): { logger: UnsafeAdminExecLogger; entries: Array<Record<string, unknown>> } {
  const entries: Array<Record<string, unknown>> = [];
  const logger: UnsafeAdminExecLogger = {
    log: async (entry) => {
      entries.push(entry);
    },
  };
  return { logger, entries };
}

// ─── TC-UAX-01: Execution when enabled ───────────────────────────────────────

describe('TC-UAX-01: execution when enabled', () => {
  const ORIGINAL = process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'];

  beforeEach(() => {
    process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'] = '1';
  });

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'];
    } else {
      process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'] = ORIGINAL;
    }
  });

  it('returns stdout from the executed command', async () => {
    const result = await unsafeAdminExec({ command: 'echo hello' });
    expect(result.stdout.trim()).toBe('hello');
  });

  it('returns exit_code 0 for a successful command', async () => {
    const result = await unsafeAdminExec({ command: 'true' });
    expect(result.exit_code).toBe(0);
  });

  it('returns non-zero exit_code for a failing command', async () => {
    const result = await unsafeAdminExec({ command: 'false' });
    expect(result.exit_code).not.toBe(0);
  });

  it('returns stderr from the executed command', async () => {
    const result = await unsafeAdminExec({ command: 'echo err >&2' });
    expect(result.stderr.trim()).toBe('err');
  });

  it('executes with the provided working_dir', async () => {
    const result = await unsafeAdminExec({ command: 'pwd', working_dir: '/tmp' });
    // /tmp may resolve to /private/tmp on macOS; check that the output ends with /tmp
    expect(result.stdout.trim()).toMatch(/\/tmp$/);
  });

  it('stdout is empty string when command produces no output', async () => {
    const result = await unsafeAdminExec({ command: 'true' });
    expect(result.stdout).toBe('');
  });
});

// ─── TC-UAX-02: Inert behavior when disabled ─────────────────────────────────

describe('TC-UAX-02: inert behavior when disabled', () => {
  const ORIGINAL = process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'];

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'];
    } else {
      process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'] = ORIGINAL;
    }
  });

  it('throws UnsafeAdminExecError when env var is absent', async () => {
    delete process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'];

    let err: UnsafeAdminExecError | undefined;
    try {
      await unsafeAdminExec({ command: 'echo hello' });
    } catch (e) {
      err = e as UnsafeAdminExecError;
    }

    expect(err).toBeInstanceOf(UnsafeAdminExecError);
    expect(err!.code).toBe('disabled');
  });

  it('throws UnsafeAdminExecError when env var is "0"', async () => {
    process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'] = '0';

    let err: UnsafeAdminExecError | undefined;
    try {
      await unsafeAdminExec({ command: 'echo hello' });
    } catch (e) {
      err = e as UnsafeAdminExecError;
    }

    expect(err).toBeInstanceOf(UnsafeAdminExecError);
    expect(err!.code).toBe('disabled');
  });

  it('throws UnsafeAdminExecError when env var is "true" (not "1")', async () => {
    process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'] = 'true';

    let err: UnsafeAdminExecError | undefined;
    try {
      await unsafeAdminExec({ command: 'echo hello' });
    } catch (e) {
      err = e as UnsafeAdminExecError;
    }

    expect(err).toBeInstanceOf(UnsafeAdminExecError);
    expect(err!.code).toBe('disabled');
  });

  it('thrown error has name "UnsafeAdminExecError"', async () => {
    delete process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'];

    let err: UnsafeAdminExecError | undefined;
    try {
      await unsafeAdminExec({ command: 'echo hello' });
    } catch (e) {
      err = e as UnsafeAdminExecError;
    }

    expect(err!.name).toBe('UnsafeAdminExecError');
  });

  it('error message references the env var', async () => {
    delete process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'];

    let err: UnsafeAdminExecError | undefined;
    try {
      await unsafeAdminExec({ command: 'echo hello' });
    } catch (e) {
      err = e as UnsafeAdminExecError;
    }

    expect(err!.message).toContain('CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC');
  });
});

// ─── TC-UAX-03: Audit logging ────────────────────────────────────────────────

describe('TC-UAX-03: audit logging', () => {
  const ORIGINAL = process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'];

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'];
    } else {
      process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'] = ORIGINAL;
    }
  });

  it('logs a disabled event when env var is absent', async () => {
    delete process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'];
    const { logger, entries } = makeLogger();

    try {
      await unsafeAdminExec({ command: 'echo hello' }, { logger });
    } catch {
      // expected
    }

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: 'unsafe-admin-exec',
      event: 'disabled',
      toolName: 'unsafe_admin_exec',
    });
  });

  it('logs exec-attempt and exec-complete events on successful execution', async () => {
    process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'] = '1';
    const { logger, entries } = makeLogger();

    await unsafeAdminExec({ command: 'echo hello' }, { logger });

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ type: 'unsafe-admin-exec', event: 'exec-attempt' });
    expect(entries[1]).toMatchObject({ type: 'unsafe-admin-exec', event: 'exec-complete' });
  });

  it('exec-complete entry includes exit code', async () => {
    process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'] = '1';
    const { logger, entries } = makeLogger();

    await unsafeAdminExec({ command: 'true' }, { logger });

    const complete = entries.find((e) => e['event'] === 'exec-complete');
    expect(complete).toBeDefined();
    expect(complete!['exitCode']).toBe(0);
  });

  it('all entries include toolName unsafe_admin_exec', async () => {
    process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'] = '1';
    const { logger, entries } = makeLogger();

    await unsafeAdminExec({ command: 'echo hello' }, { logger });

    for (const entry of entries) {
      expect(entry['toolName']).toBe('unsafe_admin_exec');
    }
  });

  it('all entries include a ts timestamp string', async () => {
    process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'] = '1';
    const { logger, entries } = makeLogger();

    await unsafeAdminExec({ command: 'echo hello' }, { logger });

    for (const entry of entries) {
      expect(typeof entry['ts']).toBe('string');
      expect((entry['ts'] as string).length).toBeGreaterThan(0);
    }
  });

  it('propagates agentId and channel into log entries', async () => {
    process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'] = '1';
    const { logger, entries } = makeLogger();

    await unsafeAdminExec(
      { command: 'echo hello' },
      { logger, agentId: 'agent-42', channel: 'ops-channel' },
    );

    for (const entry of entries) {
      expect(entry['agentId']).toBe('agent-42');
      expect(entry['channel']).toBe('ops-channel');
    }
  });

  it('exec-attempt entry includes workingDir when provided', async () => {
    process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'] = '1';
    const { logger, entries } = makeLogger();

    await unsafeAdminExec({ command: 'pwd', working_dir: '/tmp' }, { logger });

    const attempt = entries.find((e) => e['event'] === 'exec-attempt');
    expect(attempt!['workingDir']).toBe('/tmp');
  });

  it('exec-complete entry includes stdoutLength and stderrLength', async () => {
    process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'] = '1';
    const { logger, entries } = makeLogger();

    await unsafeAdminExec({ command: 'echo hello' }, { logger });

    const complete = entries.find((e) => e['event'] === 'exec-complete');
    expect(typeof complete!['stdoutLength']).toBe('number');
    expect(typeof complete!['stderrLength']).toBe('number');
  });
});

// ─── TC-UAX-04: Result shape ─────────────────────────────────────────────────

describe('TC-UAX-04: result shape', () => {
  const ORIGINAL = process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'];

  beforeEach(() => {
    process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'] = '1';
  });

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'];
    } else {
      process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'] = ORIGINAL;
    }
  });

  it('result has stdout, stderr, and exit_code fields', async () => {
    const result = await unsafeAdminExec({ command: 'echo hello' });
    expect(result).toHaveProperty('stdout');
    expect(result).toHaveProperty('stderr');
    expect(result).toHaveProperty('exit_code');
  });

  it('stdout and stderr are strings', async () => {
    const result = await unsafeAdminExec({ command: 'echo hello' });
    expect(typeof result.stdout).toBe('string');
    expect(typeof result.stderr).toBe('string');
  });

  it('exit_code is a number', async () => {
    const result = await unsafeAdminExec({ command: 'echo hello' });
    expect(typeof result.exit_code).toBe('number');
  });
});

// ─── TC-UAX-05: Security — command sanitization ───────────────────────────────

describe('TC-UAX-05: security — command sanitization in audit log', () => {
  const ORIGINAL = process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'];

  beforeEach(() => {
    process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'] = '1';
  });

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'];
    } else {
      process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'] = ORIGINAL;
    }
  });

  it('commandPrefix in log entries does not exceed 40 characters', async () => {
    const { logger, entries } = makeLogger();
    const longCommand = 'echo ' + 'a'.repeat(100);

    await unsafeAdminExec({ command: longCommand }, { logger });

    for (const entry of entries) {
      if (typeof entry['commandPrefix'] === 'string') {
        expect(entry['commandPrefix'].length).toBeLessThanOrEqual(40);
      }
    }
  });

  it('commandPrefix redacts Bearer tokens', async () => {
    const { logger, entries } = makeLogger();

    await unsafeAdminExec(
      { command: 'curl -H "Authorization: Bearer secret-token-abc123" https://example.com' },
      { logger },
    );

    for (const entry of entries) {
      if (typeof entry['commandPrefix'] === 'string') {
        expect(entry['commandPrefix']).not.toContain('secret-token-abc123');
      }
    }
  });

  it('commandPrefix redacts token= assignments', async () => {
    const { logger, entries } = makeLogger();

    await unsafeAdminExec(
      { command: 'curl "https://api.example.com?token=supersecret"' },
      { logger },
    );

    for (const entry of entries) {
      if (typeof entry['commandPrefix'] === 'string') {
        expect(entry['commandPrefix']).not.toContain('supersecret');
      }
    }
  });
});
