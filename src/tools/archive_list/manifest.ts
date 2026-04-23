/**
 * F-05 manifest for the archive_list tool.
 *
 * Action class: archive.read
 * Lists the contents of an archive without extracting any files.
 */

import type { ToolManifest } from '../../validation/skill-manifest-validator.js';

export const archiveListManifest: ToolManifest = {
  name: 'archive_list',
  version: '1.0.0',
  action_class: 'archive.read',
  risk_tier: 'low',
  default_hitl_mode: 'none',
  target_field: 'archive_path',
  params: {
    type: 'object',
    properties: {
      archive_path: {
        type: 'string',
        description: 'Path to the archive file whose contents should be listed.',
      },
    },
    required: ['archive_path'],
    additionalProperties: false,
  },
  result: {
    type: 'object',
    properties: {
      archive_path: {
        type: 'string',
        description: 'Absolute path to the archive file.',
      },
      entries: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of file and directory paths contained in the archive.',
      },
    },
  },
};
