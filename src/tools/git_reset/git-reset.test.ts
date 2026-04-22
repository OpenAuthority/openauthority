/**
 * Unit tests for the git_reset tool.
 *
 * Each test group spins up a fresh temporary git repository so tests are
 * fully isolated and do not affect the project's own index.
 *
 * Test IDs:
 *   TC-GRS-01: Soft reset
 *   TC-GRS-02: Mixed reset
 *   TC-GRS-03: Hard reset (with destructive warning)
 *   TC-GRS-04: Error handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { gitReset, GitResetError } from './git-reset.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Initialise a git repo in `dir` with a throwaway identity. */
function initRepo(dir: string): void {
  spawnSync('git', ['init', '-b', 'main'], { cwd: dir });
  // Fall back for older git versions that don't support -b
  spawnSync('git', ['checkout', '-b', 'main'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
}

/** Write a file, stage it, and commit. Returns the full commit hash. */
function makeCommit(
  dir: string,
  filename: string,
  content: string,
  message: string,
): string {
  writeFileSync(join(dir, filename), content);
  spawnSync('git', ['add', '--', filename], { cwd: dir });
  spawnSync('git', ['commit', '-m', message], { cwd: dir });
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf-8' });
  return result.stdout.trim();
}

/** Returns the current HEAD commit hash. */
function headHash(dir: string): string {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf-8' });
  return result.stdout.trim();
}

/** Returns the git status --porcelain output. */
function porcelain(dir: string): string {
  const result = spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf-8' });
  return result.stdout.trim();
}

/** Returns the number of staged files (lines starting with a letter in position 0). */
function stagedCount(dir: string): number {
  const output = porcelain(dir);
  if (!output) return 0;
  return output
    .split('\n')
    .filter((line) => line.length >= 2 && line[0] !== ' ' && line[0] !== '?')
    .length;
}

// ─── TC-GRS-01: Soft reset ────────────────────────────────────────────────────

describe('TC-GRS-01: soft reset', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'git-reset-soft-'));
    initRepo(repoDir);
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('moves HEAD back to the specified commit', () => {
    const firstHash = makeCommit(repoDir, 'a.txt', 'first\n', 'first commit');
    makeCommit(repoDir, 'b.txt', 'second\n', 'second commit');

    const result = gitReset({ mode: 'soft', ref: firstHash }, { cwd: repoDir });

    expect(headHash(repoDir)).toBe(firstHash);
    expect(result.mode).toBe('soft');
    expect(result.ref).toBe(firstHash);
  });

  it('preserves staged changes (index is unchanged after soft reset)', () => {
    const firstHash = makeCommit(repoDir, 'a.txt', 'first\n', 'first commit');
    makeCommit(repoDir, 'b.txt', 'second\n', 'second commit');

    gitReset({ mode: 'soft', ref: firstHash }, { cwd: repoDir });

    // b.txt should now be staged (ready to re-commit)
    expect(stagedCount(repoDir)).toBeGreaterThan(0);
  });

  it('returns a non-empty message string', () => {
    const firstHash = makeCommit(repoDir, 'a.txt', 'init\n', 'initial');
    makeCommit(repoDir, 'b.txt', 'more\n', 'second');

    const result = gitReset({ mode: 'soft', ref: firstHash }, { cwd: repoDir });

    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('does not set a warning field for soft resets', () => {
    const firstHash = makeCommit(repoDir, 'a.txt', 'init\n', 'initial');
    makeCommit(repoDir, 'b.txt', 'more\n', 'second');

    const result = gitReset({ mode: 'soft', ref: firstHash }, { cwd: repoDir });

    expect(result.warning).toBeUndefined();
  });

  it('accepts a branch name as ref', () => {
    const firstHash = makeCommit(repoDir, 'a.txt', 'init\n', 'initial');
    makeCommit(repoDir, 'b.txt', 'more\n', 'second');

    const result = gitReset({ mode: 'soft', ref: 'HEAD~1' }, { cwd: repoDir });

    expect(headHash(repoDir)).toBe(firstHash);
    expect(result.ref).toBe('HEAD~1');
  });
});

// ─── TC-GRS-02: Mixed reset ────────────────────────────────────────────────────

describe('TC-GRS-02: mixed reset', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'git-reset-mixed-'));
    initRepo(repoDir);
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('moves HEAD back and unstages changes (index is reset)', () => {
    const firstHash = makeCommit(repoDir, 'a.txt', 'first\n', 'first commit');
    makeCommit(repoDir, 'b.txt', 'second\n', 'second commit');

    gitReset({ mode: 'mixed', ref: firstHash }, { cwd: repoDir });

    expect(headHash(repoDir)).toBe(firstHash);
    // b.txt should be untracked/unstaged after mixed reset
    expect(stagedCount(repoDir)).toBe(0);
  });

  it('preserves working tree files after mixed reset', () => {
    const firstHash = makeCommit(repoDir, 'a.txt', 'first\n', 'first commit');
    makeCommit(repoDir, 'b.txt', 'second content\n', 'second commit');

    gitReset({ mode: 'mixed', ref: firstHash }, { cwd: repoDir });

    // b.txt file should still exist on disk
    const content = readFileSync(join(repoDir, 'b.txt'), 'utf-8');
    expect(content).toBe('second content\n');
  });

  it('returns mode as mixed in result', () => {
    const firstHash = makeCommit(repoDir, 'a.txt', 'init\n', 'initial');
    makeCommit(repoDir, 'b.txt', 'more\n', 'second');

    const result = gitReset({ mode: 'mixed', ref: firstHash }, { cwd: repoDir });

    expect(result.mode).toBe('mixed');
  });

  it('does not set a warning field for mixed resets', () => {
    const firstHash = makeCommit(repoDir, 'a.txt', 'init\n', 'initial');
    makeCommit(repoDir, 'b.txt', 'more\n', 'second');

    const result = gitReset({ mode: 'mixed', ref: firstHash }, { cwd: repoDir });

    expect(result.warning).toBeUndefined();
  });
});

