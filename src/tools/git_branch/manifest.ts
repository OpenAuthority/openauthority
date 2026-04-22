/**
 * F-05 manifest for the git_branch tool.
 *
 * Action class: vcs.write
 * Creates a new branch in a git repository with an optional starting point.
 */

import type { ToolManifest } from '../../validation/skill-manifest-validator.js';

export const gitBranchManifest: ToolManifest = {
  name: 'git_branch',
  version: '1.0.0',
  action_class: 'vcs.write',
  risk_tier: 'medium',
  default_hitl_mode: 'per_request',
  target_field: 'name',
  params: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        minLength: 1,
        description: 'Name of the new branch to create.',
      },
      from: {
        type: 'string',
        minLength: 1,
        description: 'Optional starting point (branch name, tag, or commit hash). Defaults to HEAD.',
      },
    },
    required: ['name'],
    additionalProperties: false,
  },
  result: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'The name of the branch that was created.',
      },
      message: {
        type: 'string',
        description: 'Human-readable status message.',
      },
    },
  },
};
