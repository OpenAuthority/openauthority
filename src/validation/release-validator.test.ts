/**
 * ReleaseValidator — test suite
 *
 * Verifies that the automated v2.0 exit checklist correctly validates all
 * Definition of Done (DOD) and V-series (V-) criteria, including:
 *   - Migration guide publication check
 *   - Spec alignment audit completion check
 *   - Security review validation
 *   - CHANGELOG validation
 *
 * Test IDs:
 *   TC-RV-01: DOD-1 — unit test configuration check
 *   TC-RV-02: DOD-2 — E2E test configuration check
 *   TC-RV-03: DOD-3 — coverage thresholds declaration check
 *   TC-RV-04: DOD-4 — CHANGELOG release entry check
 *   TC-RV-05: DOD-5 — migration guide publication check
 *   TC-RV-06: DOD-6 — spec alignment audit completion check
 *   TC-RV-07: DOD-7 — security review document existence check
 *   TC-RV-08: DOD-8 — no blocking items in CHANGELOG [Unreleased] check
 *   TC-RV-09: V-01  — TypeScript strict mode check
 *   TC-RV-10: V-02  — no runtime child_process check
 *   TC-RV-11: V-03  — vitest thresholds block check
 *   TC-RV-12: V-04  — src/enforcement/** coverage threshold check
 *   TC-RV-13: V-05  — src/hitl/** coverage threshold check
 *   TC-RV-14: V-06  — src/policy/** coverage threshold check
 *   TC-RV-15: V-07  — src/adapter/** coverage threshold check
 *   TC-RV-16: V-08  — E2E config omits thresholds check
 *   TC-RV-17: V-09  — security review document existence check (V-series)
 *   TC-RV-18: V-10  — no open critical security findings check
 *   TC-RV-19: V-11  — CHANGELOG Keep a Changelog format check
 *   TC-RV-20: V-12  — package.json version match check
 *   TC-RV-21: Aggregated result — all checks pass when project is release-ready
 *   TC-RV-22: Aggregated result — failures array lists only failed checks
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ReleaseValidator } from './release-validator.js';
import type { ReleaseValidationContext } from './release-validator.js';

// ─── File system mock helpers ─────────────────────────────────────────────────

/**
 * Mocks `node:fs` so tests can control the virtual file system without
 * touching the real disk.
 *
 * Returns `files[path]` for `readFileSync` and `existsSync` calls.
 * Unknown paths return `null` / `false` respectively.
 */
function mockFs(files: Record<string, string>): void {
  vi.mock('node:fs', async (importOriginal) => {
    const original = await importOriginal<typeof import('node:fs')>();
    return {
      ...original,
      existsSync: (p: string) => Object.prototype.hasOwnProperty.call(files, p),
      readFileSync: (p: string, _enc: string) => {
        if (!Object.prototype.hasOwnProperty.call(files, p)) {
          const err = Object.assign(new Error(`ENOENT: no such file or directory, open '${p}'`), {
            code: 'ENOENT',
          });
          throw err;
        }
        return files[p];
      },
    };
  });
}

// Because vi.mock is module-scoped in Vitest, we use a different approach:
// spy on the individual exports from node:fs directly.
import * as nodefs from 'node:fs';

/**
 * Sets up spies on `existsSync` and `readFileSync` from `node:fs` so that
 * paths in `files` resolve to their string values and all other paths behave
 * as "not found".
 */
