/**
 * F-05 manifest for the move_file tool.
 *
 * Action class: filesystem.write
 * Moves a file from a source path to a destination path.
 * The source file is removed after a successful move.
 */

import type { ToolManifest } from '../../validation/skill-manifest-validator.js';

export const moveFileManifest: ToolManifest = {
  name: 'move_file',
  version: '1.0.0',
  action_class: 'filesystem.write',
  risk_tier: 'medium',
  default_hitl_mode: 'per_request',
  params: {
    type: 'object',
    properties: {
      from: {
        type: 'string',
        description: 'Path of the source file to move.',
      },
      to: {
        type: 'string',
        description: 'Path of the destination file.',
      },
    },
    required: ['from', 'to'],
    additionalProperties: false,
  },
  result: {
    type: 'object',
    properties: {
      from: {
        type: 'string',
        description: 'Absolute path of the source file (now removed).',
      },
      to: {
        type: 'string',
        description: 'Absolute path of the destination file.',
      },
    },
  },
};