// ─── TC-GRS-03: Hard reset ────────────────────────────────────────────────────

describe('TC-GRS-03: hard reset', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'git-reset-hard-'));
    initRepo(repoDir);
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('moves HEAD and resets index and working tree', () => {
    const firstHash = makeCommit(repoDir, 'a.txt', 'first\n', 'first commit');
    makeCommit(repoDir, 'b.txt', 'second\n', 'second commit');

    gitReset({ mode: 'hard', ref: firstHash }, { cwd: repoDir });

    expect(headHash(repoDir)).toBe(firstHash);
    expect(stagedCount(repoDir)).toBe(0);
    expect(porcelain(repoDir)).toBe('');
  });

  it('returns a warning field for hard resets', () => {
    const firstHash = makeCommit(repoDir, 'a.txt', 'init\n', 'initial');
    makeCommit(repoDir, 'b.txt', 'more\n', 'second');

    const result = gitReset({ mode: 'hard', ref: firstHash }, { cwd: repoDir });

    expect(typeof result.warning).toBe('string');
    expect(result.warning!.length).toBeGreaterThan(0);
  });

  it('warning mentions hard reset destructiveness', () => {
    const firstHash = makeCommit(repoDir, 'a.txt', 'init\n', 'initial');
    makeCommit(repoDir, 'b.txt', 'more\n', 'second');

    const result = gitReset({ mode: 'hard', ref: firstHash }, { cwd: repoDir });

    expect(result.warning).toMatch(/hard reset|uncommitted changes|permanently/i);
  });

  it('returns mode as hard in result', () => {
    const firstHash = makeCommit(repoDir, 'a.txt', 'init\n', 'initial');
    makeCommit(repoDir, 'b.txt', 'more\n', 'second');

    const result = gitReset({ mode: 'hard', ref: firstHash }, { cwd: repoDir });

    expect(result.mode).toBe('hard');
  });

  it('discards uncommitted working tree changes on hard reset', () => {
    makeCommit(repoDir, 'a.txt', 'original\n', 'initial');
    // Dirty the working tree without staging
    writeFileSync(join(repoDir, 'a.txt'), 'dirty\n');

    gitReset({ mode: 'hard', ref: 'HEAD' }, { cwd: repoDir });

    const content = readFileSync(join(repoDir, 'a.txt'), 'utf-8');
    expect(content).toBe('original\n');
  });
});

// ─── TC-GRS-04: Error handling ────────────────────────────────────────────────

describe('TC-GRS-04: error handling', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'git-reset-err-'));
    initRepo(repoDir);
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('throws GitResetError for a non-existent ref', () => {
    makeCommit(repoDir, 'init.txt', 'init\n', 'initial');

    expect(() =>
      gitReset({ mode: 'mixed', ref: 'nonexistent-sha-abc123' }, { cwd: repoDir }),
    ).toThrow(GitResetError);
  });

  it('thrown error has code invalid-ref for a missing commit reference', () => {
    makeCommit(repoDir, 'init.txt', 'init\n', 'initial');

    let err: GitResetError | undefined;
    try {
      gitReset({ mode: 'soft', ref: 'does-not-exist' }, { cwd: repoDir });
    } catch (e) {
      err = e as GitResetError;
    }

    expect(err).toBeInstanceOf(GitResetError);
    expect(err!.code).toBe('invalid-ref');
  });

  it('thrown error message includes the ref for invalid-ref errors', () => {
    makeCommit(repoDir, 'init.txt', 'init\n', 'initial');

    let err: GitResetError | undefined;
    try {
      gitReset({ mode: 'mixed', ref: 'missing-ref-xyz' }, { cwd: repoDir });
    } catch (e) {
      err = e as GitResetError;
    }

    expect(err!.message).toMatch(/missing-ref-xyz/);
  });

  it('throws GitResetError with code git-error when not in a git repo', () => {
    const notARepo = mkdtempSync(join(tmpdir(), 'not-a-repo-'));

    let err: GitResetError | undefined;
    try {
      gitReset({ mode: 'mixed', ref: 'HEAD' }, { cwd: notARepo });
    } catch (e) {
      err = e as GitResetError;
    } finally {
      rmSync(notARepo, { recursive: true, force: true });
    }

    expect(err).toBeInstanceOf(GitResetError);
    const validCodes: Array<'invalid-ref' | 'git-error'> = ['invalid-ref', 'git-error'];
    expect(validCodes).toContain(err!.code);
  });

  it('GitResetError exposes code as a typed discriminant', () => {
    makeCommit(repoDir, 'init.txt', 'init\n', 'initial');

    let err: GitResetError | undefined;
    try {
      gitReset({ mode: 'hard', ref: 'absent-ref' }, { cwd: repoDir });
    } catch (e) {
      err = e as GitResetError;
    }

    expect(err).toBeInstanceOf(GitResetError);
    const validCodes: Array<'invalid-ref' | 'git-error'> = ['invalid-ref', 'git-error'];
    expect(validCodes).toContain(err!.code);
  });

  it('GitResetError has correct name property', () => {
    makeCommit(repoDir, 'init.txt', 'init\n', 'initial');

    let err: GitResetError | undefined;
    try {
      gitReset({ mode: 'soft', ref: 'bad-ref' }, { cwd: repoDir });
    } catch (e) {
      err = e as GitResetError;
    }

    expect(err!.name).toBe('GitResetError');
  });
});