function setupFsSpies(files: Record<string, string>): void {
  vi.spyOn(nodefs, 'existsSync').mockImplementation((p) => {
    return Object.prototype.hasOwnProperty.call(files, String(p));
  });

  vi.spyOn(nodefs, 'readFileSync').mockImplementation((p, _options) => {
    const key = String(p);
    if (!Object.prototype.hasOwnProperty.call(files, key)) {
      const err = Object.assign(new Error(`ENOENT: no such file: ${key}`), { code: 'ENOENT' });
      throw err;
    }
    return files[key] as string;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Minimal "release-ready" fixture ─────────────────────────────────────────

const TARGET_VERSION = '2.0.0';
const ROOT = '/project';

function path(relative: string): string {
  return `${ROOT}/${relative}`;
}

/**
 * Returns a full set of file contents representing a release-ready project.
 * Individual tests override specific entries to exercise failure paths.
 */
function releaseReadyFiles(): Record<string, string> {
  return {
    [path('vitest.config.ts')]: `
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      thresholds: {
        'src/enforcement/**': { lines: 95 },
        'src/hitl/**': { lines: 88 },
        'src/policy/**': { lines: 90 },
        'src/adapter/**': { lines: 85 },
      },
    },
  },
});
`,
    [path('vitest.e2e.config.ts')]: `
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['src/**/*.e2e.ts'],
    coverage: { provider: 'v8', reporter: ['text'] },
  },
});
`,
    [path('CHANGELOG.md')]: `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

No unreleased changes.

## [2.0.0] — 2026-05-01

### Added

- Initial v2 release.
`,
    [path('docs/migration-v2.md')]: `# Migration Guide — v2.0\n\nSee below for upgrade steps.\n`,
    [path('docs/contributing.md')]: `# Contributing\n\nspec alignment audit: see docs/spec-alignment-audit.md\n`,
    [path('docs/spec-alignment-audit.md')]: `# Spec Alignment Audit\n\nAll specs are aligned.\n`,
    [path('docs/security-review-v2.md')]: `# Security Review v2

| Finding | Area | Severity | Status |
|---|---|---|---|
| F-01 | Enforcement gate | Medium | Addressed |
| F-02 | In-memory token | Medium | Addressed |
`,
    [path('tsconfig.json')]: JSON.stringify({
      compilerOptions: { strict: true, target: 'ES2022' },
    }),
    [path('src/index.ts')]: `
// Main plugin entry point
export function activate() {}
`,
    [path('package.json')]: JSON.stringify({ name: 'clawthority', version: '2.0.0' }),
  };
}

function ctx(): ReleaseValidationContext {
  return { root: ROOT, targetVersion: TARGET_VERSION };
}

// ─── TC-RV-01: DOD-1 — unit test configuration ───────────────────────────────

describe('TC-RV-01: DOD-1 — unit test configuration targets src/**/*.test.ts', () => {
  it('passes when vitest.config.ts includes src/**/*.test.ts', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'DOD-1')!;
    expect(check.passed).toBe(true);
  });

  it('fails when vitest.config.ts is missing', () => {
    const files = releaseReadyFiles();
    delete files[path('vitest.config.ts')];
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'DOD-1')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('vitest.config.ts not found');
  });

  it('fails when vitest.config.ts does not include the test glob', () => {
    const files = releaseReadyFiles();
    files[path('vitest.config.ts')] = `import { defineConfig } from 'vitest/config';\nexport default defineConfig({ test: {} });\n`;
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'DOD-1')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain("src/**/*.test.ts");
  });
});

// ─── TC-RV-02: DOD-2 — E2E test configuration ────────────────────────────────

describe('TC-RV-02: DOD-2 — E2E test configuration exists', () => {
  it('passes when vitest.e2e.config.ts exists', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'DOD-2')!;
    expect(check.passed).toBe(true);
  });

  it('fails when vitest.e2e.config.ts is missing', () => {
    const files = releaseReadyFiles();
    delete files[path('vitest.e2e.config.ts')];
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'DOD-2')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('vitest.e2e.config.ts not found');
  });
});

// ─── TC-RV-03: DOD-3 — coverage thresholds declaration ───────────────────────

describe('TC-RV-03: DOD-3 — coverage thresholds declared in vitest.config.ts', () => {
  it('passes when thresholds block is present', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'DOD-3')!;
    expect(check.passed).toBe(true);
  });

  it('fails when thresholds is absent', () => {
    const files = releaseReadyFiles();
    files[path('vitest.config.ts')] = `import { defineConfig } from 'vitest/config';\nexport default defineConfig({ test: { coverage: {} } });\n`;
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'DOD-3')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('thresholds');
  });
});

// ─── TC-RV-04: DOD-4 — CHANGELOG release entry ───────────────────────────────

describe('TC-RV-04: DOD-4 — CHANGELOG contains release entry for target version', () => {
  it('passes when CHANGELOG contains a [2.0.0] entry', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'DOD-4')!;
    expect(check.passed).toBe(true);
  });

  it('fails when CHANGELOG.md is missing', () => {
    const files = releaseReadyFiles();
    delete files[path('CHANGELOG.md')];
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'DOD-4')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('CHANGELOG.md not found');
  });

  it('fails when CHANGELOG has no entry for the target version', () => {
    const files = releaseReadyFiles();
    files[path('CHANGELOG.md')] = `# Changelog\n\n## [1.9.0] — 2026-01-01\n\n- Old release.\n`;
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'DOD-4')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('## [2.0.0]');
  });
});

