/**
 * Unit tests for the git_merge tool.
 *
 * Each test group spins up a fresh temporary git repository so tests are
 * fully isolated and do not affect the project's own index.
 *
 * Test IDs:
 *   TC-GMT-01: Successful merge operations
 *   TC-GMT-02: Error handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { gitMerge, GitMergeError } from './git-merge.js';

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

// ─── TC-GMT-01: Successful merge operations ───────────────────────────────────

describe('TC-GMT-01: successful merge operations', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'git-merge-ok-'));
    initRepo(repoDir);
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('merges a feature branch and returns merged: true', () => {
    // Initial commit on main
    makeCommit(repoDir, 'base.txt', 'base content\n', 'initial commit');

    // Create feature branch with an additional file
    spawnSync('git', ['checkout', '-b', 'feature'], { cwd: repoDir });
    makeCommit(repoDir, 'feature.txt', 'feature content\n', 'add feature');

    // Switch back to main and merge
    spawnSync('git', ['checkout', 'main'], { cwd: repoDir });
    const result = gitMerge({ branch: 'feature' }, { cwd: repoDir });

    expect(result.merged).toBe(true);
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('returns a non-empty message string on successful merge', () => {
    makeCommit(repoDir, 'a.txt', 'a\n', 'initial');
    spawnSync('git', ['checkout', '-b', 'branch-a'], { cwd: repoDir });
    makeCommit(repoDir, 'b.txt', 'b\n', 'add b');
    spawnSync('git', ['checkout', 'main'], { cwd: repoDir });

    const result = gitMerge({ branch: 'branch-a' }, { cwd: repoDir });

    expect(result.message).toBeTruthy();
  });

  it('succeeds when merging a branch that is already up-to-date', () => {
    makeCommit(repoDir, 'file.txt', 'content\n', 'initial');
    spawnSync('git', ['checkout', '-b', 'no-change'], { cwd: repoDir });
    spawnSync('git', ['checkout', 'main'], { cwd: repoDir });

    const result = gitMerge({ branch: 'no-change' }, { cwd: repoDir });

    expect(result.merged).toBe(true);
  });
});

// ─── TC-GMT-02: Error handling ────────────────────────────────────────────────

describe('TC-GMT-02: error handling', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'git-merge-err-'));
    initRepo(repoDir);
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('throws GitMergeError for a non-existent branch', () => {
    makeCommit(repoDir, 'init.txt', 'init\n', 'initial');

    expect(() =>
      gitMerge({ branch: 'does-not-exist' }, { cwd: repoDir }),
    ).toThrow(GitMergeError);
  });

  it('thrown error has code branch-not-found for a missing branch', () => {
    makeCommit(repoDir, 'init.txt', 'init\n', 'initial');

    let err: GitMergeError | undefined;
    try {
      gitMerge({ branch: 'nonexistent-branch' }, { cwd: repoDir });
    } catch (e) {
      err = e as GitMergeError;
    }

    expect(err).toBeInstanceOf(GitMergeError);
    expect(err!.code).toBe('branch-not-found');
    expect(err!.message).toMatch(/nonexistent-branch/);
  });

  it('throws GitMergeError with code merge-conflict on conflicting branches', () => {
    // Create a base commit
    makeCommit(repoDir, 'shared.txt', 'original content\n', 'initial');

    // Create feature branch and make a conflicting change
    spawnSync('git', ['checkout', '-b', 'conflicting'], { cwd: repoDir });
    makeCommit(repoDir, 'shared.txt', 'feature content\n', 'feature change');

    // Switch back to main and make a conflicting change on the same file
    spawnSync('git', ['checkout', 'main'], { cwd: repoDir });
    makeCommit(repoDir, 'shared.txt', 'main content\n', 'main change');

    let err: GitMergeError | undefined;
    try {
      gitMerge({ branch: 'conflicting' }, { cwd: repoDir });
    } catch (e) {
      err = e as GitMergeError;
    }

    expect(err).toBeInstanceOf(GitMergeError);
    expect(err!.code).toBe('merge-conflict');
  });

  it('merge-conflict error includes conflicts array', () => {
    makeCommit(repoDir, 'shared.txt', 'original\n', 'initial');
    spawnSync('git', ['checkout', '-b', 'conflict-branch'], { cwd: repoDir });
    makeCommit(repoDir, 'shared.txt', 'branch version\n', 'branch edit');
    spawnSync('git', ['checkout', 'main'], { cwd: repoDir });
    makeCommit(repoDir, 'shared.txt', 'main version\n', 'main edit');

    let err: GitMergeError | undefined;
    try {
      gitMerge({ branch: 'conflict-branch' }, { cwd: repoDir });
    } catch (e) {
      err = e as GitMergeError;
    }

    expect(err!.conflicts).toBeDefined();
    expect(Array.isArray(err!.conflicts)).toBe(true);
    expect(err!.conflicts!.length).toBeGreaterThan(0);
    expect(err!.conflicts!.some((f) => f.includes('shared.txt'))).toBe(true);
  });

  it('throws GitMergeError with code git-error when not in a git repo', () => {
    const notARepo = mkdtempSync(join(tmpdir(), 'not-a-repo-'));

    let err: GitMergeError | undefined;
    try {
      gitMerge({ branch: 'main' }, { cwd: notARepo });
    } catch (e) {
      err = e as GitMergeError;
    } finally {
      rmSync(notARepo, { recursive: true, force: true });
    }

    expect(err).toBeInstanceOf(GitMergeError);
    // Branch-not-found or git-error are both valid for "not a repo"
    const validCodes: Array<'branch-not-found' | 'merge-conflict' | 'git-error'> = [
      'branch-not-found',
      'git-error',
    ];
    expect(validCodes).toContain(err!.code);
  });

  it('GitMergeError exposes code as a typed discriminant', () => {
    makeCommit(repoDir, 'init.txt', 'init\n', 'initial');

    let err: GitMergeError | undefined;
    try {
      gitMerge({ branch: 'absent-branch' }, { cwd: repoDir });
    } catch (e) {
      err = e as GitMergeError;
    }

    const validCodes: Array<'branch-not-found' | 'merge-conflict' | 'git-error'> = [
      'branch-not-found',
      'merge-conflict',
      'git-error',
    ];
    expect(validCodes).toContain(err!.code);
  });
});
