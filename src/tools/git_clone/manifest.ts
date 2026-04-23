/**
 * F-05 manifest for the git_clone tool.
 *
 * Action class: vcs.remote
 * Clones a remote git repository to a specified local path.
 */

import type { ToolManifest } from '../../validation/skill-manifest-validator.js';

export const gitCloneManifest: ToolManifest = {
  name: 'git_clone',
  version: '1.0.0',
  action_class: 'vcs.remote',
  risk_tier: 'medium',
  default_hitl_mode: 'per_request',
  target_field: 'url',
  params: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        minLength: 1,
        description: 'URL of the remote repository to clone (https://, git@, ssh://, git://, or file://).',
      },
      path: {
        type: 'string',
        minLength: 1,
        description: 'Local filesystem path where the repository will be cloned. Must not already exist.',
      },
    },
    required: ['url', 'path'],
    additionalProperties: false,
  },
  result: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The remote URL that was cloned.',
      },
      path: {
        type: 'string',
        description: 'The local path where the repository was cloned.',
      },
      message: {
        type: 'string',
        description: 'Human-readable status message.',
      },
    },
  },
};
