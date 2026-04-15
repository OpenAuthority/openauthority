/**
 * validateRoadmapUpdate — test suite
 *
 * Covers all code paths in roadmap-validator.ts:
 *   validateRoadmapUpdate — reads roadmap.md and validates section + task presence
 */

import { vi, describe, it, expect, afterEach } from 'vitest';

vi.mock('node:fs');

import { readFileSync } from 'node:fs';
import { validateRoadmapUpdate } from './roadmap-validator.js';
import type { RoadmapValidationResult } from './roadmap-validator.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function valid(): RoadmapValidationResult {
  return { valid: true, errors: [] };
}

function error(message: string): RoadmapValidationResult {
  return { valid: false, errors: [message] };
}

const SAMPLE_ROADMAP = `# Roadmap

## Shipped

### Cedar-Style Policy Engine
- Forbid-wins semantics

### ABAC Policy Engine
- TypeBox-validated structured policies

## In Progress

### Configurable Default Effect
The Cedar engine now accepts a defaultEffect constructor option.

## Next Up

### Structured Decision Object
Enrich the policy engine response.
`;

// ─── validateRoadmapUpdate ────────────────────────────────────────────────────

describe('validateRoadmapUpdate', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  // ── file not found ────────────────────────────────────────────────────────

  it('returns error when roadmap.md does not exist', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });
    const result = validateRoadmapUpdate('Shipped', 'some task');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('roadmap.md not found at:');
  });

  it('includes the path in the missing-file error', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const result = validateRoadmapUpdate('Shipped', 'some task', 'custom/roadmap.md');
    expect(result.errors[0]).toContain('custom/roadmap.md');
  });

  it('returns a single error for a missing file', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const result = validateRoadmapUpdate('Shipped', 'task');
    expect(result.errors).toHaveLength(1);
  });

  // ── section not found ─────────────────────────────────────────────────────

  it('returns error when section is not found in the file', () => {
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_ROADMAP as any);
    const result = validateRoadmapUpdate('Missing Section', 'anything');
    expect(result).toEqual(error('Section "Missing Section" not found in roadmap.md'));
  });

  it('is case-sensitive for section names', () => {
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_ROADMAP as any);
    const result = validateRoadmapUpdate('shipped', 'anything');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('shipped');
  });

  // ── task description not found ────────────────────────────────────────────

  it('returns error when task description is absent from the section', () => {
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_ROADMAP as any);
    const result = validateRoadmapUpdate('Shipped', 'nonexistent task');
    expect(result).toEqual(
      error('Task "nonexistent task" not found in section "Shipped" of roadmap.md'),
    );
  });

  it('does not match task description found in a sibling section', () => {
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_ROADMAP as any);
    // "Structured Decision Object" is in Next Up, not Shipped
    const result = validateRoadmapUpdate('Shipped', 'Structured Decision Object');
    expect(result.valid).toBe(false);
  });

  it('does not match task description found in a different top-level section', () => {
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_ROADMAP as any);
    // "Configurable Default Effect" is in In Progress, not Shipped
    const result = validateRoadmapUpdate('Shipped', 'Configurable Default Effect');
    expect(result.valid).toBe(false);
  });

  // ── task description found ────────────────────────────────────────────────

  it('returns valid when task description is found in the section', () => {
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_ROADMAP as any);
    const result = validateRoadmapUpdate('Shipped', 'Cedar-Style Policy Engine');
    expect(result).toEqual(valid());
  });

  it('finds task description inside a subsection (### level)', () => {
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_ROADMAP as any);
    const result = validateRoadmapUpdate('Cedar-Style Policy Engine', 'Forbid-wins semantics');
    expect(result).toEqual(valid());
  });

  it('finds task description in a mid-file section', () => {
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_ROADMAP as any);
    const result = validateRoadmapUpdate('In Progress', 'Configurable Default Effect');
    expect(result).toEqual(valid());
  });

  it('finds task description in the last section (no trailing heading)', () => {
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_ROADMAP as any);
    const result = validateRoadmapUpdate('Next Up', 'Structured Decision Object');
    expect(result).toEqual(valid());
  });

  it('returns an empty errors array on success', () => {
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_ROADMAP as any);
    const result = validateRoadmapUpdate('Shipped', 'ABAC Policy Engine');
    expect(result.errors).toHaveLength(0);
  });

  // ── file path handling ────────────────────────────────────────────────────

  it('defaults to docs/roadmap.md when no path is provided', () => {
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_ROADMAP as any);
    validateRoadmapUpdate('Shipped', 'Cedar-Style Policy Engine');
    expect(readFileSync).toHaveBeenCalledWith('docs/roadmap.md', 'utf-8');
  });

  it('uses the provided roadmapPath override', () => {
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_ROADMAP as any);
    validateRoadmapUpdate('Shipped', 'Cedar-Style Policy Engine', 'custom/path/roadmap.md');
    expect(readFileSync).toHaveBeenCalledWith('custom/path/roadmap.md', 'utf-8');
  });

  // ── regex special characters ──────────────────────────────────────────────

  it('handles regex special characters in sectionName', () => {
    const content = '## Section (with parens)\nsome task content\n## Next\n';
    vi.mocked(readFileSync).mockReturnValue(content as any);
    const result = validateRoadmapUpdate('Section (with parens)', 'some task content');
    expect(result).toEqual(valid());
  });

  it('handles regex special characters in taskDescription', () => {
    const content = '## Shipped\n- feat(utils): add helper\n';
    vi.mocked(readFileSync).mockReturnValue(content as any);
    const result = validateRoadmapUpdate('Shipped', 'feat(utils): add helper');
    expect(result).toEqual(valid());
  });

  // ── edge cases ────────────────────────────────────────────────────────────

  it('handles empty file content', () => {
    vi.mocked(readFileSync).mockReturnValue('' as any);
    const result = validateRoadmapUpdate('Shipped', 'anything');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Section "Shipped" not found');
  });

  it('handles content with no markdown headings', () => {
    vi.mocked(readFileSync).mockReturnValue('Just some plain text.\n' as any);
    const result = validateRoadmapUpdate('Shipped', 'plain text');
    expect(result.valid).toBe(false);
  });
});
