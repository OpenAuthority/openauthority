/**
 * F-05 manifest for the git_push tool.
 *
 * Action class: vcs.remote
 * Pushes commits from the current branch to a remote repository.
 */

import type { ToolManifest } from '../../validation/skill-manifest-validator.js';

export const gitPushManifest: ToolManifest = {
  name: 'git_push',
  version: '1.0.0',
  action_class: 'vcs.remote',
  risk_tier: 'medium',
  default_hitl_mode: 'per_request',
  target_field: 'remote',
  params: {
    type: 'object',
    properties: {
      remote: {
        type: 'string',
        minLength: 1,
        description: 'Name of the remote to push to (e.g. "origin"). Uses the configured tracking remote when omitted.',
      },
      branch: {
        type: 'string',
        minLength: 1,
        description: 'Local branch to push. Uses the currently checked-out branch when omitted.',
      },
    },
    required: [],
    additionalProperties: false,
  },
  result: {
    type: 'object',
    properties: {
      pushed: {
        type: 'boolean',
        description: 'Whether the push completed successfully.',
      },
      remote: {
        type: 'string',
        description: 'Remote that was pushed to.',
      },
      branch: {
        type: 'string',
        description: 'Branch that was pushed.',
      },
      message: {
        type: 'string',
        description: 'Human-readable status message from git push.',
      },
    },
  },
};
