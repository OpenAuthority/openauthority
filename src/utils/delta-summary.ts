/**
 * Delta summary report generator.
 *
 * Provides a pure function `generateDeltaSummary` that produces a
 * consistently-formatted Markdown report from structured change metadata.
 * Intended for use in Definition of Done checklists and PR descriptions.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Residual risk severity level. */
export type ResidualRiskLevel = 'none' | 'low' | 'medium' | 'high';

/** Residual risk assessment with optional explanatory notes. */
export interface ResidualRisk {
  /** Severity of remaining risk after the change. */
  level: ResidualRiskLevel;
  /** Explanatory notes describing the risk or mitigations. */
  notes: string[];
}

/** Input metadata for generating a delta summary report. */
export interface DeltaSummaryInput {
  /** Optional title for the report (e.g. commit or PR title). */
  title?: string;
  /** Source file paths modified by this change. */
  filesChanged: string[];
  /** Test names or file paths added by this change. */
  testsAdded: string[];
  /** Residual risk assessment for the change. */
  residualRisk: ResidualRisk;
  /** Follow-up action items to be addressed after this change. */
  followUps: string[];
}

// ─── Template helpers ─────────────────────────────────────────────────────────

function renderHeader(title: string | undefined): string {
  return title ? `## Delta Summary: ${title}` : '## Delta Summary';
}

function renderBulletList(items: string[], emptyMessage: string): string {
  if (items.length === 0) return emptyMessage;
  return items.map((item) => `- ${item}`).join('\n');
}

function renderCheckboxList(items: string[], emptyMessage: string): string {
  if (items.length === 0) return emptyMessage;
  return items.map((item) => `- [ ] ${item}`).join('\n');
}

function renderSection(heading: string, body: string): string {
  return `### ${heading}\n${body}`;
}

function renderResidualRisk(risk: ResidualRisk): string {
  const lines: string[] = [`**Level:** ${risk.level}`];
  if (risk.notes.length > 0) {
    lines.push('');
    for (const note of risk.notes) {
      lines.push(`- ${note}`);
    }
  }
  return lines.join('\n');
}

// ─── Generator ────────────────────────────────────────────────────────────────

/**
 * Generates a standardised delta summary report from change metadata.
 *
 * The report is formatted as Markdown and contains four sections:
 *   - Files Changed  — source files modified by the change
 *   - Tests Added    — tests added to cover the change
 *   - Residual Risk  — risk level and optional explanatory notes
 *   - Follow-ups     — checkbox action items to address after this change
 *
 * @param input  Structured change metadata.
 * @returns      A consistently-formatted Markdown string.
 */
export function generateDeltaSummary(input: DeltaSummaryInput): string {
  const sections = [
    renderHeader(input.title),
    renderSection('Files Changed', renderBulletList(input.filesChanged, '(no files changed)')),
    renderSection('Tests Added', renderBulletList(input.testsAdded, '(no tests added)')),
    renderSection('Residual Risk', renderResidualRisk(input.residualRisk)),
    renderSection('Follow-ups', renderCheckboxList(input.followUps, '(none)')),
  ];
  return sections.join('\n\n');
}
