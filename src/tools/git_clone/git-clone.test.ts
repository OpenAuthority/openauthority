/**
 * Unit tests for the git_clone tool.
 *
 * Each test group spins up a fresh temporary git repository as the clone
 * source so tests are fully isolated and do not require network access.
 *
 * Test IDs:
 *   TC-GCL-01: Successful clone operations
 *   TC-GCL-02: Error handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { gitClone, GitCloneError } from './git-clone.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Initialise a bare-clonable git repo in `dir` with a throwaway identity. */
function initRepo(dir: string): void {
  spawnSync('git', ['init', '-b', 'main'], { cwd: dir });
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

/** Returns a unique non-existent path suitable as a clone destination. */
function uniqueDestPath(prefix: string): string {
  return join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

// ─── TC-GCL-01: Successful clone operations ───────────────────────────────────

describe('TC-GCL-01: successful clone operations', () => {
  let srcDir: string;
  let destDir: string;

  beforeEach(() => {
    srcDir = mkdtempSync(join(tmpdir(), 'git-clone-src-'));
    initRepo(srcDir);
    makeCommit(srcDir, 'README.md', '# Test repo\n', 'initial commit');
    destDir = uniqueDestPath('git-clone-dest');
  });

  afterEach(() => {
    rmSync(srcDir, { recursive: true, force: true });
    rmSync(destDir, { recursive: true, force: true });
  });

  it('clones a local file:// repository and returns url and path', () => {
    const url = `file://${srcDir}`;
    const result = gitClone({ url, path: destDir });

    expect(result.url).toBe(url);
    expect(result.path).toBe(destDir);
  });

  it('returns a non-empty message string on successful clone', () => {
    const url = `file://${srcDir}`;
    const result = gitClone({ url, path: destDir });

    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('cloned repository exists at the specified path', () => {
    const url = `file://${srcDir}`;
    gitClone({ url, path: destDir });

    expect(existsSync(destDir)).toBe(true);
  });

  it('cloned repository is a valid git repository', () => {
    const url = `file://${srcDir}`;
    gitClone({ url, path: destDir });

    const statusResult = spawnSync('git', ['status'], { cwd: destDir, encoding: 'utf-8' });
    expect(statusResult.status).toBe(0);
  });

  it('cloned repository contains the committed files from source', () => {
    const url = `file://${srcDir}`;
    gitClone({ url, path: destDir });

    expect(existsSync(join(destDir, 'README.md'))).toBe(true);
  });
});

// ─── TC-GCL-02: Error handling ────────────────────────────────────────────────

describe('TC-GCL-02: error handling', () => {
  let srcDir: string;
  let destDir: string;

  beforeEach(() => {
    srcDir = mkdtempSync(join(tmpdir(), 'git-clone-err-src-'));
    initRepo(srcDir);
    makeCommit(srcDir, 'file.txt', 'content\n', 'initial commit');
    destDir = uniqueDestPath('git-clone-err-dest');
  });

  afterEach(() => {
    rmSync(srcDir, { recursive: true, force: true });
    rmSync(destDir, { recursive: true, force: true });
  });

  it('throws GitCloneError for an invalid URL format', () => {
    expect(() =>
      gitClone({ url: 'not-a-valid-url', path: destDir }),
    ).toThrow(GitCloneError);
  });

  it('thrown error has code invalid-url for a malformed URL', () => {
    let err: GitCloneError | undefined;
    try {
      gitClone({ url: 'just-a-string-no-scheme', path: destDir });
    } catch (e) {
      err = e as GitCloneError;
    }

    expect(err).toBeInstanceOf(GitCloneError);
    expect(err!.code).toBe('invalid-url');
  });

  it('thrown error message mentions the invalid URL', () => {
    const badUrl = 'totally-invalid';
    let err: GitCloneError | undefined;
    try {
      gitClone({ url: badUrl, path: destDir });
    } catch (e) {
      err = e as GitCloneError;
    }

    expect(err!.message).toMatch(badUrl);
  });

  it('throws GitCloneError with code path-exists when destination already exists', () => {
    // Use srcDir itself as destination — it already exists.
    const url = `file://${srcDir}`;
    let err: GitCloneError | undefined;
    try {
      gitClone({ url, path: srcDir });
    } catch (e) {
      err = e as GitCloneError;
    }

    expect(err).toBeInstanceOf(GitCloneError);
    expect(err!.code).toBe('path-exists');
  });

  it('thrown path-exists error message mentions the destination path', () => {
    const url = `file://${srcDir}`;
    let err: GitCloneError | undefined;
    try {
      gitClone({ url, path: srcDir });
    } catch (e) {
      err = e as GitCloneError;
    }

    expect(err!.message).toMatch(srcDir);
  });

  it('throws GitCloneError with code git-error for a non-existent repository URL', () => {
    const url = `file:///this/path/does/not/exist/at/all`;
    let err: GitCloneError | undefined;
    try {
      gitClone({ url, path: destDir });
    } catch (e) {
      err = e as GitCloneError;
    }

    expect(err).toBeInstanceOf(GitCloneError);
    expect(err!.code).toBe('git-error');
  });

  it('GitCloneError exposes code as a typed discriminant', () => {
    let err: GitCloneError | undefined;
    try {
      gitClone({ url: 'bad-url-no-scheme', path: destDir });
    } catch (e) {
      err = e as GitCloneError;
    }

    const validCodes: Array<'invalid-url' | 'path-exists' | 'git-error'> = [
      'invalid-url',
      'path-exists',
      'git-error',
    ];
    expect(validCodes).toContain(err!.code);
  });
});
