import { describe, it, expect, beforeEach } from 'vitest';
import { AgentIdentityRegistry } from './identity.js';
import type { RuleContext } from './policy/types.js';
import { PolicyEngine } from './policy/engine.js';
import defaultRules from './policy/rules/default.js';
import supportRules from './policy/rules/support.js';

describe('AgentIdentityRegistry', () => {
  let registry: AgentIdentityRegistry;

  beforeEach(() => {
    registry = new AgentIdentityRegistry();
  });

  describe('verify', () => {
    it('returns verified:true when registry is empty (backwards compat)', () => {
      const result = registry.verify('any-agent', 'any-channel');
      expect(result.verified).toBe(true);
    });

    it('returns verified:false when agent is not registered', () => {
      registry.register({ agentId: 'admin-1', allowedChannels: ['admin', 'default'] });
      const result = registry.verify('unknown-agent', 'default');
      expect(result.verified).toBe(false);
    });

    it('returns verified:true when agent is registered and channel matches', () => {
      registry.register({ agentId: 'admin-1', allowedChannels: ['admin', 'default'] });
      const result = registry.verify('admin-1', 'admin');
      expect(result.verified).toBe(true);
      expect(result.registeredAgent).toBeDefined();
      expect(result.registeredAgent!.agentId).toBe('admin-1');
    });

    it('returns verified:false when agent is registered but channel is not allowed', () => {
      registry.register({ agentId: 'admin-1', allowedChannels: ['admin'] });
      const result = registry.verify('admin-1', 'default');
      expect(result.verified).toBe(false);
    });

    it('returns verified:false for spoofed agentId prefix', () => {
      registry.register({ agentId: 'admin-1', allowedChannels: ['admin', 'default'] });
      const result = registry.verify('admin-evil', 'admin');
      expect(result.verified).toBe(false);
    });

    it('returns verified:false for spoofed channelId', () => {
      registry.register({ agentId: 'agent-1', allowedChannels: ['default'] });
      const result = registry.verify('agent-1', 'admin');
      expect(result.verified).toBe(false);
    });
  });

  describe('buildRuleContext', () => {
    it('sets verified:true when identity is verified', () => {
      registry.register({ agentId: 'admin-1', allowedChannels: ['admin', 'default'] });
      const ctx = registry.buildRuleContext('admin-1', 'admin');
      expect(ctx.verified).toBe(true);
      expect(ctx.agentId).toBe('admin-1');
      expect(ctx.channel).toBe('admin');
    });

    it('sets verified:false when identity is not verified', () => {
      registry.register({ agentId: 'admin-1', allowedChannels: ['admin'] });
      const ctx = registry.buildRuleContext('admin-1', 'default');
      expect(ctx.verified).toBe(false);
    });

    it('sets verified:true when registry is empty', () => {
      const ctx = registry.buildRuleContext('any-agent', 'default');
      expect(ctx.verified).toBe(true);
    });

    it('passes through extras', () => {
      registry.register({ agentId: 'agent-1', allowedChannels: ['default'] });
      const ctx = registry.buildRuleContext('agent-1', 'default', {
        userId: 'user-123',
        sessionId: 'session-abc',
      });
      expect(ctx.verified).toBe(true);
      expect(ctx.userId).toBe('user-123');
      expect(ctx.sessionId).toBe('session-abc');
    });
  });

  describe('register/unregister', () => {
    it('registerMany adds multiple agents', () => {
      registry.registerMany([
        { agentId: 'admin-1', allowedChannels: ['admin'] },
        { agentId: 'support-1', allowedChannels: ['support', 'default'] },
      ]);
      expect(registry.size).toBe(2);
    });

    it('unregister removes an agent', () => {
      registry.register({ agentId: 'admin-1', allowedChannels: ['admin'] });
      expect(registry.unregister('admin-1')).toBe(true);
      expect(registry.size).toBe(0);
    });

    it('clear removes all agents', () => {
      registry.registerMany([
        { agentId: 'admin-1', allowedChannels: ['admin'] },
        { agentId: 'support-1', allowedChannels: ['support'] },
      ]);
      registry.clear();
      expect(registry.size).toBe(0);
    });
  });
});

