/**
 * Unit tests for the git_push tool.
 *
 * Each test group spins up a fresh temporary git repository so tests are
 * fully isolated and do not affect the project's own index.
 *
 * Test IDs:
 *   TC-GPH-01: Successful push operations
 *   TC-GPH-02: Error handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { gitPush, GitPushError } from './git-push.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Initialise a git repo in `dir` with a throwaway identity. */
function initRepo(dir: string): void {
  spawnSync('git', ['init', '-b', 'main'], { cwd: dir });
  // Fall back for older git versions that don't support -b
  spawnSync('git', ['checkout', '-b', 'main'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
}

/** Write a file, stage it, and commit. */
function makeCommit(
  dir: string,
  filename: string,
  content: string,
  message: string,
): void {
  writeFileSync(join(dir, filename), content);
  spawnSync('git', ['add', '--', filename], { cwd: dir });
  spawnSync('git', ['commit', '-m', message], { cwd: dir });
}

/** Initialise an empty bare git repository in `dir`. */
function initBareRepo(dir: string): void {
  spawnSync('git', ['init', '--bare'], { cwd: dir });
}

// ─── TC-GPH-01: Successful push operations ────────────────────────────────────

describe('TC-GPH-01: successful push operations', () => {
  let repoDir: string;
  let bareDir: string;

  beforeEach(() => {
    bareDir = mkdtempSync(join(tmpdir(), 'git-push-bare-'));
    repoDir = mkdtempSync(join(tmpdir(), 'git-push-ok-'));

    initBareRepo(bareDir);
    initRepo(repoDir);

    // Create initial commit and set up remote with tracking
    makeCommit(repoDir, 'init.txt', 'init\n', 'initial commit');
    spawnSync('git', ['remote', 'add', 'origin', bareDir], { cwd: repoDir });
    spawnSync('git', ['push', '-u', 'origin', 'main'], { cwd: repoDir });
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(bareDir, { recursive: true, force: true });
  });

  it('pushes with explicit remote and branch and returns pushed: true', () => {
    makeCommit(repoDir, 'a.txt', 'a\n', 'add a');
    const result = gitPush({ remote: 'origin', branch: 'main' }, { cwd: repoDir });

    expect(result.pushed).toBe(true);
  });

  it('pushes with explicit remote only and returns pushed: true', () => {
    makeCommit(repoDir, 'b.txt', 'b\n', 'add b');
    const result = gitPush({ remote: 'origin' }, { cwd: repoDir });

    expect(result.pushed).toBe(true);
  });

  it('pushes with no params when tracking is configured and returns pushed: true', () => {
    makeCommit(repoDir, 'c.txt', 'c\n', 'add c');
    const result = gitPush({}, { cwd: repoDir });

    expect(result.pushed).toBe(true);
  });

  it('returns a non-empty message string on successful push', () => {
    makeCommit(repoDir, 'd.txt', 'd\n', 'add d');
    const result = gitPush({ remote: 'origin', branch: 'main' }, { cwd: repoDir });

    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('returns the remote name in the result', () => {
    const result = gitPush({ remote: 'origin', branch: 'main' }, { cwd: repoDir });

    expect(result.remote).toBe('origin');
  });

  it('returns the branch name in the result', () => {
    const result = gitPush({ remote: 'origin', branch: 'main' }, { cwd: repoDir });

    expect(result.branch).toBe('main');
  });

  it('defaults remote to "origin" when not specified', () => {
    const result = gitPush({}, { cwd: repoDir });

    expect(result.remote).toBe('origin');
  });

  it('detects the current branch when branch is not specified', () => {
    const result = gitPush({ remote: 'origin' }, { cwd: repoDir });

    expect(result.branch).toBe('main');
  });
});

// ─── TC-GPH-02: Error handling ────────────────────────────────────────────────

describe('TC-GPH-02: error handling', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'git-push-err-'));
    initRepo(repoDir);
    makeCommit(repoDir, 'init.txt', 'init\n', 'initial commit');
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('throws GitPushError when remote does not exist', () => {
    expect(() =>
      gitPush({ remote: 'nonexistent-remote', branch: 'main' }, { cwd: repoDir }),
    ).toThrow(GitPushError);
  });

  it('thrown error has code remote-not-found for a missing remote', () => {
    let err: GitPushError | undefined;
    try {
      gitPush({ remote: 'nonexistent-remote', branch: 'main' }, { cwd: repoDir });
    } catch (e) {
      err = e as GitPushError;
    }

    expect(err).toBeInstanceOf(GitPushError);
    expect(err!.code).toBe('remote-not-found');
  });

  it('error message includes the remote name for remote-not-found', () => {
    let err: GitPushError | undefined;
    try {
      gitPush({ remote: 'my-missing-remote', branch: 'main' }, { cwd: repoDir });
    } catch (e) {
      err = e as GitPushError;
    }

    expect(err).toBeInstanceOf(GitPushError);
    expect(err!.message).toMatch(/my-missing-remote/);
  });

  it('throws GitPushError with code rejected on a non-fast-forward push', () => {
    const bareDir = mkdtempSync(join(tmpdir(), 'git-push-bare-'));
    const otherWorkDir = mkdtempSync(join(tmpdir(), 'git-push-other-'));

    try {
      // Set up bare remote and push initial commit from repoDir
      initBareRepo(bareDir);
      spawnSync('git', ['remote', 'add', 'origin', bareDir], { cwd: repoDir });
      spawnSync('git', ['push', 'origin', 'main'], { cwd: repoDir });

      // Create otherWorkDir, sync to the same base commit, then push a diverging commit
      initRepo(otherWorkDir);
      spawnSync('git', ['remote', 'add', 'origin', bareDir], { cwd: otherWorkDir });
      spawnSync('git', ['fetch', 'origin'], { cwd: otherWorkDir });
      spawnSync('git', ['reset', '--hard', 'origin/main'], { cwd: otherWorkDir });
      makeCommit(otherWorkDir, 'other.txt', 'other\n', 'other commit');
      spawnSync('git', ['push', 'origin', 'main'], { cwd: otherWorkDir });

      // Make a diverging commit in repoDir — remote has advanced, so push is rejected
      makeCommit(repoDir, 'diverge.txt', 'diverge\n', 'diverging commit');

      let err: GitPushError | undefined;
      try {
        gitPush({ remote: 'origin', branch: 'main' }, { cwd: repoDir });
      } catch (e) {
        err = e as GitPushError;
      }

      expect(err).toBeInstanceOf(GitPushError);
      expect(err!.code).toBe('rejected');
    } finally {
      rmSync(bareDir, { recursive: true, force: true });
      rmSync(otherWorkDir, { recursive: true, force: true });
    }
  });

  it('throws GitPushError when not in a git repo', () => {
    const notARepo = mkdtempSync(join(tmpdir(), 'not-a-repo-'));

    let err: GitPushError | undefined;
    try {
      gitPush({ remote: 'origin', branch: 'main' }, { cwd: notARepo });
    } catch (e) {
      err = e as GitPushError;
    } finally {
      rmSync(notARepo, { recursive: true, force: true });
    }

    expect(err).toBeInstanceOf(GitPushError);
    // Both remote-not-found and git-error are valid when not in a repo
    const validCodes: Array<'auth-error' | 'rejected' | 'remote-not-found' | 'git-error'> = [
      'remote-not-found',
      'git-error',
    ];
    expect(validCodes).toContain(err!.code);
  });

  it('GitPushError exposes code as a typed discriminant', () => {
    let err: GitPushError | undefined;
    try {
      gitPush({ remote: 'nonexistent', branch: 'main' }, { cwd: repoDir });
    } catch (e) {
      err = e as GitPushError;
    }

    expect(err).toBeInstanceOf(GitPushError);
    const validCodes: Array<'auth-error' | 'rejected' | 'remote-not-found' | 'git-error'> = [
      'auth-error',
      'rejected',
      'remote-not-found',
      'git-error',
    ];
    expect(validCodes).toContain(err!.code);
  });
});
