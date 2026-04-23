/**
 * F-05 manifest for the git_merge tool.
 *
 * Action class: vcs.write
 * Merges a specified branch into the current branch in a git repository.
 */

import type { ToolManifest } from '../../validation/skill-manifest-validator.js';

export const gitMergeManifest: ToolManifest = {
  name: 'git_merge',
  version: '1.0.0',
  action_class: 'vcs.write',
  risk_tier: 'medium',
  default_hitl_mode: 'per_request',
  target_field: 'branch',
  params: {
    type: 'object',
    properties: {
      branch: {
        type: 'string',
        minLength: 1,
        description: 'Name of the branch to merge into the current branch.',
      },
    },
    required: ['branch'],
    additionalProperties: false,
  },
  result: {
    type: 'object',
    properties: {
      merged: {
        type: 'boolean',
        description: 'Whether the merge completed without conflicts.',
      },
      message: {
        type: 'string',
        description: 'Human-readable status message from git merge.',
      },
    },
  },
};
