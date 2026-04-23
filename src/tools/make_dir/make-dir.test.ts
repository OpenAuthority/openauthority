/**
 * Unit tests for the make_dir tool.
 *
 * Each test group creates a fresh temporary directory so tests are
 * fully isolated and do not affect the project's own filesystem.
 *
 * Test IDs:
 *   TC-MD-01: Directory creation operations
 *   TC-MD-02: Existing directory handling
 *   TC-MD-03: Error handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeDir, MakeDirError } from './make-dir.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a temp directory for a test group. */
function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'make-dir-'));
}

// ─── TC-MD-01: Directory creation operations ──────────────────────────────────

describe('TC-MD-01: directory creation operations', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates a new directory and returns its absolute path', () => {
    const target = join(dir, 'new-dir');

    const result = makeDir({ path: target });

    expect(result.path).toBe(target);
  });

  it('the created path is an actual directory on disk', () => {
    const target = join(dir, 'created');

    makeDir({ path: target });

    expect(statSync(target).isDirectory()).toBe(true);
  });

  it('creates nested directories in a single call', () => {
    const target = join(dir, 'a', 'b', 'c');

    makeDir({ path: target });

    expect(existsSync(target)).toBe(true);
    expect(statSync(target).isDirectory()).toBe(true);
  });

  it('creates deeply nested directories', () => {
    const target = join(dir, 'x', 'y', 'z', 'w', 'v');

    makeDir({ path: target });

    expect(existsSync(target)).toBe(true);
  });

  it('result has a path field matching the resolved input path', () => {
    const target = join(dir, 'result-shape');

    const result = makeDir({ path: target });

    expect(result).toHaveProperty('path', target);
  });
});

// ─── TC-MD-02: Existing directory handling ────────────────────────────────────

describe('TC-MD-02: existing directory handling', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('does not throw when the directory already exists', () => {
    const target = join(dir, 'existing');
    makeDir({ path: target });

    expect(() => makeDir({ path: target })).not.toThrow();
  });

  it('returns the path when the directory already exists', () => {
    const target = join(dir, 'pre-existing');
    makeDir({ path: target });

    const result = makeDir({ path: target });

    expect(result.path).toBe(target);
  });

  it('does not modify directory contents when called on an existing directory', () => {
    const target = join(dir, 'with-contents');
    makeDir({ path: target });
    writeFileSync(join(target, 'file.txt'), 'data');

    makeDir({ path: target });

    expect(existsSync(join(target, 'file.txt'))).toBe(true);
  });
});

// ─── TC-MD-03: Error handling ─────────────────────────────────────────────────

describe('TC-MD-03: error handling', () => {
  it('throws MakeDirError with code not-a-dir when path is an existing file', () => {
    const tempDir = makeTempDir();
    const filePath = join(tempDir, 'i-am-a-file.txt');
    writeFileSync(filePath, 'content');

    let err: MakeDirError | undefined;

    try {
      makeDir({ path: filePath });
    } catch (e) {
      err = e as MakeDirError;
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }

    expect(err).toBeInstanceOf(MakeDirError);
    expect(err!.code).toBe('not-a-dir');
  });

  it('thrown MakeDirError has name "MakeDirError"', () => {
    const tempDir = makeTempDir();
    const filePath = join(tempDir, 'blocker.txt');
    writeFileSync(filePath, 'content');

    let err: MakeDirError | undefined;

    try {
      makeDir({ path: filePath });
    } catch (e) {
      err = e as MakeDirError;
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }

    expect(err!.name).toBe('MakeDirError');
  });

  it('error message includes the path for not-a-dir errors', () => {
    const tempDir = makeTempDir();
    const filePath = join(tempDir, 'path-in-message.txt');
    writeFileSync(filePath, 'content');

    let err: MakeDirError | undefined;

    try {
      makeDir({ path: filePath });
    } catch (e) {
      err = e as MakeDirError;
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }

    expect(err!.message).toContain(filePath);
  });

  it('throws MakeDirError with code fs-error when an intermediate path component is a file', () => {
    const tempDir = makeTempDir();
    const blockingFile = join(tempDir, 'blocker');
    writeFileSync(blockingFile, 'i am a file');

    let err: MakeDirError | undefined;

    try {
      makeDir({ path: join(blockingFile, 'child') });
    } catch (e) {
      err = e as MakeDirError;
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }

    expect(err).toBeInstanceOf(MakeDirError);
    expect(err!.code).toBe('fs-error');
  });

  it('does not throw for a new directory in a valid parent', () => {
    const tempDir = makeTempDir();
    const target = join(tempDir, 'valid-new-dir');

    let threw = false;
    try {
      makeDir({ path: target });
    } catch {
      threw = true;
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }

    expect(threw).toBe(false);
  });
});
