/**
 * Unit tests for the find_files tool.
 *
 * Each test group creates a fresh temporary directory so tests are
 * fully isolated and do not affect the project's own filesystem.
 *
 * Test IDs:
 *   TC-FF-01: Successful pattern matches
 *   TC-FF-02: Glob pattern behaviour
 *   TC-FF-03: Error handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findFiles, FindFilesError } from './find-files.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'find-files-'));
}

// ─── TC-FF-01: Successful pattern matches ─────────────────────────────────────

describe('TC-FF-01: successful pattern matches', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns empty array when no files match', () => {
    writeFileSync(join(dir, 'readme.md'), '# readme');

    const result = findFiles({ pattern: '*.ts', path: dir });

    expect(result.paths).toEqual([]);
  });

  it('returns empty array for an empty directory', () => {
    const result = findFiles({ pattern: '*.txt', path: dir });

    expect(result.paths).toEqual([]);
  });

  it('finds a single matching file at root level', () => {
    writeFileSync(join(dir, 'index.ts'), 'export {}');

    const result = findFiles({ pattern: '*.ts', path: dir });

    expect(result.paths).toHaveLength(1);
    expect(result.paths[0]).toBe(join(dir, 'index.ts'));
  });

  it('finds multiple matching files at root level', () => {
    writeFileSync(join(dir, 'a.ts'), '');
    writeFileSync(join(dir, 'b.ts'), '');
    writeFileSync(join(dir, 'c.md'), '');

    const result = findFiles({ pattern: '*.ts', path: dir });

    expect(result.paths).toHaveLength(2);
    expect(result.paths).toContain(join(dir, 'a.ts'));
    expect(result.paths).toContain(join(dir, 'b.ts'));
  });

  it('matches exact filename', () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    writeFileSync(join(dir, 'other.json'), '{}');

    const result = findFiles({ pattern: 'package.json', path: dir });

    expect(result.paths).toHaveLength(1);
    expect(result.paths[0]).toBe(join(dir, 'package.json'));
  });

  it('finds files recursively with ** pattern', () => {
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'index.ts'), '');
    writeFileSync(join(dir, 'root.ts'), '');

    const result = findFiles({ pattern: '**/*.ts', path: dir });

    expect(result.paths).toContain(join(dir, 'root.ts'));
    expect(result.paths).toContain(join(dir, 'src', 'index.ts'));
    expect(result.paths).toHaveLength(2);
  });

  it('finds files nested several levels deep', () => {
    mkdirSync(join(dir, 'a', 'b', 'c'), { recursive: true });
    writeFileSync(join(dir, 'a', 'b', 'c', 'deep.ts'), '');

    const result = findFiles({ pattern: '**/*.ts', path: dir });

    expect(result.paths).toContain(join(dir, 'a', 'b', 'c', 'deep.ts'));
  });

  it('returns absolute paths', () => {
    writeFileSync(join(dir, 'file.ts'), '');

    const result = findFiles({ pattern: '*.ts', path: dir });

    expect(result.paths[0]).toMatch(/^\//);
  });

  it('result has a paths array field', () => {
    const result = findFiles({ pattern: '*.ts', path: dir });

    expect(Array.isArray(result.paths)).toBe(true);
  });
});

// ─── TC-FF-02: Glob pattern behaviour ─────────────────────────────────────────