describe('V-03: Agent ID Spoofing Prevention', () => {
  describe('spoofed admin agent cannot bypass delete_file forbid', () => {
    it('blocks delete_file when agentId starts with "admin-" but ctx.verified is false', () => {
      const engine = new PolicyEngine();
      engine.addRules(defaultRules);
      const spoofedCtx: RuleContext = { agentId: 'admin-evil', channel: 'default', verified: false };
      const result = engine.evaluate('tool', 'delete_file', spoofedCtx);
      expect(result.effect).toBe('forbid');
    });

    it('allows delete_file when agentId is verified admin', () => {
      const engine = new PolicyEngine();
      engine.addRules(defaultRules);
      const verifiedCtx: RuleContext = { agentId: 'admin-1', channel: 'default', verified: true };
      const result = engine.evaluate('tool', 'delete_file', verifiedCtx);
      expect(result.effect).toBe('permit');
    });
  });

  describe('spoofed agent cannot bypass channel-based write restrictions', () => {
    it('blocks write tools on "admin" channel when unverified', () => {
      const engine = new PolicyEngine();
      engine.addRules(defaultRules);
      const spoofedCtx: RuleContext = { agentId: 'agent-1', channel: 'admin', verified: false };
      const result = engine.evaluate('tool', 'write_file', spoofedCtx);
      expect(result.effect).toBe('forbid');
    });

    it('allows write tools on trusted channel when verified', () => {
      const engine = new PolicyEngine();
      engine.addRules(defaultRules);
      const verifiedCtx: RuleContext = { agentId: 'agent-1', channel: 'trusted', verified: true };
      const result = engine.evaluate('tool', 'write_file', verifiedCtx);
      expect(result.effect).toBe('permit');
    });
  });

  describe('spoofed agent cannot access admin channel', () => {
    it('blocks admin channel when agentId starts with "admin-" but unverified', () => {
      const engine = new PolicyEngine();
      engine.addRules(defaultRules);
      const spoofedCtx: RuleContext = { agentId: 'admin-evil', channel: 'admin', verified: false };
      const result = engine.evaluate('channel', 'admin', spoofedCtx);
      expect(result.effect).toBe('forbid');
    });

    it('allows admin channel when verified admin agent', () => {
      const engine = new PolicyEngine();
      engine.addRules(defaultRules);
      const verifiedCtx: RuleContext = { agentId: 'admin-1', channel: 'admin', verified: true };
      const result = engine.evaluate('channel', 'admin', verifiedCtx);
      expect(result.effect).toBe('permit');
    });
  });

  describe('spoofed support agent cannot bypass support rules', () => {
    it('blocks support channel when unverified agent claims support- prefix', () => {
      const engine = new PolicyEngine();
      engine.addRules([...supportRules, ...defaultRules]);
      const spoofedCtx: RuleContext = { agentId: 'support-evil', channel: 'support', verified: false };
      const result = engine.evaluate('channel', 'support', spoofedCtx);
      expect(result.effect).toBe('forbid');
    });

    it('allows support channel when verified support agent', () => {
      const engine = new PolicyEngine();
      engine.addRules([...supportRules, ...defaultRules]);
      const verifiedCtx: RuleContext = { agentId: 'support-bot', channel: 'support', verified: true };
      const result = engine.evaluate('channel', 'support', verifiedCtx);
      expect(result.effect).toBe('permit');
    });
  });

  describe('preview model restriction requires verified admin', () => {
    it('blocks preview models for unverified agent claiming admin- prefix', () => {
      const engine = new PolicyEngine();
      engine.addRules(defaultRules);
      const spoofedCtx: RuleContext = { agentId: 'admin-evil', channel: 'default', verified: false };
      const result = engine.evaluate('model', 'claude-3-preview', spoofedCtx);
      expect(result.effect).toBe('forbid');
    });

    it('allows preview models for verified admin agent', () => {
      const engine = new PolicyEngine();
      engine.addRules(defaultRules);
      const verifiedCtx: RuleContext = { agentId: 'admin-1', channel: 'default', verified: true };
      const result = engine.evaluate('model', 'claude-3-preview', verifiedCtx);
      expect(result.effect).toBe('permit');
    });
  });

  describe('backwards compatibility: empty registry means verified=true', () => {
    it('with no identity registry, existing behavior is preserved', () => {
      const registry = new AgentIdentityRegistry();
      const ctx = registry.buildRuleContext('admin-1', 'default');
      expect(ctx.verified).toBe(true);

      const engine = new PolicyEngine();
      engine.addRules(defaultRules);
      const result = engine.evaluate('tool', 'delete_file', ctx);
      expect(result.effect).toBe('permit');
    });
  });
});
