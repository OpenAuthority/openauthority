/**
 * unsafe_admin_exec tool implementation.
 *
 * Executes arbitrary shell commands when explicitly permitted.
 * This tool is inert by default — execution requires:
 *   1. The CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC environment variable set to '1'.
 *   2. An explicit permit rule in the policy engine.
 *
 * All invocations are audit-logged regardless of outcome. Commands are
 * sanitized before logging to prevent credential leakage in audit trails.
 *
 * Action class: shell.exec
 */

import { spawnSync } from 'node:child_process';
import { sanitizeCommandPrefix } from '../../enforcement/normalize.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Input parameters for the unsafe_admin_exec tool. */
export interface UnsafeAdminExecParams {
  /** Shell command to execute. */
  command: string;
  /** Working directory for command execution. Defaults to process.cwd(). */
  working_dir?: string;
}

/** Successful result from the unsafe_admin_exec tool. */
export interface UnsafeAdminExecResult {
  /** Standard output captured from the command. */
  stdout: string;
  /** Standard error captured from the command. */
  stderr: string;
  /** Process exit code. -1 when the process was signalled or did not exit cleanly. */
  exit_code: number;
}

/** Minimal audit logger interface accepted by unsafeAdminExec. */
export interface UnsafeAdminExecLogger {
  log(entry: Record<string, unknown>): Promise<void>;
}

/** Contextual options for the unsafeAdminExec function. */
export interface UnsafeAdminExecOptions {
  /** Optional audit logger for recording all execution events. */
  logger?: UnsafeAdminExecLogger;
  /** Agent ID included in every audit log entry. */
  agentId?: string;
  /** Channel included in every audit log entry. */
  channel?: string;
}

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * Typed error thrown by `unsafeAdminExec`.
 *
 * The `code` discriminant lets callers branch on error type without
 * string-matching the message.
 *
 * - `disabled`   — CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC is not set to '1'.
 * - `exec-error` — Command spawning failed unexpectedly (e.g. invalid cwd).
 */
export class UnsafeAdminExecError extends Error {
  constructor(
    message: string,
    public readonly code: 'disabled' | 'exec-error',
  ) {
    super(message);
    this.name = 'UnsafeAdminExecError';
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Executes a shell command when the unsafe admin exec capability is enabled.
 *
 * Reads CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC at call time. When not set to
 * '1', logs the denied attempt and throws UnsafeAdminExecError('disabled').
 *
 * When enabled, logs the attempt before execution and logs the outcome after.
 * Both success and failure outcomes are recorded in the audit trail.
 *
 * @param params   Shell command and optional working directory.
 * @param options  Optional logger and agent context for audit entries.
 * @returns        stdout, stderr, and exit_code from the command.
 *
 * @throws {UnsafeAdminExecError}  code 'disabled' when the env var is absent.
 * @throws {UnsafeAdminExecError}  code 'exec-error' for spawn-level failures.
 */
export async function unsafeAdminExec(
  params: UnsafeAdminExecParams,
  options: UnsafeAdminExecOptions = {},
): Promise<UnsafeAdminExecResult> {
  const { logger, agentId = 'unknown', channel = 'unknown' } = options;
  const ts = new Date().toISOString();
  const commandPrefix = sanitizeCommandPrefix(params.command);

  const enabled = process.env['CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC'] === '1';

  if (!enabled) {
    await logger?.log({
      ts,
      type: 'unsafe-admin-exec',
      event: 'disabled',
      toolName: 'unsafe_admin_exec',
      commandPrefix,
      agentId,
      channel,
      reason: 'CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC is not set to 1',
    });

    throw new UnsafeAdminExecError(
      'unsafe_admin_exec is disabled. Set CLAWTHORITY_ENABLE_UNSAFE_ADMIN_EXEC=1 to enable.',
      'disabled',
    );
  }

  // Log the execution attempt before running so the attempt is always recorded,
  // even if the process is killed mid-execution.
  await logger?.log({
    ts,
    type: 'unsafe-admin-exec',
    event: 'exec-attempt',
    toolName: 'unsafe_admin_exec',
    commandPrefix,
    workingDir: params.working_dir ?? null,
    agentId,
    channel,
  });

  let spawnResult: ReturnType<typeof spawnSync>;
  try {
    spawnResult = spawnSync(params.command, {
      shell: true,
      encoding: 'utf-8',
      cwd: params.working_dir,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await logger?.log({
      ts: new Date().toISOString(),
      type: 'unsafe-admin-exec',
      event: 'exec-error',
      toolName: 'unsafe_admin_exec',
      commandPrefix,
      agentId,
      channel,
      error: message,
    });
    throw new UnsafeAdminExecError(`Command spawn failed: ${message}`, 'exec-error');
  }

  const stdout = typeof spawnResult.stdout === 'string' ? spawnResult.stdout : '';
  const stderr = typeof spawnResult.stderr === 'string' ? spawnResult.stderr : '';
  const exit_code = spawnResult.status ?? -1;

  await logger?.log({
    ts: new Date().toISOString(),
    type: 'unsafe-admin-exec',
    event: 'exec-complete',
    toolName: 'unsafe_admin_exec',
    commandPrefix,
    agentId,
    channel,
    exitCode: exit_code,
    stdoutLength: stdout.length,
    stderrLength: stderr.length,
  });

  return { stdout, stderr, exit_code };
}
