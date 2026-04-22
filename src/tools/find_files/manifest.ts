/**
 * F-05 manifest for the find_files tool.
 *
 * Action class: filesystem.read
 * Searches a directory tree recursively for files whose relative path
 * matches the supplied glob pattern, returning an array of absolute paths.
 */

import type { ToolManifest } from '../../validation/skill-manifest-validator.js';

export const findFilesManifest: ToolManifest = {
  name: 'find_files',
  version: '1.0.0',
  action_class: 'filesystem.read',
  risk_tier: 'low',
  default_hitl_mode: 'none',
  params: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description:
          'Glob pattern to match against file paths relative to the search root. ' +
          'Supports * (any chars except /), ** (any path depth), ? (single char), ' +
          'and {a,b} alternation. Example: "**/*.ts".',
      },
      path: {
        type: 'string',
        description:
          'Absolute path of the directory to search. Defaults to the current working directory.',
      },
    },
    required: ['pattern'],
    additionalProperties: false,
  },
  result: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of absolute file paths whose relative path matches the pattern.',
      },
    },
  },
};
