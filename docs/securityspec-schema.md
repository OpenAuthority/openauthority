# SecuritySPEC Schema

## YAML Schema Structure

```yaml
# =============================================================================
# SecuritySPEC - Policy-as-Code Schema for OpenAuthority
# =============================================================================
# Version: 1.0.0
# Schema defines tenant/agent/user/skills/models, actions, constraints,
# rate limits, sandboxing rules, and secret isolation.
# =============================================================================

---
# -----------------------------------------------------------------------------
# Identity & Versioning
# -----------------------------------------------------------------------------
apiVersion: "openauthority.io/v1alpha1"  # versioned schema
kind: "SecuritySpec"                     # SecuritySpec | SecuritySpecOverlay
metadata:
  name: string                 # unique policy name (e.g., "acme-production")
  namespace: string            # logical namespace (e.g., "tenant-acme")
  labels:                     # arbitrary key-value pairs for organization
    string: string
  annotations:                 # human-readable notes
    string: string

# -----------------------------------------------------------------------------
# Identity Model - tenants, agents, users, skills, models
# -----------------------------------------------------------------------------
identities:
  tenants:
    - id: string              # unique tenant ID (e.g., "tenant-acme")
      name: string            # display name
      description: string
      # Child agents inherit tenant defaults
      children:              # array of agent IDs belonging to this tenant
        - string
      # Optional: tenant-level spend cap (overridden by agent/model caps)
      spendCap:
        amount: number        # monetary limit (e.g., 1000.00)
        currency: string      # USD, EUR, etc.
        period: string        # daily, weekly, monthly
      # Optional: tenant-level rate limits
      rateLimits:
        - resource: string   # model, tool, command
          maxCalls: number   # max invocations
          windowSeconds: number
      # Default sandbox settings for this tenant
      sandbox:
        allowExec: boolean   # allow shell exec
        allowNetwork: boolean # allow outbound network
        allowFileWrite: boolean
        maxFileSizeMb: number
        allowedPaths:         # whitelist of accessible paths
          - string
        blockedPaths:         # blacklist of protected paths
          - string

  agents:
    - id: string              # unique agent ID (e.g., "research-agent-01")
      tenantId: string        # parent tenant
      name: string
      description: string
      # Agent role determines default permissions
      role: string            # admin, developer, analyst, research, readonly
      # Skills/tools this agent is authorized to use
      skills:
        - id: string          # skill/tool identifier
          name: string
          # Skill-specific overrides
          rateLimit:
            maxCalls: number
            windowSeconds: number
          spendLimit:
            amount: number
            per: string       # per-call, per-hour, per-day
      # Agent-level spend cap (overrides tenant)
      spendCap:
        amount: number
        currency: string
        period: string
      # Agent-level rate limits (overrides tenant)
      rateLimits:
        - resource: string
          maxCalls: number
          windowSeconds: number
      # Agent-specific sandbox config (overrides tenant)
      sandbox:
        allowExec: boolean
        allowNetwork: boolean
        allowFileWrite: boolean
        maxFileSizeMb: number
        allowedPaths: [string]
        blockedPaths: [string]

  users:
    - id: string              # unique user ID (e.g., "user-alice")
      tenantId: string
      name: string
      email: string
      # User role within tenant
      role: string            # admin, developer, user, readonly
      # API keys or credentials associated with this user
      credentials:
        - type: string        # api-key, oauth, aws-sts, gcp-sa
          identifier: string  # key ID or principal ARN
          # Secret reference (never exposed directly to agent)
          secretRef: string   # references secret in secrets store
      # User-level spend cap (overrides agent)
      spendCap:
        amount: number
        currency: string
        period: string

  skills:
    - id: string              # skill/tool identifier (e.g., "file.read", "shell.exec")
      name: string
      description: string
      category: string        # file, network, code, shell, secret
      # Risk level affects sandboxing requirements
      riskLevel: string       # low, medium, high, critical
      # Skills this skill depends on
      dependencies:
        - string
      # Required capabilities for this skill
      requiredCapabilities:
        - string

  models:
    - id: string              # model identifier (e.g., "anthropic/claude-3-opus")
      provider: string        # anthropic, openai, together
      name: string
      # Model-level spend cap (most specific)
      spendCap:
        amount: number
        currency: string
        period: string
      # Model-level rate limits
      rateLimits:
        - resource: string
          maxCalls: number
          windowSeconds: number
      # Input/output cost per 1K tokens
      pricing:
        inputPer1k: number
        outputPer1k: number
        currency: string

# -----------------------------------------------------------------------------
# Actions - what operations can be performed
# -----------------------------------------------------------------------------
actions:
  # LLM invocation actions
  llm:
    invoke:
      # Allow/disallow LLM calls
      enabled: boolean
      # Required models for this tenant
      allowedModels:
        - string              # exact match or prefix (e.g., "anthropic/claude-*")
      # Blocked model patterns
      blockedModels:
        - string
      # Max tokens per request
      maxTokens: number
      # System prompt requirements
      systemPrompt:
        required: boolean
        editable: boolean    # can agent modify system prompt

  tool:
    call:
      # Enable tool calling
      enabled: boolean
      # Allowed tool categories
      allowedTools:
        - string              # exact or pattern (e.g., "file.*", "*.read")
      # Blocked tools
      blockedTools:
        - string
      # Require confirmation for certain tools
      confirmTools:
        - string

  secret:
    use:
      # Enable secret access
      enabled: boolean
      # How secrets are provided to agent
      injectionMode: string   # none, env-only, request-only, never-expose
      # Allowed secret categories
      allowedSecrets:
        - string              # pattern matching secret names
      # Blocked secrets
      blockedSecrets:
        - string
      # Secrets must be accessed via this pattern
      secretRefPattern: string # e.g., "secret:*"

  shell:
    exec:
      # Enable shell execution
      enabled: boolean
      # Allowed commands (whitelist)
      allowedCommands:
        - string              # exact or pattern
      # Blocked commands (blacklist)
      blockedCommands:
        - string
      # Require sudo for certain commands
      sudoCommands:
        - string
      # Working directory restrictions
      allowedDirs:
        - string
      # Environment variables that can be set
      allowedEnvVars:
        - string

  file:
    read:
      enabled: boolean
      # Allowed paths (whitelist)
      allowedPaths:
        - string              # supports glob patterns
      # Blocked paths (blacklist)
      blockedPaths:
        - string
      # Max file size
      maxFileSizeMb: number
    write:
      enabled: boolean
      allowedPaths:
        - string
      blockedPaths:
        - string
      maxFileSizeMb: number
      # Require confirmation before overwrite
      confirmOverwrite: boolean
    delete:
      enabled: boolean
      allowedPaths:
        - string
      blockedPaths:
        - string
      # Require recycle bin instead of permanent delete
      useRecycleBin: boolean

# -----------------------------------------------------------------------------
# Constraints - hard limits on spending and usage
# -----------------------------------------------------------------------------
constraints:
  # Hard spend caps (cannot be exceeded)
  spendCaps:
    - scope: string           # tenant, agent, user, model
      scopeId: string         # specific ID or "*" for all
      amount: number
      currency: string
      period: string          # hourly, daily, weekly, monthly
      # Optional: alert threshold (percentage)
      alertThreshold: number  # e.g., 80 = alert at 80% spend

  # Resource constraints
  resources:
    - type: string           # cpu, memory, network-egress, storage
      scope: string
      scopeId: string
      limit: number
      unit: string            # percent, mb, gb, requests
      period: string

# -----------------------------------------------------------------------------
# Rate Limits - throttling configuration
# -----------------------------------------------------------------------------
rateLimits:
  # Per-tenant rate limits
  tenant:
    - resource: string        # model, tool, command
      maxCalls: number
      windowSeconds: number
      scopeId: string          # tenant ID or "*"

  # Per-model rate limits
  model:
    - modelId: string         # model identifier
      maxCalls: number
      windowSeconds: number

  # Per-agent rate limits
  agent:
    - resource: string
      maxCalls: number
      windowSeconds: number
      scopeId: string         # agent ID or "*"

# -----------------------------------------------------------------------------
# Sandboxing Rules - execution environment constraints
# -----------------------------------------------------------------------------
sandboxing:
  # Default sandbox for the policy
  default:
    type: string              # none, container, vm, firecracker
    isolationLevel: string    # process, container, vm
    # Network isolation
    network:
      allowOutbound: boolean
      allowedDomains:
        - string
      blockedDomains:
        - string
      dnsWhitelist:
        - string
    # File system isolation
    filesystem:
      readOnly: boolean
      tmpDir: string          # temp directory path
      maxFileSizeMb: number
      # Volume mounts
      volumes:
        - hostPath: string
          containerPath: string
          readOnly: boolean
    # Compute limits
    compute:
      maxCpuPercent: number
      maxMemoryMb: number
      maxDurationSeconds: number
    # Environment variables
    env:
      allowAll: boolean
      allowed:
        - string
      blocked:
        - string
      # Secrets injection (never expose actual values)
      secretInjectionMode: string # none, env-ref-only

  # Rules for specific risky actions
  rules:
    - action: string          # shell.exec, code.exec, http.request
      requiresSandbox: boolean
      sandboxType: string     # container, vm, firecracker
      # Additional constraints for this action
      constraints:
        maxDurationSeconds: number
        maxMemoryMb: number
        allowNetwork: boolean
        allowedCommands: [string]

# -----------------------------------------------------------------------------
# Secret Isolation Rules
# -----------------------------------------------------------------------------
secrets:
  # How secrets are managed
  management:
    # Agents never directly hold credentials
    agentNeverHoldsCredentials: boolean  # always true
    # Secret injection method
    injectionMethod: string     # env-var, request-header, vault-sidecar
    # Agent can only reference secrets, never read values
    agentCanOnlyReference: boolean

  # Secret categories and their access rules
  categories:
    - name: string            # e.g., "api-keys", "database-creds"
      description: string
      # Who can access
      allowedRoles:
        - string
      # Required approval
      requiresApproval: boolean
      # Audit requirement
      auditAccess: boolean
      # Allowed injection methods
      injectionMethods:
        - string

  # Blocked secret patterns
  blockedPatterns:
    - pattern: string         # regex pattern
      reason: string

# -----------------------------------------------------------------------------
# Policy Composition
# -----------------------------------------------------------------------------
# Extends allows composing base policies with environment-specific overlays
extends:
  - apiVersion: "openauthority.io/v1alpha1"
    kind: "SecuritySpec"
    name: string              # name of base policy to extend
    # Overlay behavior: merge, replace
    mode: string              # merge (combine), replace (override)

# -----------------------------------------------------------------------------
# Validation & Audit
# -----------------------------------------------------------------------------
validation:
  # Require approval before deployment
  requireApproval: boolean
  # Auto-revoke after period
  autoRevokeAfter: string     # ISO 8601 duration

audit:
  # Log all decisions
  logDecisions: boolean
  # Log all resource accesses
  logResourceAccess: boolean
  # Retention period
  retentionDays: number

---
# =============================================================================
# Example: Baseline Safe Defaults
# =============================================================================
apiVersion: "openauthority.io/v1alpha1"
kind: "SecuritySpec"
metadata:
  name: "baseline-safe-defaults"
  namespace: "openauthority"
  labels:
    env: "default"
    tier: "baseline"

identities:
  tenants:
    - id: "tenant-default"
      name: "Default Tenant"
      spendCap:
        amount: 100.00
        currency: "USD"
        period: "daily"
      rateLimits:
        - resource: "model"
          maxCalls: 100
          windowSeconds: 3600
      sandbox:
        allowExec: false
        allowNetwork: true
        allowFileWrite: false
        allowedPaths: ["/tmp", "/workspace"]
        blockedPaths: ["/etc", "/root", "/home/*/.aws", "/home/*/.ssh"]

  agents:
    - id: "agent-default"
      tenantId: "tenant-default"
      name: "Default Agent"
      role: "readonly"
      skills:
        - id: "file.read"
          name: "File Read"
          rateLimit:
            maxCalls: 50
            windowSeconds: 300

  skills:
    - id: "file.read"
      name: "Read File"
      category: "file"
      riskLevel: "low"
    - id: "file.write"
      name: "Write File"
      category: "file"
      riskLevel: "medium"
    - id: "shell.exec"
      name: "Shell Execute"
      category: "shell"
      riskLevel: "high"
    - id: "secret.use"
      name: "Use Secret"
      category: "secret"
      riskLevel: "critical"

  models:
    - id: "anthropic/claude-3-opus"
      provider: "anthropic"
      name: "Claude 3 Opus"
      spendCap:
        amount: 500.00
        currency: "USD"
        period: "daily"
      rateLimits:
        - resource: "model"
          maxCalls: 50
          windowSeconds: 3600

actions:
  llm:
    invoke:
      enabled: true
      allowedModels:
        - "anthropic/claude-*"
      blockedModels:
        - "*-preview"
        - "*-experimental"
      maxTokens: 100000
      systemPrompt:
        required: true
        editable: false
  tool:
    call:
      enabled: true
      allowedTools:
        - "file.*"
        - "search.*"
  secret:
    use:
      enabled: true
      injectionMode: "env-only"
      secretRefPattern: "secret:*"
  shell:
    exec:
      enabled: false
  file:
    read:
      enabled: true
      allowedPaths: ["/tmp", "/workspace"]
      blockedPaths: ["/etc", "/root", "/home"]
    write:
      enabled: false

constraints:
  spendCaps:
    - scope: "tenant"
      scopeId: "*"
      amount: 100.00
      currency: "USD"
      period: "daily"
      alertThreshold: 80

rateLimits:
  tenant:
    - resource: "model"
      maxCalls: 100
      windowSeconds: 3600
  model:
    - modelId: "*"
      maxCalls: 100
      windowSeconds: 3600

sandboxing:
  default:
    type: "container"
    isolationLevel: "container"
    network:
      allowOutbound: true
    filesystem:
      readOnly: false
      tmpDir: "/tmp/openauthority"
      maxFileSizeMb: 100
    compute:
      maxCpuPercent: 50
      maxMemoryMb: 512
      maxDurationSeconds: 300

secrets:
  management:
    agentNeverHoldsCredentials: true
    injectionMethod: "env-var"
    agentCanOnlyReference: true
  categories:
    - name: "api-keys"
      allowedRoles: ["admin", "developer"]
      auditAccess: true
    - name: "database-creds"
      allowedRoles: ["admin"]
      requiresApproval: true
      auditAccess: true

---
# =============================================================================
# Example: High-Risk "Research" Environment
# =============================================================================
apiVersion: "openauthority.io/v1alpha1"
kind: "SecuritySpec"
metadata:
  name: "research-high-risk"
  namespace: "acme-research"
  labels:
    env: "research"
    tier: "high-risk"

extends:
  - apiVersion: "openauthority.io/v1alpha1"
    kind: "SecuritySpec"
    name: "baseline-safe-defaults"
    mode: "merge"

identities:
  tenants:
    - id: "tenant-research"
      name: "Research Tenant"
      spendCap:
        amount: 5000.00
        currency: "USD"
        period: "daily"
      rateLimits:
        - resource: "model"
          maxCalls: 500
          windowSeconds: 3600
      sandbox:
        allowExec: true
        allowNetwork: true
        allowFileWrite: true
        maxFileSizeMb: 500
        allowedPaths: ["/tmp", "/workspace", "/data"]
        blockedPaths: ["/etc", "/root"]

  agents:
    - id: "research-agent"
      tenantId: "tenant-research"
      name: "Research Agent"
      role: "research"
      skills:
        - id: "code.exec"
          name: "Code Execution"
          riskLevel: "high"
        - id: "shell.exec"
          name: "Shell Execute"
          riskLevel: "high"
        - id: "web.fetch"
          name: "Web Fetch"
          riskLevel: "medium"

actions:
  llm:
    invoke:
      enabled: true
      allowedModels:
        - "anthropic/*"
        - "together/*"
        - "openai/*"
      blockedModels: []
      maxTokens: 200000
      systemPrompt:
        required: false
        editable: true
  tool:
    call:
      enabled: true
      allowedTools:
        - "*"
      confirmTools:
        - "shell.exec"
        - "code.exec"
  secret:
    use:
      enabled: true
      injectionMode: "request-only"
      allowedSecrets:
        - "research-*"
  shell:
    exec:
      enabled: true
      allowedCommands:
        - "*"
      blockedCommands:
        - "rm -rf /"
        - "dd if=/dev/zero"
      allowedDirs:
        - "/tmp"
        - "/workspace"
        - "/data"
  file:
    read:
      enabled: true
      allowedPaths: ["*"]
      maxFileSizeMb: 1000
    write:
      enabled: true
      allowedPaths: ["/tmp", "/workspace", "/data"]
      maxFileSizeMb: 1000
    delete:
      enabled: true
      allowedPaths: ["/tmp", "/workspace/data"]

constraints:
  spendCaps:
    - scope: "tenant"
      scopeId: "tenant-research"
      amount: 5000.00
      currency: "USD"
      period: "daily"
      alertThreshold: 90

rateLimits:
  tenant:
    - resource: "model"
      maxCalls: 500
      windowSeconds: 3600
  model:
    - modelId: "*"
      maxCalls: 500
      windowSeconds: 3600
  agent:
    - resource: "shell.exec"
      maxCalls: 20
      windowSeconds: 300

sandboxing:
  default:
    type: "container"
    isolationLevel: "container"
    network:
      allowOutbound: true
      allowedDomains: ["*"]
    filesystem:
      readOnly: false
      tmpDir: "/tmp/sandbox"
      maxFileSizeMb: 1000
    compute:
      maxCpuPercent: 80
      maxMemoryMb: 2048
      maxDurationSeconds: 600
  rules:
    - action: "shell.exec"
      requiresSandbox: true
      sandboxType: "container"
      constraints:
        maxDurationSeconds: 300
        maxMemoryMb: 1024
        allowNetwork: true
    - action: "code.exec"
      requiresSandbox: true
      sandboxType: "container"
      constraints:
        maxDurationSeconds: 600
        maxMemoryMb: 2048

secrets:
  management:
    agentNeverHoldsCredentials: true
    injectionMethod: "request-header"
    agentCanOnlyReference: true
  categories:
    - name: "research-api-keys"
      allowedRoles: ["research"]
      auditAccess: true

---
# =============================================================================
# Example: Strict Enterprise Environment
# =============================================================================
apiVersion: "openauthority.io/v1alpha1"
kind: "SecuritySpec"
metadata:
  name: "enterprise-strict"
  namespace: "acme-enterprise"
  labels:
    env: "production"
    tier: "strict"

extends:
  - apiVersion: "openauthority.io/v1alpha1"
    kind: "SecuritySpec"
    name: "baseline-safe-defaults"
    mode: "merge"

identities:
  tenants:
    - id: "tenant-enterprise"
      name: "Enterprise Tenant"
      spendCap:
        amount: 100.00
        currency: "USD"
        period: "daily"
        alertThreshold: 50
      rateLimits:
        - resource: "model"
          maxCalls: 20
          windowSeconds: 3600
      sandbox:
        allowExec: false
        allowNetwork: false
        allowFileWrite: false
        allowedPaths: []
        blockedPaths: ["*"]

  agents:
    - id: "admin-agent"
      tenantId: "tenant-enterprise"
      name: "Admin Agent"
      role: "admin"
      spendCap:
        amount: 200.00
        currency: "USD"
        period: "daily"
      sandbox:
        allowExec: true
        allowNetwork: true
        allowFileWrite: true
    - id: "readonly-agent"
      tenantId: "tenant-enterprise"
      name: "Read Only Agent"
      role: "readonly"
      sandbox:
        allowExec: false
        allowNetwork: false
        allowFileWrite: false

  users:
    - id: "admin-user"
      tenantId: "tenant-enterprise"
      name: "Admin User"
      role: "admin"
      credentials:
        - type: "api-key"
          identifier: "key-admin-001"
          secretRef: "secret:admin-api-key"

  models:
    - id: "anthropic/claude-3-5-sonnet"
      provider: "anthropic"
      name: "Claude 3.5 Sonnet"
      spendCap:
        amount: 50.00
        currency: "USD"
        period: "daily"

actions:
  llm:
    invoke:
      enabled: true
      allowedModels:
        - "anthropic/claude-3-5-sonnet"
        - "anthropic/claude-3-haiku"
      blockedModels:
        - "*-preview"
        - "*-experimental"
        - "*-alpha"
        - "*-beta"
      maxTokens: 50000
      systemPrompt:
        required: true
        editable: false
  tool:
    call:
      enabled: true
      allowedTools:
        - "file.read"
        - "search.files"
      confirmTools: ["*"]
  secret:
    use:
      enabled: false
      injectionMode: "none"
  shell:
    exec:
      enabled: false
  file:
    read:
      enabled: true
      allowedPaths: ["/workspace/readonly"]
      blockedPaths: ["*"]
    write:
      enabled: false

constraints:
  spendCaps:
    - scope: "tenant"
      scopeId: "*"
      amount: 100.00
      currency: "USD"
      period: "daily"
      alertThreshold: 50
    - scope: "model"
      scopeId: "*"
      amount: 50.00
      currency: "USD"
      period: "daily"
      alertThreshold: 50

rateLimits:
  tenant:
    - resource: "model"
      maxCalls: 20
      windowSeconds: 3600
    - resource: "tool"
      maxCalls: 50
      windowSeconds: 300
  model:
    - modelId: "*"
      maxCalls: 20
      windowSeconds: 3600

sandboxing:
  default:
    type: "vm"
    isolationLevel: "vm"
    network:
      allowOutbound: false
      allowedDomains: []
    filesystem:
      readOnly: true
      tmpDir: "/tmp/readonly"
      maxFileSizeMb: 10
    compute:
      maxCpuPercent: 25
      maxMemoryMb: 256
      maxDurationSeconds: 60
    env:
      allowAll: false
      allowed: []
      blocked: ["*"]
    secretInjectionMode: "none"
  rules:
    - action: "shell.exec"
      requiresSandbox: true
      sandboxType: "vm"
      constraints:
        maxDurationSeconds: 30
        maxMemoryMb: 128
        allowNetwork: false

secrets:
  management:
    agentNeverHoldsCredentials: true
    injectionMethod: "none"
    agentCanOnlyReference: false
  categories:
    - name: "production-api-keys"
      allowedRoles: ["admin"]
      requiresApproval: true
      auditAccess: true
  blockedPatterns:
    - pattern: ".*"
      reason: "No secrets accessible to agents in strict mode"

validation:
  requireApproval: true
  autoRevokeAfter: "P90D"

audit:
  logDecisions: true
  logResourceAccess: true
  retentionDays: 2555  # 7 years
