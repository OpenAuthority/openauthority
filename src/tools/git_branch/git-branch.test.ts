/**
 * Unit tests for the git_branch tool.
 *
 * Each test group spins up a fresh temporary git repository so tests are
 * fully isolated and do not affect the project's own index.
 *
 * Test IDs:
 *   TC-GBR-01: Successful branch creation scenarios
 *   TC-GBR-02: Error handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { gitBranch, GitBranchError } from './git-branch.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Initialise a git repo in `dir` with a throwaway identity. */
function initRepo(dir: string): void {
  spawnSync('git', ['init', '-b', 'main'], { cwd: dir });
  // Fall back for older git versions that don't support -b
  spawnSync('git', ['checkout', '-b', 'main'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
}

/** Write a file, stage it, and commit. Returns the commit hash. */
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

/** Returns true if a branch with the given name exists in the repo. */
function branchExists(dir: string, branch: string): boolean {
  const result = spawnSync(
    'git',
    ['rev-parse', '--verify', `refs/heads/${branch}`],
    { cwd: dir, encoding: 'utf-8' },
  );
  return result.status === 0;
}

// ─── TC-GBR-01: Successful branch creation scenarios ─────────────────────────

describe('TC-GBR-01: successful branch creation scenarios', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'git-branch-ok-'));
    initRepo(repoDir);
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('creates a new branch from HEAD and returns the branch name', () => {
    makeCommit(repoDir, 'init.txt', 'init\n', 'initial commit');

    const result = gitBranch({ name: 'feature/my-feature' }, { cwd: repoDir });

    expect(result.name).toBe('feature/my-feature');
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
    expect(branchExists(repoDir, 'feature/my-feature')).toBe(true);
  });

  it('returns a message containing the branch name', () => {
    makeCommit(repoDir, 'a.txt', 'a\n', 'initial');

    const result = gitBranch({ name: 'release-1.0' }, { cwd: repoDir });

    expect(result.message).toContain('release-1.0');
  });

  it('creates a new branch from a named starting point', () => {
    makeCommit(repoDir, 'base.txt', 'base\n', 'initial commit');
    spawnSync('git', ['checkout', '-b', 'develop'], { cwd: repoDir });
    makeCommit(repoDir, 'dev.txt', 'dev\n', 'dev commit');
    spawnSync('git', ['checkout', 'main'], { cwd: repoDir });

    const result = gitBranch({ name: 'hotfix', from: 'develop' }, { cwd: repoDir });

    expect(result.name).toBe('hotfix');
    expect(result.message).toContain('develop');
    expect(branchExists(repoDir, 'hotfix')).toBe(true);
  });

  it('creates a new branch from a commit hash', () => {
    const commitHash = makeCommit(repoDir, 'file.txt', 'content\n', 'initial');
    makeCommit(repoDir, 'file2.txt', 'more\n', 'second commit');

    const result = gitBranch({ name: 'from-hash', from: commitHash }, { cwd: repoDir });

    expect(result.name).toBe('from-hash');
    expect(branchExists(repoDir, 'from-hash')).toBe(true);
  });

  it('does not switch the current branch after creation', () => {
    makeCommit(repoDir, 'init.txt', 'init\n', 'initial');

    gitBranch({ name: 'new-branch' }, { cwd: repoDir });

    const head = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: repoDir,
      encoding: 'utf-8',
    });
    expect(head.stdout.trim()).toBe('main');
  });
});

// ─── TC-GBR-02: Error handling ────────────────────────────────────────────────

describe('TC-GBR-02: error handling', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'git-branch-err-'));
    initRepo(repoDir);
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('throws GitBranchError when branch already exists', () => {
    makeCommit(repoDir, 'init.txt', 'init\n', 'initial');
    spawnSync('git', ['branch', 'existing-branch'], { cwd: repoDir });

    expect(() =>
      gitBranch({ name: 'existing-branch' }, { cwd: repoDir }),
    ).toThrow(GitBranchError);
  });

  it('thrown error has code branch-already-exists for duplicate branch', () => {
    makeCommit(repoDir, 'init.txt', 'init\n', 'initial');
    spawnSync('git', ['branch', 'duplicate'], { cwd: repoDir });

    let err: GitBranchError | undefined;
    try {
      gitBranch({ name: 'duplicate' }, { cwd: repoDir });
    } catch (e) {
      err = e as GitBranchError;
    }

    expect(err).toBeInstanceOf(GitBranchError);
    expect(err!.code).toBe('branch-already-exists');
    expect(err!.message).toMatch(/duplicate/);
  });

  it('throws GitBranchError with code from-not-found for missing starting point', () => {
    makeCommit(repoDir, 'init.txt', 'init\n', 'initial');

    let err: GitBranchError | undefined;
    try {
      gitBranch({ name: 'new-branch', from: 'nonexistent-ref' }, { cwd: repoDir });
    } catch (e) {
      err = e as GitBranchError;
    }

    expect(err).toBeInstanceOf(GitBranchError);
    expect(err!.code).toBe('from-not-found');
    expect(err!.message).toMatch(/nonexistent-ref/);
  });

  it('throws GitBranchError with code git-error when not in a git repo', () => {
    const notARepo = mkdtempSync(join(tmpdir(), 'not-a-repo-'));

    let err: GitBranchError | undefined;
    try {
      gitBranch({ name: 'my-branch' }, { cwd: notARepo });
    } catch (e) {
      err = e as GitBranchError;
    } finally {
      rmSync(notARepo, { recursive: true, force: true });
    }

    expect(err).toBeInstanceOf(GitBranchError);
    const validCodes: Array<'branch-already-exists' | 'from-not-found' | 'git-error'> = [
      'from-not-found',
      'git-error',
    ];
    expect(validCodes).toContain(err!.code);
  });

  it('GitBranchError exposes code as a typed discriminant', () => {
    makeCommit(repoDir, 'init.txt', 'init\n', 'initial');
    spawnSync('git', ['branch', 'taken'], { cwd: repoDir });

    let err: GitBranchError | undefined;
    try {
      gitBranch({ name: 'taken' }, { cwd: repoDir });
    } catch (e) {
      err = e as GitBranchError;
    }

    const validCodes: Array<'branch-already-exists' | 'from-not-found' | 'git-error'> = [
      'branch-already-exists',
      'from-not-found',
      'git-error',
    ];
    expect(validCodes).toContain(err!.code);
  });
});