describe('TC-FF-02: glob pattern behaviour', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('* does not match files inside subdirectories', () => {
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'sub', 'nested.ts'), '');
    writeFileSync(join(dir, 'root.ts'), '');

    const result = findFiles({ pattern: '*.ts', path: dir });

    expect(result.paths).toHaveLength(1);
    expect(result.paths[0]).toBe(join(dir, 'root.ts'));
  });

  it('**/*.ts matches files in subdirectories but not non-.ts files', () => {
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'index.ts'), '');
    writeFileSync(join(dir, 'src', 'readme.md'), '');

    const result = findFiles({ pattern: '**/*.ts', path: dir });

    expect(result.paths).toContain(join(dir, 'src', 'index.ts'));
    expect(result.paths).not.toContain(join(dir, 'src', 'readme.md'));
  });

  it('? matches exactly one character', () => {
    writeFileSync(join(dir, 'a.ts'), '');
    writeFileSync(join(dir, 'ab.ts'), '');
    writeFileSync(join(dir, 'b.ts'), '');

    const result = findFiles({ pattern: '?.ts', path: dir });

    expect(result.paths).toContain(join(dir, 'a.ts'));
    expect(result.paths).toContain(join(dir, 'b.ts'));
    expect(result.paths).not.toContain(join(dir, 'ab.ts'));
  });

  it('{ts,tsx} alternation matches both extensions', () => {
    writeFileSync(join(dir, 'comp.ts'), '');
    writeFileSync(join(dir, 'comp.tsx'), '');
    writeFileSync(join(dir, 'style.css'), '');

    const result = findFiles({ pattern: '*.{ts,tsx}', path: dir });

    expect(result.paths).toContain(join(dir, 'comp.ts'));
    expect(result.paths).toContain(join(dir, 'comp.tsx'));
    expect(result.paths).not.toContain(join(dir, 'style.css'));
  });

  it('**/package.json finds nested package.json files', () => {
    mkdirSync(join(dir, 'packages', 'core'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), '{}');
    writeFileSync(join(dir, 'packages', 'core', 'package.json'), '{}');

    const result = findFiles({ pattern: '**/package.json', path: dir });

    expect(result.paths).toContain(join(dir, 'package.json'));
    expect(result.paths).toContain(join(dir, 'packages', 'core', 'package.json'));
    expect(result.paths).toHaveLength(2);
  });

  it('prefix pattern src/*.ts only matches files directly in src/', () => {
    mkdirSync(join(dir, 'src', 'utils'), { recursive: true });
    writeFileSync(join(dir, 'src', 'index.ts'), '');
    writeFileSync(join(dir, 'src', 'utils', 'helper.ts'), '');

    const result = findFiles({ pattern: 'src/*.ts', path: dir });

    expect(result.paths).toContain(join(dir, 'src', 'index.ts'));
    expect(result.paths).not.toContain(join(dir, 'src', 'utils', 'helper.ts'));
    expect(result.paths).toHaveLength(1);
  });

  it('** at end of pattern matches files and directories of any depth', () => {
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'index.ts'), '');
    writeFileSync(join(dir, 'readme.md'), '');

    const result = findFiles({ pattern: '**', path: dir });

    expect(result.paths).toContain(join(dir, 'src', 'index.ts'));
    expect(result.paths).toContain(join(dir, 'readme.md'));
  });
});

// ─── TC-FF-03: Error handling ─────────────────────────────────────────────────

describe('TC-FF-03: error handling', () => {
  it('throws FindFilesError with code not-found for a non-existent path', () => {
    const nonExistent = join(tmpdir(), `find-files-nf-${Date.now()}`);
    let err: FindFilesError | undefined;

    try {
      findFiles({ pattern: '*.ts', path: nonExistent });
    } catch (e) {
      err = e as FindFilesError;
    }

    expect(err).toBeInstanceOf(FindFilesError);
    expect(err!.code).toBe('not-found');
  });

  it('throws FindFilesError with code not-a-dir when path is a file', () => {
    const tempDir = makeTempDir();
    const filePath = join(tempDir, 'file.txt');
    writeFileSync(filePath, 'content');
    let err: FindFilesError | undefined;

    try {
      findFiles({ pattern: '*.ts', path: filePath });
    } catch (e) {
      err = e as FindFilesError;
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }

    expect(err).toBeInstanceOf(FindFilesError);
    expect(err!.code).toBe('not-a-dir');
  });

  it('thrown FindFilesError has name "FindFilesError"', () => {
    const nonExistent = join(tmpdir(), `find-files-name-${Date.now()}`);
    let err: FindFilesError | undefined;

    try {
      findFiles({ pattern: '*.ts', path: nonExistent });
    } catch (e) {
      err = e as FindFilesError;
    }

    expect(err!.name).toBe('FindFilesError');
  });

  it('error message includes the path', () => {
    const nonExistent = join(tmpdir(), `find-files-msg-${Date.now()}`);
    let err: FindFilesError | undefined;

    try {
      findFiles({ pattern: '*.ts', path: nonExistent });
    } catch (e) {
      err = e as FindFilesError;
    }

    expect(err!.message).toContain(nonExistent);
  });
});
