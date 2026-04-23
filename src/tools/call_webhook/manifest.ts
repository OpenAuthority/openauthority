/**
 * F-05 manifest for the call_webhook tool.
 *
 * Action class: communication.webhook
 * Sends an HTTP POST request to a webhook URL, delivering a JSON payload
 * to an external service. Used to trigger automations, notifications, or
 * integrations with third-party platforms.
 */

import type { ToolManifest } from '../../validation/skill-manifest-validator.js';

export const callWebhookManifest: ToolManifest = {
  name: 'call_webhook',
  version: '1.0.0',
  action_class: 'communication.webhook',
  risk_tier: 'medium',
  default_hitl_mode: 'per_request',
  target_field: 'url',
  params: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'Webhook endpoint URL to POST the payload to.',
      },
      payload: {
        type: 'object',
        description: 'JSON payload to include in the webhook request body.',
        additionalProperties: true,
      },
      headers: {
        type: 'object',
        description: 'Optional HTTP headers to include in the webhook request.',
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
        description: 'HTTP response status code from the webhook endpoint.',
      },
      response_body: {
        type: 'string',
        description: 'Response body returned by the webhook endpoint.',
      },
    },
  },
};
