/**
 * F-05 manifest for the archive_create tool.
 *
 * Action class: archive.create
 * Creates a compressed archive from one or more source paths.
 */

import type { ToolManifest } from '../../validation/skill-manifest-validator.js';

export const archiveCreateManifest: ToolManifest = {
  name: 'archive_create',
  version: '1.0.0',
  action_class: 'archive.create',
  risk_tier: 'medium',
  default_hitl_mode: 'per_request',
  target_field: 'output_path',
  params: {
    type: 'object',
    properties: {
      output_path: {
        type: 'string',
        description: 'Destination path for the archive file to create (e.g. /tmp/backup.tar.gz).',
      },
      sources: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of file or directory paths to include in the archive.',
      },
    },
    required: ['output_path', 'sources'],
    additionalProperties: false,
  },
  result: {
    type: 'object',
    properties: {
      output_path: {
        type: 'string',
        description: 'Absolute path to the created archive.',
      },
      size_bytes: {
        type: 'number',
        description: 'Size of the created archive in bytes.',
      },
    },
  },
};
