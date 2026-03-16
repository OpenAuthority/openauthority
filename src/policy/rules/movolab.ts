import type { Rule } from '../types.js';

/**
 * Rules that apply exclusively to movolab agents (agentId prefix: "movolab-").
 *
 * Every rule carries a condition that gates it to movolab-prefixed agents so
 * that all rules can be loaded into a single PolicyEngine instance without
 * granting cross-agent access.
 */
const movolabRules: Rule[] = [

  /**
   * Permit movolab agents to operate on the "movolab" channel.
   * Non-movolab agents must not access this channel.
   */
  {
    effect: 'permit',
    resource: 'channel',
    match: 'movolab',
    condition: (ctx) => ctx.agentId.startsWith('movolab-'),
    reason: 'Movolab channel is restricted to movolab agents',
    tags: ['channel', 'movolab'],
  },

  /**
   * Permit movolab agents to write files when operating on their own channel.
   * This scoped write permission avoids opening file writes to all channels.
   */
  {
    effect: 'permit',
    resource: 'tool',
    match: 'write_file',
    condition: (ctx) => ctx.agentId.startsWith('movolab-') && ctx.channel === 'movolab',
    reason: 'Movolab agents may write files on the movolab channel',
    tags: ['tool', 'movolab'],
  },

];

export default movolabRules;
