/**
 * F-05 manifest for the git_reset tool.
 *
 * Action class: vcs.write
 * Resets the current HEAD to a specified commit with a chosen reset mode.
 */

import type { ToolManifest } from '../../validation/skill-manifest-validator.js';

export const gitResetManifest: ToolManifest = {
  name: 'git_reset',
  version: '1.0.0',
  action_class: 'vcs.write',
  risk_tier: 'medium',
  default_hitl_mode: 'per_request',
  target_field: 'ref',
  params: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['soft', 'mixed', 'hard'],
        description:
          'Reset mode: soft (HEAD only), mixed (HEAD + index), or hard (HEAD + index + working tree).',
      },
      ref: {
        type: 'string',
        minLength: 1,
        description: 'Commit reference (branch name, tag, or commit hash) to reset to.',
      },
    },
    required: ['mode', 'ref'],
    additionalProperties: false,
  },
  result: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        description: 'The reset mode that was applied.',
      },
      ref: {
        type: 'string',
        description: 'The commit reference that was reset to.',
      },
      message: {
        type: 'string',
        description: 'Human-readable status message from git reset.',
      },
      warning: {
        type: 'string',
        description:
          'Present only for hard resets. Warns that uncommitted changes have been permanently discarded.',
      },
    },
  },
};
