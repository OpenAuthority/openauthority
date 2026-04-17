/**
 * Roadmap update validator.
 *
 * Provides a pure function `validateRoadmapUpdate` that checks whether
 * docs/roadmap.md contains an expected update for a given section and task.
 * Intended for use in Definition of Done checklists.
 */

import * as nodeFs from 'node:fs';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Result of a roadmap update validation check. */
export interface RoadmapValidationResult {
  /** Whether the expected update was found in roadmap.md. */
  valid: boolean;
  /** Error messages describing what is missing or why validation failed. */
  errors: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default path to the roadmap file, relative to the project root. */
const DEFAULT_ROADMAP_PATH = 'docs/roadmap.md';

// ─── Validator ────────────────────────────────────────────────────────────────

/**
 * Validates that docs/roadmap.md contains an expected update for a given
 * section and task description.
 *
 * Reads the roadmap file from the given path (defaults to docs/roadmap.md),
 * locates the named section heading, and checks whether the task description
 * string appears within that section's content.
 *
 * @param sectionName     The roadmap section to search (e.g. "Shipped", "Next Up").
 * @param taskDescription A string expected to appear within that section.
 * @param roadmapPath     Optional override for the roadmap file path.
 * @returns               A result with `valid` flag and any `errors`.
 */
export function validateRoadmapUpdate(
  sectionName: string,
  taskDescription: string,
  roadmapPath: string = DEFAULT_ROADMAP_PATH,
): RoadmapValidationResult {
  let content: string;
  try {
    content = nodeFs.readFileSync(roadmapPath, 'utf-8');
  } catch {
    return {
      valid: false,
      errors: [`roadmap.md not found at: ${roadmapPath}`],
    };
  }

  return checkContent(content, sectionName, taskDescription);
}

// ─── Content checker ──────────────────────────────────────────────────────────

function checkContent(
  content: string,
  sectionName: string,
  taskDescription: string,
): RoadmapValidationResult {
  const headingPattern = new RegExp(`^(#{1,6})\\s+${escapeRegExp(sectionName)}\\s*$`, 'm');
  const headingMatch = headingPattern.exec(content);

  if (!headingMatch) {
    return {
      valid: false,
      errors: [`Section "${sectionName}" not found in roadmap.md`],
    };
  }

  const headingLevel = headingMatch[1]!.length;
  const afterHeading = content.slice(headingMatch.index + headingMatch[0].length);
  const nextHeadingPattern = new RegExp(`^#{1,${headingLevel}}\\s`, 'm');
  const nextHeadingMatch = nextHeadingPattern.exec(afterHeading);
  const sectionContent = nextHeadingMatch
    ? afterHeading.slice(0, nextHeadingMatch.index)
    : afterHeading;

  if (!sectionContent.includes(taskDescription)) {
    return {
      valid: false,
      errors: [
        `Task "${taskDescription}" not found in section "${sectionName}" of roadmap.md`,
      ],
    };
  }

  return { valid: true, errors: [] };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
