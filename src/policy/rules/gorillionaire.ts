import type { Rule } from '../types.js';

/**
 * Rules that apply exclusively to gorillionaire agents (agentId prefix: "gorillionaire-").
 *
 * Every rule carries a condition that gates it to gorillionaire-prefixed agents
 * so that all rules can be loaded into a single PolicyEngine instance without
 * granting cross-agent access.
 */
const gorillionaireRules: Rule[] = [

  /**
   * Permit gorillionaire agents to operate on the "gorillionaire" channel.
   * Non-gorillionaire agents must not access this channel.
   */
  {
    effect: 'permit',
    resource: 'channel',
    match: 'gorillionaire',
    condition: (ctx) => ctx.agentId.startsWith('gorillionaire-'),
    reason: 'Gorillionaire channel is restricted to gorillionaire agents',
    tags: ['channel', 'gorillionaire'],
  },

];

export default gorillionaireRules;