// ─── TC-RV-05: DOD-5 — migration guide publication ───────────────────────────

describe('TC-RV-05: DOD-5 — migration guide published (docs/migration-v2.md)', () => {
  it('passes when docs/migration-v2.md exists', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'DOD-5')!;
    expect(check.passed).toBe(true);
  });

  it('fails when docs/migration-v2.md is missing', () => {
    const files = releaseReadyFiles();
    delete files[path('docs/migration-v2.md')];
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'DOD-5')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('docs/migration-v2.md');
  });
});

// ─── TC-RV-06: DOD-6 — spec alignment audit completion ───────────────────────

describe('TC-RV-06: DOD-6 — spec alignment audit completed', () => {
  it('passes when docs/spec-alignment-audit.md exists', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'DOD-6')!;
    expect(check.passed).toBe(true);
  });

  it('passes when docs/contributing.md mentions spec alignment audit', () => {
    const files = releaseReadyFiles();
    delete files[path('docs/spec-alignment-audit.md')];
    files[path('docs/contributing.md')] = `# Contributing\n\nspec alignment audit completed on 2026-04-22.\n`;
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'DOD-6')!;
    expect(check.passed).toBe(true);
  });

  it('fails when neither audit file exists nor contributing.md mentions it', () => {
    const files = releaseReadyFiles();
    delete files[path('docs/spec-alignment-audit.md')];
    files[path('docs/contributing.md')] = `# Contributing\n\nNo spec audit references here.\n`;
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'DOD-6')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('Spec alignment audit not found');
  });
});

// ─── TC-RV-07: DOD-7 — security review document existence ────────────────────

describe('TC-RV-07: DOD-7 — security review document exists', () => {
  it('passes when docs/security-review-v2.md exists', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'DOD-7')!;
    expect(check.passed).toBe(true);
  });

  it('fails when docs/security-review-v2.md is missing', () => {
    const files = releaseReadyFiles();
    delete files[path('docs/security-review-v2.md')];
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'DOD-7')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('docs/security-review-v2.md');
  });
});

// ─── TC-RV-08: DOD-8 — no blocking items in [Unreleased] ────────────────────

describe('TC-RV-08: DOD-8 — no blocking items in CHANGELOG [Unreleased] section', () => {
  it('passes when [Unreleased] section has no blocking annotations', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'DOD-8')!;
    expect(check.passed).toBe(true);
  });

  it('passes when CHANGELOG has no [Unreleased] section', () => {
    const files = releaseReadyFiles();
    files[path('CHANGELOG.md')] = `# Changelog\n\n## [2.0.0] — 2026-05-01\n\n- Release.\n`;
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'DOD-8')!;
    expect(check.passed).toBe(true);
  });

  it('fails when [Unreleased] contains [BLOCKING] annotation', () => {
    const files = releaseReadyFiles();
    files[path('CHANGELOG.md')] = `# Changelog\n\n## [Unreleased]\n\n[BLOCKING] Fix auth bypass before shipping.\n\n## [2.0.0]\n\n- Release.\n`;
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'DOD-8')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('blocking items');
  });

  it('fails when [Unreleased] contains [RELEASE BLOCKER] annotation', () => {
    const files = releaseReadyFiles();
    files[path('CHANGELOG.md')] = `# Changelog\n\n## [Unreleased]\n\n[RELEASE BLOCKER] Must resolve before v2.\n\n## [2.0.0]\n\n- Release.\n`;
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'DOD-8')!;
    expect(check.passed).toBe(false);
  });

  it('does not flag [BLOCKING] annotations in released version sections', () => {
    const files = releaseReadyFiles();
    files[path('CHANGELOG.md')] = `# Changelog\n\n## [Unreleased]\n\nNo issues.\n\n## [2.0.0]\n\n[BLOCKING] This was resolved.\n`;
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'DOD-8')!;
    expect(check.passed).toBe(true);
  });
});

// ─── TC-RV-09: V-01 — TypeScript strict mode ─────────────────────────────────

