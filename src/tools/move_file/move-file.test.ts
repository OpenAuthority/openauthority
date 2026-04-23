/**
 * Unit tests for the move_file tool.
 *
 * Each test group creates a fresh temporary directory so tests are
 * fully isolated and do not affect the project's own filesystem.
 *
 * Test IDs:
 *   TC-MF-01: Successful move operations
 *   TC-MF-02: Source file validation
 *   TC-MF-03: Result shape
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { moveFile, MoveFileError } from './move-file.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'move-file-'));
}

// ─── TC-MF-01: Successful move operations ─────────────────────────────────────

describe('TC-MF-01: successful move operations', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('moves a file to the destination path', () => {
    const src = join(dir, 'source.txt');
    const dst = join(dir, 'dest.txt');
    writeFileSync(src, 'hello world');

    moveFile({ from: src, to: dst });

    expect(existsSync(dst)).toBe(true);
  });

  it('source file no longer exists after move', () => {
    const src = join(dir, 'source.txt');
    const dst = join(dir, 'dest.txt');
    writeFileSync(src, 'hello world');

    moveFile({ from: src, to: dst });

    expect(existsSync(src)).toBe(false);
  });

  it('destination receives exact content of source', () => {
    const content = 'exact content to move';
    const src = join(dir, 'source.txt');
    const dst = join(dir, 'dest.txt');
    writeFileSync(src, content);

    moveFile({ from: src, to: dst });

    expect(readFileSync(dst, 'utf8')).toBe(content);
  });

  it('returns resolved from and to paths', () => {
    const src = join(dir, 'source.txt');
    const dst = join(dir, 'dest.txt');
    writeFileSync(src, 'data');

    const result = moveFile({ from: src, to: dst });

    expect(result.from).toBe(src);
    expect(result.to).toBe(dst);
  });

  it('moves an empty file', () => {
    const src = join(dir, 'empty.txt');
    const dst = join(dir, 'empty-moved.txt');
    writeFileSync(src, '');

    moveFile({ from: src, to: dst });

    expect(existsSync(dst)).toBe(true);
    expect(readFileSync(dst, 'utf8')).toBe('');
    expect(existsSync(src)).toBe(false);
  });

  it('moves to a destination in a subdirectory', () => {
    const subDir = join(dir, 'sub');
    mkdirSync(subDir);
    const src = join(dir, 'source.txt');
    const dst = join(subDir, 'dest.txt');
    writeFileSync(src, 'subdir content');

    moveFile({ from: src, to: dst });

    expect(readFileSync(dst, 'utf8')).toBe('subdir content');
    expect(existsSync(src)).toBe(false);
  });

  it('overwrites an existing destination file', () => {
    const src = join(dir, 'new-source.txt');
    const dst = join(dir, 'existing-dest.txt');
    writeFileSync(src, 'new content');
    writeFileSync(dst, 'old content');

    moveFile({ from: src, to: dst });

    expect(readFileSync(dst, 'utf8')).toBe('new content');
    expect(existsSync(src)).toBe(false);
  });

  it('moves binary-like content faithfully', () => {
    const content = 'binary\x00data\xff\xfe';
    const src = join(dir, 'binary.bin');
    const dst = join(dir, 'binary-moved.bin');
    writeFileSync(src, content, 'binary');

    moveFile({ from: src, to: dst });

    expect(readFileSync(dst, 'binary')).toBe(content);
    expect(existsSync(src)).toBe(false);
  });
});

// ─── TC-MF-02: Source file validation ────────────────────────────────────────

describe('TC-MF-02: source file validation', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('throws MoveFileError with code not-found for missing source', () => {
    const src = join(dir, 'does-not-exist.txt');
    const dst = join(dir, 'dest.txt');

    let err: MoveFileError | undefined;
    try {
      moveFile({ from: src, to: dst });
    } catch (e) {
      err = e as MoveFileError;
    }

    expect(err).toBeInstanceOf(MoveFileError);
    expect(err!.code).toBe('not-found');
  });

  it('throws MoveFileError with code not-a-file when source is a directory', () => {
    const src = join(dir, 'source-dir');
    mkdirSync(src);
    const dst = join(dir, 'dest.txt');

    let err: MoveFileError | undefined;
    try {
      moveFile({ from: src, to: dst });
    } catch (e) {
      err = e as MoveFileError;
    }

    expect(err).toBeInstanceOf(MoveFileError);
    expect(err!.code).toBe('not-a-file');
  });

  it('not-found error message includes source path', () => {
    const src = join(dir, 'missing.txt');
    const dst = join(dir, 'dest.txt');

    let err: MoveFileError | undefined;
    try {
      moveFile({ from: src, to: dst });
    } catch (e) {
      err = e as MoveFileError;
    }

    expect(err!.message).toContain(src);
  });

  it('not-a-file error message includes source path', () => {
    const src = join(dir, 'a-directory');
    mkdirSync(src);
    const dst = join(dir, 'dest.txt');

    let err: MoveFileError | undefined;
    try {
      moveFile({ from: src, to: dst });
    } catch (e) {
      err = e as MoveFileError;
    }

    expect(err!.message).toContain(src);
  });

  it('thrown MoveFileError has name "MoveFileError"', () => {
    const src = join(dir, 'no-such-file.txt');
    const dst = join(dir, 'dest.txt');

    let err: MoveFileError | undefined;
    try {
      moveFile({ from: src, to: dst });
    } catch (e) {
      err = e as MoveFileError;
    }

    expect(err!.name).toBe('MoveFileError');
  });

  it('does not create destination when source is missing', () => {
    const src = join(dir, 'does-not-exist.txt');
    const dst = join(dir, 'dest.txt');

    try {
      moveFile({ from: src, to: dst });
    } catch {
      // expected
    }

    expect(existsSync(dst)).toBe(false);
  });
});

// ─── TC-MF-03: Result shape ───────────────────────────────────────────────────

describe('TC-MF-03: result shape', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('result has from and to fields', () => {
    const src = join(dir, 'source.txt');
    const dst = join(dir, 'dest.txt');
    writeFileSync(src, 'content');

    const result = moveFile({ from: src, to: dst });

    expect(result).toHaveProperty('from');
    expect(result).toHaveProperty('to');
  });

  it('from and to fields are strings', () => {
    const src = join(dir, 'source.txt');
    const dst = join(dir, 'dest.txt');
    writeFileSync(src, 'content');

    const result = moveFile({ from: src, to: dst });

    expect(typeof result.from).toBe('string');
    expect(typeof result.to).toBe('string');
  });
});
