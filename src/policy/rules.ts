/**
 * Re-exports the merged rule set and merging utility from the per-agent rules
 * directory.
 *
 * Import from this module for backwards-compatible access to the combined
 * default + agent-specific policy rules.  For direct access to individual
 * rule sets or the merge function, import from './rules/index.js'.
 */
export { default, mergeRules } from './rules/index.js';