describe('TC-RV-09: V-01 — TypeScript strict mode enabled', () => {
  it('passes when tsconfig.json has compilerOptions.strict: true', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-01')!;
    expect(check.passed).toBe(true);
  });

  it('fails when tsconfig.json is missing', () => {
    const files = releaseReadyFiles();
    delete files[path('tsconfig.json')];
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-01')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('tsconfig.json not found');
  });

  it('fails when strict is false', () => {
    const files = releaseReadyFiles();
    files[path('tsconfig.json')] = JSON.stringify({ compilerOptions: { strict: false } });
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-01')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('strict');
  });

  it('fails when compilerOptions is absent', () => {
    const files = releaseReadyFiles();
    files[path('tsconfig.json')] = JSON.stringify({ extends: './tsconfig.base.json' });
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-01')!;
    expect(check.passed).toBe(false);
  });

  it('fails when tsconfig.json is invalid JSON', () => {
    const files = releaseReadyFiles();
    files[path('tsconfig.json')] = '{ "compilerOptions": { strict: true } }';
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-01')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('not valid JSON');
  });
});

// ─── TC-RV-10: V-02 — no runtime child_process ───────────────────────────────

describe('TC-RV-10: V-02 — no runtime child_process import in src/index.ts', () => {
  it('passes when src/index.ts has no child_process import', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-02')!;
    expect(check.passed).toBe(true);
  });

  it('fails when src/index.ts imports child_process', () => {
    const files = releaseReadyFiles();
    files[path('src/index.ts')] = `import { execSync } from 'node:child_process';\nexport function activate() {}\n`;
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-02')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('child_process');
  });

  it('fails when src/index.ts references execSync directly', () => {
    const files = releaseReadyFiles();
    files[path('src/index.ts')] = `// Uses execSync for version\nconst v = execSync('git rev-parse HEAD');\n`;
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-02')!;
    expect(check.passed).toBe(false);
  });

  it('fails when src/index.ts is missing', () => {
    const files = releaseReadyFiles();
    delete files[path('src/index.ts')];
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-02')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('src/index.ts not found');
  });
});

// ─── TC-RV-11: V-03 — vitest thresholds block ────────────────────────────────

describe('TC-RV-11: V-03 — vitest.config.ts declares a thresholds block', () => {
  it('passes when thresholds is present', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-03')!;
    expect(check.passed).toBe(true);
  });

  it('fails when thresholds is absent', () => {
    const files = releaseReadyFiles();
    files[path('vitest.config.ts')] = `export default {};`;
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-03')!;
    expect(check.passed).toBe(false);
  });
});

// ─── TC-RV-12: V-04 — src/enforcement/** coverage threshold ──────────────────

describe('TC-RV-12: V-04 — src/enforcement/** coverage threshold >= 95% lines', () => {
  it('passes when enforcement threshold is 95', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-04')!;
    expect(check.passed).toBe(true);
  });

  it('fails when enforcement threshold is below 95', () => {
    const files = releaseReadyFiles();
    files[path('vitest.config.ts')] = `
export default { test: { coverage: { thresholds: { 'src/enforcement/**': { lines: 80 }, 'src/hitl/**': { lines: 88 }, 'src/policy/**': { lines: 90 }, 'src/adapter/**': { lines: 85 } } } } };
`;
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-04')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('80');
    expect(check.reason).toContain('95');
  });

  it('fails when enforcement threshold is absent from config', () => {
    const files = releaseReadyFiles();
    files[path('vitest.config.ts')] = `export default { test: { coverage: { thresholds: {} } } };`;
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-04')!;
    expect(check.passed).toBe(false);
  });
});

// ─── TC-RV-13: V-05 — src/hitl/** coverage threshold ────────────────────────

describe('TC-RV-13: V-05 — src/hitl/** coverage threshold >= 88% lines', () => {
  it('passes when hitl threshold is 88', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-05')!;
    expect(check.passed).toBe(true);
  });

  it('fails when hitl threshold is below 88', () => {
    const files = releaseReadyFiles();
    files[path('vitest.config.ts')] = `
export default { test: { coverage: { thresholds: { 'src/enforcement/**': { lines: 95 }, 'src/hitl/**': { lines: 70 }, 'src/policy/**': { lines: 90 }, 'src/adapter/**': { lines: 85 } } } } };
`;
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-05')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('88');
  });
});

// ─── TC-RV-14: V-06 — src/policy/** coverage threshold ──────────────────────

describe('TC-RV-14: V-06 — src/policy/** coverage threshold >= 90% lines', () => {
  it('passes when policy threshold is 90', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-06')!;
    expect(check.passed).toBe(true);
  });

  it('fails when policy threshold is 85 (below 90)', () => {
    const files = releaseReadyFiles();
    files[path('vitest.config.ts')] = `
export default { test: { coverage: { thresholds: { 'src/enforcement/**': { lines: 95 }, 'src/hitl/**': { lines: 88 }, 'src/policy/**': { lines: 85 }, 'src/adapter/**': { lines: 85 } } } } };
`;
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-06')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('90');
  });
});

