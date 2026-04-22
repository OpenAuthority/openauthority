/**
 * F-05 manifest for the archive_extract tool.
 *
 * Action class: archive.extract
 * Extracts the contents of an archive to a destination directory.
 * Higher risk than archive.read — extraction writes files to the filesystem.
 */

import type { ToolManifest } from '../../validation/skill-manifest-validator.js';

export const archiveExtractManifest: ToolManifest = {
  name: 'archive_extract',
  version: '1.0.0',
  action_class: 'archive.extract',
  risk_tier: 'medium',
  default_hitl_mode: 'per_request',
  target_field: 'destination',
  params: {
    type: 'object',
    properties: {
      archive_path: {
        type: 'string',
        description: 'Path to the archive file to extract.',
      },
      destination: {
        type: 'string',
        description: 'Directory to extract the archive contents into.',
      },
    },
    required: ['archive_path', 'destination'],
    additionalProperties: false,
  },
  result: {
    type: 'object',
    properties: {
      destination: {
        type: 'string',
        description: 'Absolute path to the directory where files were extracted.',
      },
      extracted_count: {
        type: 'number',
        description: 'Number of entries extracted from the archive.',
      },
    },
  },
};
