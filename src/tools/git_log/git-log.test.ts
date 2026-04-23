/**
 * Unit tests for the git_log tool.
 *
 * Each test group spins up a fresh temporary git repository so tests are
 * fully isolated and do not affect the project's own history.
 *
 * Test IDs:
 *   TC-GLT-01: Successful log operations
 *   TC-GLT-02: Error handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { gitLog, GitLogError } from './git-log.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Initialise a bare git repo in `dir` with a throwaway identity. */
function initRepo(dir: string): void {
  spawnSync('git', ['init'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
}

/** Create a file, stage it, and commit with the given message. */
function makeCommit(dir: string, filename: string, content: string, message: string): void {
  writeFileSync(join(dir, filename), content);
  spawnSync('git', ['add', '--', filename], { cwd: dir });
  spawnSync('git', ['commit', '-m', message], { cwd: dir });
}

// ─── TC-GLT-01: Successful log operations ─────────────────────────────────────

describe('TC-GLT-01: successful log operations', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'git-log-ok-'));
    initRepo(repoDir);
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('returns an empty commits array for a repo with no commits', () => {
    const result = gitLog({}, { cwd: repoDir });
    expect(result.commits).toEqual([]);
  });

  it('returns one commit after a single commit', () => {
    makeCommit(repoDir, 'a.txt', 'a', 'first commit');

    const result = gitLog({}, { cwd: repoDir });

    expect(result.commits).toHaveLength(1);
    expect(result.commits[0].message).toBe('first commit');
  });

  it('commit object has hash, message, author, date fields', () => {
    makeCommit(repoDir, 'a.txt', 'a', 'first commit');

    const { commits } = gitLog({}, { cwd: repoDir });
    const commit = commits[0];

    expect(commit.hash).toMatch(/^[0-9a-f]{40}$/);
    expect(commit.message).toBe('first commit');
    expect(commit.author).toBe('Test');
    expect(commit.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns multiple commits newest-first', () => {
    makeCommit(repoDir, 'a.txt', 'a', 'first commit');
    makeCommit(repoDir, 'b.txt', 'b', 'second commit');
    makeCommit(repoDir, 'c.txt', 'c', 'third commit');

    const { commits } = gitLog({}, { cwd: repoDir });

    expect(commits).toHaveLength(3);
    expect(commits[0].message).toBe('third commit');
    expect(commits[1].message).toBe('second commit');
    expect(commits[2].message).toBe('first commit');
  });

  it('limits results when limit is provided', () => {
    makeCommit(repoDir, 'a.txt', 'a', 'first commit');
    makeCommit(repoDir, 'b.txt', 'b', 'second commit');
    makeCommit(repoDir, 'c.txt', 'c', 'third commit');

    const { commits } = gitLog({ limit: 2 }, { cwd: repoDir });

    expect(commits).toHaveLength(2);
    expect(commits[0].message).toBe('third commit');
    expect(commits[1].message).toBe('second commit');
  });

  it('limit of 1 returns only the most recent commit', () => {
    makeCommit(repoDir, 'a.txt', 'a', 'first commit');
    makeCommit(repoDir, 'b.txt', 'b', 'second commit');

    const { commits } = gitLog({ limit: 1 }, { cwd: repoDir });

    expect(commits).toHaveLength(1);
    expect(commits[0].message).toBe('second commit');
  });

  it('filters commits by file path', () => {
    makeCommit(repoDir, 'alpha.txt', 'a', 'add alpha');
    makeCommit(repoDir, 'beta.txt', 'b', 'add beta');
    makeCommit(repoDir, 'alpha.txt', 'a2', 'update alpha');

    const { commits } = gitLog({ path: 'alpha.txt' }, { cwd: repoDir });

    expect(commits).toHaveLength(2);
    expect(commits[0].message).toBe('update alpha');
    expect(commits[1].message).toBe('add alpha');
  });

  it('path filter returns empty array when path has no commits', () => {
    makeCommit(repoDir, 'a.txt', 'a', 'first commit');

    const { commits } = gitLog({ path: 'nonexistent.txt' }, { cwd: repoDir });

    expect(commits).toEqual([]);
  });

  it('combines limit and path filter correctly', () => {
    makeCommit(repoDir, 'alpha.txt', 'a', 'add alpha');
    makeCommit(repoDir, 'beta.txt', 'b', 'add beta');
    makeCommit(repoDir, 'alpha.txt', 'a2', 'update alpha 1');
    makeCommit(repoDir, 'alpha.txt', 'a3', 'update alpha 2');

    const { commits } = gitLog({ limit: 2, path: 'alpha.txt' }, { cwd: repoDir });

    expect(commits).toHaveLength(2);
    expect(commits[0].message).toBe('update alpha 2');
    expect(commits[1].message).toBe('update alpha 1');
  });

  it('each commit hash is a unique 40-character hex string', () => {
    makeCommit(repoDir, 'a.txt', 'a', 'first commit');
    makeCommit(repoDir, 'b.txt', 'b', 'second commit');

    const { commits } = gitLog({}, { cwd: repoDir });
    const hashes = commits.map((c) => c.hash);

    expect(hashes[0]).toMatch(/^[0-9a-f]{40}$/);
    expect(hashes[1]).toMatch(/^[0-9a-f]{40}$/);
    expect(hashes[0]).not.toBe(hashes[1]);
  });

  it('returns empty commits array when params is omitted', () => {
    const result = gitLog(undefined, { cwd: repoDir });
    expect(result.commits).toEqual([]);
  });
});

// ─── TC-GLT-02: Error handling ───────────────────────────────────────────────

describe('TC-GLT-02: error handling', () => {
  it('throws GitLogError with code git-error outside a git repo', () => {
    const notARepo = mkdtempSync(join(tmpdir(), 'not-a-repo-'));
    let err: GitLogError | undefined;

    try {
      gitLog({}, { cwd: notARepo });
    } catch (e) {
      err = e as GitLogError;
    } finally {
      rmSync(notARepo, { recursive: true, force: true });
    }

    expect(err).toBeInstanceOf(GitLogError);
    expect(err!.code).toBe('git-error');
  });

  it('thrown GitLogError has name "GitLogError"', () => {
    const notARepo = mkdtempSync(join(tmpdir(), 'not-a-repo-err-'));
    let err: GitLogError | undefined;

    try {
      gitLog({}, { cwd: notARepo });
    } catch (e) {
      err = e as GitLogError;
    } finally {
      rmSync(notARepo, { recursive: true, force: true });
    }

    expect(err!.name).toBe('GitLogError');
  });

  it('error message includes stderr from git when available', () => {
    const notARepo = mkdtempSync(join(tmpdir(), 'not-a-repo-msg-'));
    let err: GitLogError | undefined;

    try {
      gitLog({}, { cwd: notARepo });
    } catch (e) {
      err = e as GitLogError;
    } finally {
      rmSync(notARepo, { recursive: true, force: true });
    }

    expect(err!.message.length).toBeGreaterThan(0);
  });

  it('GitLogError code is the typed discriminant "git-error"', () => {
    const notARepo = mkdtempSync(join(tmpdir(), 'not-a-repo-disc-'));
    let err: GitLogError | undefined;

    try {
      gitLog({}, { cwd: notARepo });
    } catch (e) {
      err = e as GitLogError;
    } finally {
      rmSync(notARepo, { recursive: true, force: true });
    }

    const validCodes: Array<'git-error'> = ['git-error'];
    expect(validCodes).toContain(err!.code);
  });
});
