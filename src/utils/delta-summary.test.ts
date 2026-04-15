/**
 * generateDeltaSummary — test suite
 *
 * Covers all rendering paths in delta-summary.ts:
 *   generateDeltaSummary — produces a consistently-formatted Markdown report
 */
import { describe, it, expect } from 'vitest';
import { generateDeltaSummary } from './delta-summary.js';
import type { DeltaSummaryInput, ResidualRisk } from './delta-summary.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeInput(overrides?: Partial<DeltaSummaryInput>): DeltaSummaryInput {
  return {
    filesChanged: ['src/foo.ts', 'src/bar.ts'],
    testsAdded: ['src/foo.test.ts'],
    residualRisk: { level: 'low', notes: ['manually verified edge cases'] },
    followUps: ['Update CHANGELOG', 'Review error handling'],
    ...overrides,
  };
}

const NO_RISK: ResidualRisk = { level: 'none', notes: [] };

// ─── generateDeltaSummary ─────────────────────────────────────────────────────

describe('generateDeltaSummary', () => {
  // ── header ───────────────────────────────────────────────────────────────

  it('uses "## Delta Summary" heading when no title is provided', () => {
    const result = generateDeltaSummary(makeInput());
    expect(result).toContain('## Delta Summary\n');
  });

  it('does not include a colon when no title is provided', () => {
    const result = generateDeltaSummary(makeInput());
    expect(result.startsWith('## Delta Summary\n')).toBe(true);
  });

  it('uses "## Delta Summary: {title}" when title is provided', () => {
    const result = generateDeltaSummary(makeInput({ title: 'Add PII classifier' }));
    expect(result).toContain('## Delta Summary: Add PII classifier');
  });

  // ── files changed ─────────────────────────────────────────────────────────

  it('includes "### Files Changed" section heading', () => {
    const result = generateDeltaSummary(makeInput());
    expect(result).toContain('### Files Changed');
  });

  it('lists each changed file as a bullet', () => {
    const result = generateDeltaSummary(
      makeInput({ filesChanged: ['src/a.ts', 'src/b.ts', 'src/c.ts'] }),
    );
    expect(result).toContain('- src/a.ts');
    expect(result).toContain('- src/b.ts');
    expect(result).toContain('- src/c.ts');
  });

  it('shows "(no files changed)" when filesChanged is empty', () => {
    const result = generateDeltaSummary(makeInput({ filesChanged: [] }));
    expect(result).toContain('(no files changed)');
  });

  it('does not show "(no files changed)" when files are present', () => {
    const result = generateDeltaSummary(makeInput({ filesChanged: ['src/x.ts'] }));
    expect(result).not.toContain('(no files changed)');
  });

  // ── tests added ───────────────────────────────────────────────────────────

  it('includes "### Tests Added" section heading', () => {
    const result = generateDeltaSummary(makeInput());
    expect(result).toContain('### Tests Added');
  });

  it('lists each added test as a bullet', () => {
    const result = generateDeltaSummary(
      makeInput({ testsAdded: ['src/foo.test.ts', 'src/bar.test.ts'] }),
    );
    expect(result).toContain('- src/foo.test.ts');
    expect(result).toContain('- src/bar.test.ts');
  });

  it('shows "(no tests added)" when testsAdded is empty', () => {
    const result = generateDeltaSummary(makeInput({ testsAdded: [] }));
    expect(result).toContain('(no tests added)');
  });

  it('does not show "(no tests added)" when tests are present', () => {
    const result = generateDeltaSummary(makeInput({ testsAdded: ['src/x.test.ts'] }));
    expect(result).not.toContain('(no tests added)');
  });

  // ── residual risk ─────────────────────────────────────────────────────────

  it('includes "### Residual Risk" section heading', () => {
    const result = generateDeltaSummary(makeInput());
    expect(result).toContain('### Residual Risk');
  });

  it('renders the risk level in bold', () => {
    const result = generateDeltaSummary(makeInput({ residualRisk: { level: 'high', notes: [] } }));
    expect(result).toContain('**Level:** high');
  });

  it('renders risk level "none" correctly', () => {
    const result = generateDeltaSummary(makeInput({ residualRisk: NO_RISK }));
    expect(result).toContain('**Level:** none');
  });

  it('renders risk level "medium" correctly', () => {
    const result = generateDeltaSummary(
      makeInput({ residualRisk: { level: 'medium', notes: [] } }),
    );
    expect(result).toContain('**Level:** medium');
  });

  it('lists risk notes as bullets when present', () => {
    const result = generateDeltaSummary(
      makeInput({
        residualRisk: { level: 'low', notes: ['edge case A not covered', 'no rollback plan'] },
      }),
    );
    expect(result).toContain('- edge case A not covered');
    expect(result).toContain('- no rollback plan');
  });

  it('does not emit an extra blank line or bullet list when notes is empty', () => {
    const result = generateDeltaSummary(makeInput({ residualRisk: NO_RISK }));
    // The residual risk section body should be exactly "**Level:** none"
    const section = result.split('### Residual Risk\n')[1].split('\n\n')[0];
    expect(section).toBe('**Level:** none');
  });

  // ── follow-ups ────────────────────────────────────────────────────────────

  it('includes "### Follow-ups" section heading', () => {
    const result = generateDeltaSummary(makeInput());
    expect(result).toContain('### Follow-ups');
  });

  it('renders follow-up items as markdown checkboxes', () => {
    const result = generateDeltaSummary(
      makeInput({ followUps: ['Update CHANGELOG', 'Add integration test'] }),
    );
    expect(result).toContain('- [ ] Update CHANGELOG');
    expect(result).toContain('- [ ] Add integration test');
  });

  it('shows "(none)" when followUps is empty', () => {
    const result = generateDeltaSummary(makeInput({ followUps: [] }));
    expect(result).toContain('(none)');
  });

  it('does not show "(none)" when follow-ups are present', () => {
    const result = generateDeltaSummary(makeInput({ followUps: ['Do something'] }));
    expect(result).not.toContain('(none)');
  });

  // ── section order and separators ──────────────────────────────────────────

  it('separates sections with blank lines', () => {
    const result = generateDeltaSummary(makeInput());
    expect(result).toContain('\n\n###');
  });

  it('places sections in order: header → files → tests → risk → follow-ups', () => {
    const result = generateDeltaSummary(makeInput({ title: 'My change' }));
    const headerIdx = result.indexOf('## Delta Summary: My change');
    const filesIdx = result.indexOf('### Files Changed');
    const testsIdx = result.indexOf('### Tests Added');
    const riskIdx = result.indexOf('### Residual Risk');
    const followUpsIdx = result.indexOf('### Follow-ups');

    expect(headerIdx).toBeLessThan(filesIdx);
    expect(filesIdx).toBeLessThan(testsIdx);
    expect(testsIdx).toBeLessThan(riskIdx);
    expect(riskIdx).toBeLessThan(followUpsIdx);
  });

  // ── full output snapshot ──────────────────────────────────────────────────

  it('produces the expected full report for a typical input', () => {
    const input: DeltaSummaryInput = {
      title: 'Add PII classifier',
      filesChanged: ['src/enforcement/pii-classifier.ts'],
      testsAdded: ['src/enforcement/pii-classifier.test.ts'],
      residualRisk: { level: 'low', notes: ['IBAN regex coverage limited to SEPA countries'] },
      followUps: ['Add BBAN format support'],
    };

    const result = generateDeltaSummary(input);

    expect(result).toBe(
      [
        '## Delta Summary: Add PII classifier',
        '',
        '### Files Changed',
        '- src/enforcement/pii-classifier.ts',
        '',
        '### Tests Added',
        '- src/enforcement/pii-classifier.test.ts',
        '',
        '### Residual Risk',
        '**Level:** low',
        '',
        '- IBAN regex coverage limited to SEPA countries',
        '',
        '### Follow-ups',
        '- [ ] Add BBAN format support',
      ].join('\n'),
    );
  });

  it('produces the expected full report for an empty/minimal input', () => {
    const input: DeltaSummaryInput = {
      filesChanged: [],
      testsAdded: [],
      residualRisk: { level: 'none', notes: [] },
      followUps: [],
    };

    const result = generateDeltaSummary(input);

    expect(result).toBe(
      [
        '## Delta Summary',
        '',
        '### Files Changed',
        '(no files changed)',
        '',
        '### Tests Added',
        '(no tests added)',
        '',
        '### Residual Risk',
        '**Level:** none',
        '',
        '### Follow-ups',
        '(none)',
      ].join('\n'),
    );
  });
});
