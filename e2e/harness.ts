/**
 * e2e/harness.ts — OpenClawHarness
 *
 * Manages the lifecycle of a spawned OpenClaw host process for E2E testing.
 * Communicates via newline-delimited JSON over stdio (see runner.mjs for the
 * protocol definition).
 *
 * Usage:
 *   const harness = new OpenClawHarness({ auditLogPath: '/tmp/audit.jsonl' });
 *   await harness.spawn();
 *   const result = await harness.invokeToolCall('read_file', { path: '/tmp/x' });
 *   const events = await harness.tailAuditLog();
 *   await harness.shutdown();
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HarnessOptions {
  /** Path to the JSONL audit log file written by the runner. */
  auditLogPath?: string;
  /**
   * Milliseconds to wait for the runner to signal "ready".
   * Defaults to 5 000 ms.
   */
  timeout?: number;
  /**
   * Absolute path to the runner script.
   * Defaults to runner.mjs in the same directory as this file.
   */
  runnerPath?: string;
}

/** Authorization decision returned by the runner for a tool call. */
export interface ToolCallResult {
  effect: 'permit' | 'forbid';
  reason: string;
}

/** Audit entry written by the runner for each tool call decision. */
export interface ExecutionEvent {
  decision: { effect: string; reason: string; stage?: string };
  timestamp: string;
}

// ─── OpenClawHarness ─────────────────────────────────────────────────────────

let _reqCounter = 0;

export class OpenClawHarness {
  private proc: ChildProcess | null = null;
  private pendingRequests = new Map<string, (result: ToolCallResult) => void>();

  readonly auditLogPath: string;
  private readonly timeoutMs: number;
  private readonly runnerPath: string;

  constructor(opts: HarnessOptions = {}) {
    this.auditLogPath = opts.auditLogPath ?? '/tmp/oa-smoke.jsonl';
    this.timeoutMs = opts.timeout ?? 5_000;
    this.runnerPath = opts.runnerPath ?? resolve(__dirname, 'runner.mjs');
  }

  /** PID of the spawned runner process, or undefined if not started. */
  get pid(): number | undefined {
    return this.proc?.pid;
  }

  /**
   * Spawns the runner process and waits for it to signal "ready".
   *
   * @throws {Error} If the runner does not become ready within the configured
   *                 timeout, or if the process fails to start.
   */
  async spawn(): Promise<void> {
    this.proc = spawn('node', [this.runnerPath], {
      env: { ...process.env, AUDIT_LOG: this.auditLogPath },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const proc = this.proc;

    // Attach readline to stdout for response parsing.
    const rl = createInterface({ input: proc.stdout!, crlfDelay: Infinity });

    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        return;
      }
      if (msg['type'] === 'decision' && typeof msg['id'] === 'string') {
        const resolver = this.pendingRequests.get(msg['id']);
        if (resolver) {
          this.pendingRequests.delete(msg['id']);
          resolver({
            effect: msg['effect'] as 'permit' | 'forbid',
            reason: msg['reason'] as string,
          });
        }
      }
    });

    // Wait for ready or timeout.
    await new Promise<void>((res, rej) => {
      const timer = setTimeout(
        () => rej(new Error(`Runner did not become ready within ${this.timeoutMs}ms`)),
        this.timeoutMs,
      );

      const onReady = (line: string) => {
        const trimmed = line.trim();
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
          return;
        }
        if (msg['type'] === 'ready') {
          clearTimeout(timer);
          rl.off('line', onReady);
          res();
        }
      };

      rl.on('line', onReady);

      proc.on('error', (err) => {
        clearTimeout(timer);
        rej(err);
      });

      proc.on('exit', (code) => {
        clearTimeout(timer);
        rej(new Error(`Runner exited prematurely with code ${String(code)}`));
      });
    });
  }

  /**
   * Sends a tool call request to the runner and waits for the decision.
   *
   * @param tool   Tool name (e.g. `'read_file'`).
   * @param params Tool call parameters forwarded to the runner.
   */
  async invokeToolCall(
    tool: string,
    params: Record<string, unknown> = {},
  ): Promise<ToolCallResult> {
    if (!this.proc) throw new Error('Harness not started — call spawn() first');

    const id = String(++_reqCounter);
    const line = JSON.stringify({ type: 'tool_call', id, tool, params }) + '\n';

    return new Promise<ToolCallResult>((res, rej) => {
      this.pendingRequests.set(id, res);

      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          rej(new Error(`Tool call ${id} (${tool}) timed out`));
        }
      }, this.timeoutMs);

      this.proc!.stdin!.write(line, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pendingRequests.delete(id);
          rej(err);
        }
      });

      // Clear timer when resolved.
      this.pendingRequests.set(id, (result) => {
        clearTimeout(timer);
        res(result);
      });
    });
  }

  /**
   * Reads the audit log file and returns all parsed execution events.
   *
   * Each line in the JSONL file is one {@link ExecutionEvent}.
   */
  async tailAuditLog(): Promise<ExecutionEvent[]> {
    const raw = await readFile(this.auditLogPath, 'utf-8');
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ExecutionEvent);
  }

  /**
   * Sends SIGTERM to the child process and waits for it to exit.
   *
   * Falls back to SIGKILL after 2 s if the process does not exit cleanly.
   * Safe to call multiple times.
   */
  async shutdown(): Promise<void> {
    if (!this.proc) return;

    const proc = this.proc;
    this.proc = null;
    this.pendingRequests.clear();

    await new Promise<void>((res) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          res();
        }
      };

      proc.once('exit', finish);

      // Process may have already exited.
      if (proc.exitCode !== null) {
        finish();
        return;
      }

      try {
        proc.kill('SIGTERM');
      } catch {
        finish();
        return;
      }

      // Force-kill after 2 s.
      const forceTimer = setTimeout(() => {
        if (!done) {
          try {
            proc.kill('SIGKILL');
          } catch { /* already gone */ }
        }
      }, 2_000);

      proc.once('exit', () => clearTimeout(forceTimer));
    });
  }
}