// ─── TC-RV-15: V-07 — src/adapter/** coverage threshold ─────────────────────

describe('TC-RV-15: V-07 — src/adapter/** coverage threshold >= 85% lines', () => {
  it('passes when adapter threshold is 85', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-07')!;
    expect(check.passed).toBe(true);
  });

  it('fails when adapter threshold is 70 (below 85)', () => {
    const files = releaseReadyFiles();
    files[path('vitest.config.ts')] = `
export default { test: { coverage: { thresholds: { 'src/enforcement/**': { lines: 95 }, 'src/hitl/**': { lines: 88 }, 'src/policy/**': { lines: 90 }, 'src/adapter/**': { lines: 70 } } } } };
`;
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-07')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('85');
  });
});

// ─── TC-RV-16: V-08 — E2E config omits thresholds ───────────────────────────

describe('TC-RV-16: V-08 — E2E config omits threshold gates', () => {
  it('passes when vitest.e2e.config.ts has no thresholds', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-08')!;
    expect(check.passed).toBe(true);
  });

  it('fails when vitest.e2e.config.ts contains thresholds', () => {
    const files = releaseReadyFiles();
    files[path('vitest.e2e.config.ts')] = `export default { test: { coverage: { thresholds: { lines: 80 } } } };`;
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-08')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('informational only');
  });

  it('fails when vitest.e2e.config.ts is missing', () => {
    const files = releaseReadyFiles();
    delete files[path('vitest.e2e.config.ts')];
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-08')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('vitest.e2e.config.ts not found');
  });
});

// ─── TC-RV-17: V-09 — security review document existence (V-series) ──────────

describe('TC-RV-17: V-09 — security review document exists (V-series check)', () => {
  it('passes when docs/security-review-v2.md exists', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-09')!;
    expect(check.passed).toBe(true);
  });

  it('fails when docs/security-review-v2.md is missing', () => {
    const files = releaseReadyFiles();
    delete files[path('docs/security-review-v2.md')];
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-09')!;
    expect(check.passed).toBe(false);
  });
});

// ─── TC-RV-18: V-10 — no open critical security findings ─────────────────────

describe('TC-RV-18: V-10 — no open critical security findings', () => {
  it('passes when no critical findings are open', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-10')!;
    expect(check.passed).toBe(true);
  });

  it('fails when a Critical + Open row exists in the findings table', () => {
    const files = releaseReadyFiles();
    files[path('docs/security-review-v2.md')] = `# Security Review v2

| Finding | Area | Severity | Status |
|---|---|---|---|
| F-01 | Enforcement gate | Critical | Open |
| F-02 | In-memory token | Medium | Addressed |
`;
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-10')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('open critical security finding');
  });

  it('passes when Critical finding is Addressed (not Open)', () => {
    const files = releaseReadyFiles();
    files[path('docs/security-review-v2.md')] = `# Security Review v2

| Finding | Area | Severity | Status |
|---|---|---|---|
| F-01 | Enforcement gate | Critical | Addressed |
`;
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-10')!;
    expect(check.passed).toBe(true);
  });

  it('does not flag Medium + Open findings', () => {
    const files = releaseReadyFiles();
    files[path('docs/security-review-v2.md')] = `# Security Review v2

| Finding | Area | Severity | Status |
|---|---|---|---|
| F-01 | Enforcement gate | Medium | Open |
`;
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-10')!;
    expect(check.passed).toBe(true);
  });

  it('fails when docs/security-review-v2.md is missing', () => {
    const files = releaseReadyFiles();
    delete files[path('docs/security-review-v2.md')];
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-10')!;
    expect(check.passed).toBe(false);
  });
});

// ─── TC-RV-19: V-11 — CHANGELOG Keep a Changelog format ─────────────────────

describe('TC-RV-19: V-11 — CHANGELOG follows Keep a Changelog format', () => {
  it('passes when CHANGELOG references Keep a Changelog and Semantic Versioning', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-11')!;
    expect(check.passed).toBe(true);
  });

  it('fails when CHANGELOG is missing Keep a Changelog reference', () => {
    const files = releaseReadyFiles();
    files[path('CHANGELOG.md')] = `# Changelog\n\nThis project adheres to Semantic Versioning.\n\n## [2.0.0]\n`;
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-11')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('Keep a Changelog');
  });

  it('fails when CHANGELOG is missing Semantic Versioning reference', () => {
    const files = releaseReadyFiles();
    files[path('CHANGELOG.md')] = `# Changelog\n\nBased on Keep a Changelog.\n\n## [2.0.0]\n`;
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-11')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('Semantic Versioning');
  });

  it('fails when CHANGELOG.md is missing', () => {
    const files = releaseReadyFiles();
    delete files[path('CHANGELOG.md')];
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-11')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('CHANGELOG.md not found');
  });
});

