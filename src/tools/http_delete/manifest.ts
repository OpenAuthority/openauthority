/**
 * F-05 manifest for the http_delete tool.
 *
 * Action class: unknown_sensitive_action  (intentional fail-closed)
 *
 * HTTP DELETE is not a first-class action class in the @openclaw/action-registry
 * taxonomy. The alias 'http_delete' is deliberately absent from all alias lists
 * so that it normalises to unknown_sensitive_action (risk: critical,
 * hitl_mode: per_request). This ensures any tool claiming to perform HTTP DELETE
 * is treated with maximum caution unless an explicit policy rule permits it.
 *
 * Manifests using unknown_sensitive_action must set risk_tier: 'critical' and
 * default_hitl_mode: 'per_request' to align with the registry defaults.
 */

import type { ToolManifest } from '../../validation/skill-manifest-validator.js';

export const httpDeleteManifest: ToolManifest = {
  name: 'http_delete',
  version: '1.0.0',
  action_class: 'unknown_sensitive_action',
  risk_tier: 'critical',
  default_hitl_mode: 'per_request',
  target_field: 'url',
  params: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL of the resource to delete.',
      },
      headers: {
        type: 'object',
        description: 'Optional HTTP request headers as key-value pairs.',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['url'],
    additionalProperties: false,
  },
  result: {
    type: 'object',
    properties: {
      status_code: {
        type: 'number',
        description: 'HTTP response status code.',
      },
      body: {
        type: 'string',
        description: 'Response body as a UTF-8 string.',
      },
    },
  },
};
