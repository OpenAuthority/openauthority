import type { RuleContext } from './policy/types.js';

export interface RegisteredAgent {
  agentId: string;
  allowedChannels: string[];
  role?: string | undefined;
}

export interface IdentityVerificationResult {
  verified: boolean;
  registeredAgent?: RegisteredAgent | undefined;
}

export class AgentIdentityRegistry {
  private readonly agents = new Map<string, RegisteredAgent>();

  register(agent: RegisteredAgent): void {
    this.agents.set(agent.agentId, agent);
  }

  registerMany(agents: RegisteredAgent[]): void {
    for (const agent of agents) {
      this.register(agent);
    }
  }

  unregister(agentId: string): boolean {
    return this.agents.delete(agentId);
  }

  get(agentId: string): RegisteredAgent | undefined {
    return this.agents.get(agentId);
  }

  list(): RegisteredAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Verifies that the claimed agentId and channel are legitimate by checking
   * against the registry of known agents.
   *
   * An identity is considered verified when:
   * 1. The agentId exists in the registry
   * 2. The claimed channel is in the agent's allowedChannels list
   *
   * When the registry is empty (no agents registered), verification always
   * returns `verified: true` to maintain backwards compatibility with existing
   * deployments that haven't configured the registry yet. This opt-in design
   * means that adding identity verification is a no-op until agents are
   * explicitly registered.
   */
  verify(agentId: string, channel: string): IdentityVerificationResult {
    if (this.agents.size === 0) {
      return { verified: true };
    }

    const registered = this.agents.get(agentId);
    if (!registered) {
      return { verified: false };
    }

    const channelAllowed = registered.allowedChannels.includes(channel);
    return {
      verified: channelAllowed,
      registeredAgent: channelAllowed ? registered : undefined,
    };
  }

  /**
   * Builds a RuleContext with the verified flag set based on identity
   * verification. If the agent cannot be verified, the context is still
   * created but with `verified: false`, allowing rules to make
   * security-conservative decisions.
   */
  buildRuleContext(agentId: string, channel: string, extras?: { userId?: string; sessionId?: string; metadata?: Record<string, unknown> }): RuleContext {
    const { verified } = this.verify(agentId, channel);
    return {
      agentId,
      channel,
      verified,
      ...extras,
    };
  }

  clear(): void {
    this.agents.clear();
  }

  get size(): number {
    return this.agents.size;
  }
}