// ─── TC-RV-20: V-12 — package.json version match ─────────────────────────────

describe('TC-RV-20: V-12 — package.json version matches target release version', () => {
  it('passes when package.json version is the target version', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-12')!;
    expect(check.passed).toBe(true);
  });

  it('fails when package.json version differs from target', () => {
    const files = releaseReadyFiles();
    files[path('package.json')] = JSON.stringify({ name: 'clawthority', version: '1.1.4' });
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-12')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('1.1.4');
    expect(check.reason).toContain('2.0.0');
  });

  it('fails when package.json is missing', () => {
    const files = releaseReadyFiles();
    delete files[path('package.json')];
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-12')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('package.json not found');
  });

  it('fails when package.json is invalid JSON', () => {
    const files = releaseReadyFiles();
    files[path('package.json')] = '{ version: "2.0.0" }';
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const check = result.checks.find((c) => c.id === 'V-12')!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain('not valid JSON');
  });
});

// ─── TC-RV-21: Aggregated result — all checks pass ───────────────────────────

describe('TC-RV-21: aggregated result when project is fully release-ready', () => {
  it('returns valid:true', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    expect(result.valid).toBe(true);
  });

  it('returns an empty failures array', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    expect(result.failures).toHaveLength(0);
  });

  it('includes exactly 20 checks (DOD-1..DOD-8 + V-01..V-12)', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    expect(result.checks).toHaveLength(20);
  });

  it('exposes the target version in the result', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    expect(result.targetVersion).toBe(TARGET_VERSION);
  });

  it('all individual checks are passed', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    const failed = result.checks.filter((c) => !c.passed);
    expect(failed, `Unexpected failures: ${JSON.stringify(failed, null, 2)}`).toHaveLength(0);
  });
});

// ─── TC-RV-22: Aggregated result — failures array ────────────────────────────

describe('TC-RV-22: aggregated result failures array lists only failed checks', () => {
  it('returns valid:false when any check fails', () => {
    const files = releaseReadyFiles();
    delete files[path('docs/migration-v2.md')];
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    expect(result.valid).toBe(false);
  });

  it('failures array contains only the checks that did not pass', () => {
    const files = releaseReadyFiles();
    delete files[path('docs/migration-v2.md')];
    delete files[path('docs/security-review-v2.md')];
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    const failedIds = result.failures.map((f) => f.id);
    expect(failedIds).toContain('DOD-5');
    expect(failedIds).toContain('DOD-7');
    expect(failedIds).toContain('V-09');
    // All other checks should pass
    const passedIds = result.checks.filter((c) => c.passed).map((c) => c.id);
    for (const id of passedIds) {
      expect(failedIds).not.toContain(id);
    }
  });

  it('check IDs cover DOD-1 through DOD-8 and V-01 through V-12', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    const ids = result.checks.map((c) => c.id);
    for (let i = 1; i <= 8; i++) {
      expect(ids).toContain(`DOD-${i}`);
    }
    for (let i = 1; i <= 12; i++) {
      const padded = String(i).padStart(2, '0');
      expect(ids).toContain(`V-${padded}`);
    }
  });

  it('each check has a non-empty description', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    for (const check of result.checks) {
      expect(check.description.length, `${check.id} has empty description`).toBeGreaterThan(0);
    }
  });

  it('passed checks have no reason field', () => {
    setupFsSpies(releaseReadyFiles());
    const result = new ReleaseValidator().validate(ctx());
    for (const check of result.checks.filter((c) => c.passed)) {
      expect(check.reason, `${check.id} should not have a reason when passed`).toBeUndefined();
    }
  });

  it('failed checks have a non-empty reason field', () => {
    const files = releaseReadyFiles();
    delete files[path('docs/migration-v2.md')];
    setupFsSpies(files);
    const result = new ReleaseValidator().validate(ctx());
    for (const check of result.failures) {
      expect(
        typeof check.reason === 'string' && check.reason.length > 0,
        `${check.id} should have a non-empty reason`,
      ).toBe(true);
    }
  });
});
