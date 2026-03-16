import type { Rule } from '../types.js';

/**
 * Policy rules for support agents (agentId prefix: 'support-').
 *
 * Support agents handle customer-facing workflows such as ticket management
 * and query resolution. They are granted access to a dedicated 'support'
 * channel, may use write tools within that channel, and are restricted to
 * stable production-grade Claude model variants.
 *
 * These rules are merged over the baseline defaults; forbid rules in this
 * file win unconditionally per Cedar semantics.
 */
const supportRules: Rule[] = [

  // ─── Channel rules ────────────────────────────────────────────────────────

  /**
   * Permit support agents to operate on the dedicated 'support' channel.
   */
  {
    effect: 'permit',
    resource: 'channel',
    match: 'support',
    condition: (ctx) => ctx.agentId.startsWith('support-'),
    reason: 'Support channel is accessible to support agents',
    tags: ['channel', 'support'],
  },

  // ─── Tool rules ───────────────────────────────────────────────────────────

  /**
   * Permit write tools for support agents operating on the support channel.
   * Allows creation and editing of ticket summaries and case notes.
   */

  /**
   * Permit support agents to use read-only file tools on any channel.
   * This gives support agents consistent read access regardless of channel.
   */
  {
    effect: 'permit',
    resource: 'tool',
    match: /^(read_file|search_files|get_file_info)$/,
    condition: (ctx) => ctx.agentId.startsWith('support-'),
    reason: 'Support agents may use read-only file tools on any channel',
    tags: ['tool', 'support'],
  },

  /**
   * Permit write tools for support agents operating on the support channel.
   * Allows creation and editing of ticket summaries and case notes.
   */
  {
    effect: 'permit',
    resource: 'tool',
    match: /^(write_file|edit_file|create_file|patch_file)$/,
    condition: (ctx) =>
      ctx.agentId.startsWith('support-') && ctx.channel === 'support',
    reason: 'Support agents may use write tools on the support channel',
    tags: ['file', 'write', 'support'],
  },

  // ─── Model rules ──────────────────────────────────────────────────────────

  /**
   * Forbid preview and experimental model variants for support agents.
   * Customer-facing workflows require stable, predictable model behaviour.
   */
  {
    effect: 'forbid',
    resource: 'model',
    match: /-(preview|experimental|alpha|beta)(\b|-|$)/i,
    condition: (ctx) => ctx.agentId.startsWith('support-'),
    reason: 'Support agents are restricted to stable model variants',
    tags: ['model', 'support', 'security'],
  },

  // ─── Prompt rules ─────────────────────────────────────────────────────────

  /**
   * Permit support-scoped prompts for support agents.
   * Prompts prefixed with 'support:' are pre-approved for customer interactions.
   */
  {
    effect: 'permit',
    resource: 'prompt',
    match: /^support:/,
    condition: (ctx) => ctx.agentId.startsWith('support-'),
    reason: 'Support-scoped prompts are permitted for support agents',
    tags: ['prompt', 'support'],
  },
];

export default supportRules;
