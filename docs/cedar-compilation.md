# Cedar Compilation Guide

## 1. Cedar Entity Model

### Entity Types Hierarchy

```
                    ┌─────────────┐
                    │   Tenant   │
                    └──────┬──────┘
                           │ (contains)
           ┌───────────────┼───────────────┐
           │               │               │
      ┌────▼────┐     ┌────▼────┐    ┌────▼────┐
      │  Agent  │     │  User   │    │  Model  │
      └────┬────┘     └────┬────┘    └─────────┘
           │                │
           │ (uses)         │ (authenticated-as)
      ┌────▼────┐          │
      │ Skill   │          │
      └─────────┘
```

### Cedar Schema Definition

```cedar
// ===== Entity Types =====

// Tenants are the top-level isolation boundary
entity Tenant = {
    name: String,
    spendCapAmount: Long,
    spendCapCurrency: String,
    spendCapPeriod: String,
    allowExec: Boolean,
    allowNetwork: Boolean,
    allowFileWrite: Boolean,
    maxFileSizeMb: Long,
    alertThreshold: Long,
}

// Agents perform actions on behalf of users
entity Agent = {
    name: String,
    role: String,           // admin, developer, analyst, research, readonly
    tenant: Tenant,
    spendCapAmount: Long,
    spendCapCurrency: String,
    spendCapPeriod: String,
    allowExec: Boolean,
    allowNetwork: Boolean,
    allowFileWrite: Boolean,
}

// Users are authenticated principals
entity User = {
    name: String,
    email: String,
    role: String,           // admin, developer, user, readonly
    tenant: Tenant,
}

// Skills/Tools that agents can invoke
entity Skill = {
    name: String,
    category: String,        // file, network, code, shell, secret
    riskLevel: String,      // low, medium, high, critical
}

// Models that can be invoked
entity Model = {
    provider: String,        // anthropic, openai, together
    name: String,
    spendCapAmount: Long,
    spendCapCurrency: String,
    spendCapPeriod: String,
    pricingInputPer1k: Long,
    pricingOutputPer1k: Long,
}

// Resources (files, secrets, commands)
entity Resource = {
    path: String,           // file path or secret identifier
    type: String,           // file, secret, command
    owner: Tenant,
}

// Rate limit configurations
entity RateLimit = {
    resource: String,
    maxCalls: Long,
    windowSeconds: Long,
    scope: String,          // tenant, agent, model
    scopeId: String,
}

// ===== Action Types =====

action llm_invoke = {
    model: Model,
    maxTokens: Long,
    systemPromptEditable: Boolean,
}

action tool_call = {
    skill: Skill,
    requiresConfirmation: Boolean,
}

action secret_use = {
    secretCategory: String,
    injectionMode: String,
}

action shell_exec = {
    command: String,
    workingDir: String,
}

action file_read = {
    path: String,
    maxSizeMb: Long,
}

action file_write = {
    path: String,
    maxSizeMb: Long,
    confirmOverwrite: Boolean,
}
```

## 2. Cedar Actions Definition

### Action Set

```
Actions:
  - llm_invoke    // Call an LLM model
  - tool_call    // Invoke a skill/tool
  - secret_use   // Access a secret
  - shell_exec   // Execute shell command
  - file_read    // Read a file
  - file_write   // Write a file
  - file_delete  // Delete a file
  - model_list   // List available models
  - skill_list   // List available skills
```

### Action Hierarchy (for inheritance)

```
           ┌──────────┐
           │  Action  │
           └────┬─────┘
                │
     ┌──────────┼──────────┐
     │          │          │
┌────▼───┐ ┌───▼────┐ ┌───▼────┐
│  LLM   │ │ Tool   │ │ Secret │
└────────┘ └────────┘ └────────┘
     │          │          │
     ▼          ▼          ▼
llm_invoke  tool_call  secret_use

     ┌────────────┐
     │  FileOps   │
     └─────┬──────┘
           │
    ┌──────┼──────┐
    ▼             ▼
file_read   file_write
```

## 3. SecuritySPEC to Cedar Compilation

### Example: Baseline Safe Defaults

```yaml
apiVersion: "openauthority.io/v1alpha1"
kind: "SecuritySpec"
metadata:
  name: "baseline-safe-defaults"

identities:
  tenants:
    - id: "tenant-default"
      spendCap:
        amount: 100.00
        currency: "USD"
        period: "daily"
      sandbox:
        allowExec: false
        allowNetwork: true
        allowFileWrite: false

  agents:
    - id: "agent-default"
      tenantId: "tenant-default"
      role: "readonly"

  skills:
    - id: "file.read"
      riskLevel: "low"
    - id: "shell.exec"
      riskLevel: "high"

  models:
    - id: "anthropic/claude-3-opus"
      spendCap:
        amount: 500.00
        currency: "USD"

actions:
  llm:
    invoke:
      allowedModels: ["anthropic/claude-*"]
  tool:
    call:
      allowedTools: ["file.*"]
  shell:
    exec:
      enabled: false
  file:
    read:
      allowedPaths: ["/tmp", "/workspace"]
    write:
      enabled: false
```

### Compiled Cedar Policies

```cedar
// ===== Tenant Entity =====
{
    "uid": {"type": "Tenant", "id": "tenant-default"},
    "attr": {
        "name": "Default Tenant",
        "spendCapAmount": 10000,  // cents
        "spendCapCurrency": "USD",
        "spendCapPeriod": "daily",
        "allowExec": false,
        "allowNetwork": true,
        "allowFileWrite": false,
        "maxFileSizeMb": 100,
        "alertThreshold": 80
    }
}

// ===== Agent Entity =====
{
    "uid": {"type": "Agent", "id": "agent-default"},
    "attr": {
        "name": "Default Agent",
        "role": "readonly",
        "tenant": {"type": "Tenant", "id": "tenant-default"},
        "spendCapAmount": 10000,
        "spendCapCurrency": "USD",
        "spendCapPeriod": "daily",
        "allowExec": false,
        "allowNetwork": true,
        "allowFileWrite": false
    }
}

// ===== Model Entities =====
{
    "uid": {"type": "Model", "id": "anthropic/claude-3-opus"},
    "attr": {
        "provider": "anthropic",
        "name": "Claude 3 Opus",
        "spendCapAmount": 50000,
        "spendCapCurrency": "USD",
        "spendCapPeriod": "daily",
        "pricingInputPer1k": 15,
        "pricingOutputPer1k": 75
    }
}

// ===== Skill Entities =====
{"uid": {"type": "Skill", "id": "file.read"}, "attr": {"category": "file", "riskLevel": "low"}}
{"uid": {"type": "Skill", "id": "file.write"}, "attr": {"category": "file", "riskLevel": "medium"}}
{"uid": {"type": "Skill", "id": "shell.exec"}, "attr": {"category": "shell", "riskLevel": "high"}}
{"uid": {"type": "Skill", "id": "secret.use"}, "attr": {"category": "secret", "riskLevel": "critical"}}

// ===== Cedar Policies =====

// Policy 1: Allow LLM invoke for allowed models
permit(
    principal: Agent,
    action: llm_invoke,
    resource: Model
)
when {
    principal.tenant.allowNetwork == true &&
    (resource.id like "anthropic/claude-*") &&
    !resource.id like "*-preview"
};

// Policy 2: Forbid LLM invoke for blocked models
forbid(
    principal: Agent,
    action: llm_invoke,
    resource: Model
)
when {
    resource.id like "*-preview" ||
    resource.id like "*-experimental"
};

// Policy 3: Allow tool call for allowed tools
permit(
    principal: Agent,
    action: tool_call,
    resource: Skill
)
when {
    principal.tenant.allowExec == false &&
    (resource.category == "file" && resource.id like "file.read") ||
    (resource.category == "search")
};

// Policy 4: Forbid shell.exec by default
forbid(
    principal: Agent,
    action: shell_exec,
    resource: Skill
)
when {
    principal.tenant.allowExec == false
};

// Policy 5: Allow file.read for allowed paths
permit(
    principal: Agent,
    action: file_read,
    resource: Resource
)
when {
    principal.tenant.allowNetwork == true &&
    (resource.path like "/tmp/*" || resource.path like "/workspace/*") &&
    !resource.path like "/etc/*" &&
    !resource.path like "/root/*"
};

// Policy 6: Forbid file.write by default
forbid(
    principal: Agent,
    action: file_write,
    resource: Resource
)
when {
    principal.tenant.allowFileWrite == false
};

// Policy 7: Forbid secret.use
forbid(
    principal: Agent,
    action: secret_use,
    resource: Resource
)
when {
    principal.tenant.allowExec == false
};

// Policy 8: Rate limit model invocations
forbid(
    principal: Agent,
    action: llm_invoke,
    resource: Model
)
when {
    // Rate limit check - simplified for example
    principal.role == "readonly" &&
    context.callCount > 100 &&
    context.windowSeconds <= 3600
};

// Policy 9: Default deny
forbid(
    principal: Agent,
    action: Action,
    resource: Resource
)
when {
    true
};
```

### Cedar Validation Policy Template

```cedar
// Template library for common validations

// Spend cap validation
@description("Check if spend cap would be exceeded")
template validateSpendCap(principal: Agent, amount: Long) ->
    principal.tenant.spendCapAmount >= amount ||
    principal.spendCapAmount >= amount;

// Rate limit validation  
@description("Check if rate limit would be exceeded")
template validateRateLimit(principal: Agent, action: Action, limit: RateLimit) ->
    context.callCount < limit.maxCalls &&
    context.windowSeconds == limit.windowSeconds;

// Path validation
@description("Check if path is allowed")
template validatePath(path: String, allowedPaths: Set<String>) ->
    exists(pattern in allowedPaths {
        path like pattern
    });
```

## 4. Rust Data Structures

```rust
// ===== Core Entity Types =====

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// SecuritySpec is the root configuration type
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecuritySpec {
    pub api_version: String,
    pub kind: SecuritySpecKind,
    pub metadata: Metadata,
    pub identities: Identities,
    pub actions: Actions,
    pub constraints: Constraints,
    pub rate_limits: RateLimits,
    pub sandboxing: Sandboxing,
    pub secrets: Secrets,
    #[serde(default)]
    pub extends: Vec<Extends>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SecuritySpecKind {
    SecuritySpec,
    SecuritySpecOverlay,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Metadata {
    pub name: String,
    pub namespace: String,
    #[serde(default)]
    pub labels: HashMap<String, String>,
    #[serde(default)]
    pub annotations: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Identities {
    #[serde(default)]
    pub tenants: Vec<Tenant>,
    #[serde(default)]
    pub agents: Vec<Agent>,
    #[serde(default)]
    pub users: Vec<User>,
    #[serde(default)]
    pub skills: Vec<Skill>,
    #[serde(default)]
    pub models: Vec<Model>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tenant {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub children: Vec<String>,
    pub spend_cap: Option<SpendCap>,
    #[serde(default)]
    pub rate_limits: Vec<RateLimitConfig>,
    pub sandbox: SandboxConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub tenant_id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub role: String,
    #[serde(default)]
    pub skills: Vec<AgentSkill>,
    pub spend_cap: Option<SpendCap>,
    #[serde(default)]
    pub rate_limits: Vec<RateLimitConfig>,
    pub sandbox: Option<SandboxConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub tenant_id: String,
    pub name: String,
    pub email: String,
    pub role: String,
    #[serde(default)]
    pub credentials: Vec<Credential>,
    pub spend_cap: Option<SpendCap>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credential {
    pub credential_type: String,
    pub identifier: String,
    pub secret_ref: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub category: String,
    pub risk_level: RiskLevel,
    #[serde(default)]
    pub dependencies: Vec<String>,
    #[serde(default)]
    pub required_capabilities: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Model {
    pub id: String,
    pub provider: String,
    pub name: String,
    pub spend_cap: Option<SpendCap>,
    #[serde(default)]
    pub rate_limits: Vec<RateLimitConfig>,
    pub pricing: Option<Pricing>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpendCap {
    pub amount: f64,
    pub currency: String,
    pub period: String,
    #[serde(default)]
    pub alert_threshold: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitConfig {
    pub resource: String,
    pub max_calls: u64,
    pub window_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxConfig {
    #[serde(default)]
    pub allow_exec: bool,
    #[serde(default)]
    pub allow_network: bool,
    #[serde(default)]
    pub allow_file_write: bool,
    #[serde(default)]
    pub max_file_size_mb: Option<u64>,
    #[serde(default)]
    pub allowed_paths: Vec<String>,
    #[serde(default)]
    pub blocked_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pricing {
    pub input_per_1k: f64,
    pub output_per_1k: f64,
    pub currency: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSkill {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub rate_limit: Option<RateLimitConfig>,
    #[serde(default)]
    pub spend_limit: Option<SpendCap>,
}

// ===== Actions =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Actions {
    pub llm: LlmActions,
    pub tool: ToolActions,
    pub secret: SecretActions,
    pub shell: ShellActions,
    pub file: FileActions,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmActions {
    pub invoke: LlmInvokeConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmInvokeConfig {
    pub enabled: bool,
    #[serde(default)]
    pub allowed_models: Vec<String>,
    #[serde(default)]
    pub blocked_models: Vec<String>,
    #[serde(default)]
    pub max_tokens: Option<u64>,
    pub system_prompt: SystemPromptConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemPromptConfig {
    pub required: bool,
    #[serde(default)]
    pub editable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolActions {
    pub call: ToolCallConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallConfig {
    pub enabled: bool,
    #[serde(default)]
    pub allowed_tools: Vec<String>,
    #[serde(default)]
    pub blocked_tools: Vec<String>,
    #[serde(default)]
    pub confirm_tools: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecretActions {
    pub use_secret: SecretUseConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecretUseConfig {
    pub enabled: bool,
    pub injection_mode: String,
    #[serde(default)]
    pub allowed_secrets: Vec<String>,
    #[serde(default)]
    pub blocked_secrets: Vec<String>,
    #[serde(default)]
    pub secret_ref_pattern: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShellActions {
    pub exec: ShellExecConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShellExecConfig {
    pub enabled: bool,
    #[serde(default)]
    pub allowed_commands: Vec<String>,
    #[serde(default)]
    pub blocked_commands: Vec<String>,
    #[serde(default)]
    pub sudo_commands: Vec<String>,
    #[serde(default)]
    pub allowed_dirs: Vec<String>,
    #[serde(default)]
    pub allowed_env_vars: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileActions {
    pub read: FileReadConfig,
    pub write: FileWriteConfig,
    #[serde(default)]
    pub delete: Option<FileDeleteConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileReadConfig {
    pub enabled: bool,
    #[serde(default)]
    pub allowed_paths: Vec<String>,
    #[serde(default)]
    pub blocked_paths: Vec<String>,
    #[serde(default)]
    pub max_file_size_mb: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileWriteConfig {
    pub enabled: bool,
    #[serde(default)]
    pub allowed_paths: Vec<String>,
    #[serde(default)]
    pub blocked_paths: Vec<String>,
    #[serde(default)]
    pub max_file_size_mb: Option<u64>,
    #[serde(default)]
    pub confirm_overwrite: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDeleteConfig {
    pub enabled: bool,
    #[serde(default)]
    pub allowed_paths: Vec<String>,
    #[serde(default)]
    pub blocked_paths: Vec<String>,
    #[serde(default)]
    pub use_recycle_bin: bool,
}

// ===== Constraints =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Constraints {
    #[serde(default)]
    pub spend_caps: Vec<SpendCapRule>,
    #[serde(default)]
    pub resources: Vec<ResourceConstraint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpendCapRule {
    pub scope: String,
    pub scope_id: String,
    pub amount: f64,
    pub currency: String,
    pub period: String,
    #[serde(default)]
    pub alert_threshold: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceConstraint {
    pub resource_type: String,
    pub scope: String,
    pub scope_id: String,
    pub limit: f64,
    pub unit: String,
    pub period: String,
}

// ===== Rate Limits =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimits {
    #[serde(default)]
    pub tenant: Vec<RateLimitRule>,
    #[serde(default)]
    pub model: Vec<ModelRateLimit>,
    #[serde(default)]
    pub agent: Vec<RateLimitRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitRule {
    pub resource: String,
    pub max_calls: u64,
    pub window_seconds: u64,
    pub scope_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelRateLimit {
    pub model_id: String,
    pub max_calls: u64,
    pub window_seconds: u64,
}

// ===== Sandboxing =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sandboxing {
    pub default: SandboxSettings,
    #[serde(default)]
    pub rules: Vec<SandboxRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxSettings {
    #[serde(default)]
    pub sandbox_type: Option<String>,
    pub isolation_level: String,
    pub network: NetworkConfig,
    pub filesystem: FilesystemConfig,
    pub compute: ComputeConfig,
    pub env: EnvConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkConfig {
    #[serde(default)]
    pub allow_outbound: bool,
    #[serde(default)]
    pub allowed_domains: Vec<String>,
    #[serde(default)]
    pub blocked_domains: Vec<String>,
    #[serde(default)]
    pub dns_whitelist: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilesystemConfig {
    #[serde(default)]
    pub read_only: bool,
    #[serde(default)]
    pub tmp_dir: Option<String>,
    #[serde(default)]
    pub max_file_size_mb: Option<u64>,
    #[serde(default)]
    pub volumes: Vec<VolumeMount>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolumeMount {
    pub host_path: String,
    pub container_path: String,
    #[serde(default)]
    pub read_only: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputeConfig {
    #[serde(default)]
    pub max_cpu_percent: Option<u64>,
    #[serde(default)]
    pub max_memory_mb: Option<u64>,
    #[serde(default)]
    pub max_duration_seconds: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvConfig {
    #[serde(default)]
    pub allow_all: bool,
    #[serde(default)]
    pub allowed: Vec<String>,
    #[serde(default)]
    pub blocked: Vec<String>,
    #[serde(default)]
    pub secret_injection_mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxRule {
    pub action: String,
    #[serde(default)]
    pub requires_sandbox: bool,
    #[serde(default)]
    pub sandbox_type: Option<String>,
    pub constraints: SandboxRuleConstraints,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxRuleConstraints {
    #[serde(default)]
    pub max_duration_seconds: Option<u64>,
    #[serde(default)]
    pub max_memory_mb: Option<u64>,
    #[serde(default)]
    pub allow_network: Option<bool>,
    #[serde(default)]
    pub allowed_commands: Vec<String>,
}

// ===== Secrets =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Secrets {
    pub management: SecretManagement,
    #[serde(default)]
    pub categories: Vec<SecretCategory>,
    #[serde(default)]
    pub blocked_patterns: Vec<BlockedPattern>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecretManagement {
    #[serde(default = "default_true")]
    pub agent_never_holds_credentials: bool,
    pub injection_method: String,
    #[serde(default = "default_true")]
    pub agent_can_only_reference: bool,
}

fn default_true() -> bool { true }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecretCategory {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub allowed_roles: Vec<String>,
    #[serde(default)]
    pub requires_approval: bool,
    #[serde(default)]
    pub audit_access: bool,
    #[serde(default)]
    pub injection_methods: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockedPattern {
    pub pattern: String,
    pub reason: String,
}

// ===== Policy Composition =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Extends {
    pub api_version: String,
    pub kind: String,
    pub name: String,
    #[serde(default)]
    pub mode: ExtendMode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExtendMode {
    Merge,
    Replace,
}

// ===== Cedar Compilation Types =====

/// Represents a compiled Cedar entity
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CedarEntity {
    pub uid: CedarUid,
    pub attr: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CedarUid {
    #[serde(rename = "type")]
    pub entity_type: String,
    pub id: String,
}

/// Represents a Cedar policy
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CedarPolicy {
    pub policy_id: String,
    pub effect: CedarEffect,
    pub principal: CedarVariable,
    pub action: CedarVariable,
    pub resource: CedarVariable,
    pub conditions: Vec<CedarCondition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CedarEffect {
    Permit,
    Forbid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CedarVariable {
    pub variable: CedarVariableType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CedarVariableType {
    Principal,
    Action,
    Resource,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CedarCondition {
    pub kind: CedarConditionKind,
    pub expression: CedarExpression,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CedarConditionKind {
    When,
    Unless,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CedarExpression {
    // Simplified - actual Cedar expressions are complex
    pub kind: CedarExprKind,
    #[serde(default)]
    pub values: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CedarExprKind {
    Equal,
    Like,
    And,
    Or,
    Not,
    GreaterThan,
    LessThan,
    In,
}

/// Compiled Cedar policy set
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CedarPolicySet {
    pub schema: CedarSchema,
    pub entities: Vec<CedarEntity>,
    pub policies: Vec<CedarPolicy>,
    #[serde(default)]
    pub templates: Vec<CedarTemplate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CedarSchema {
    pub version: String,
    pub actions: Vec<CedarAction>,
    pub entities: Vec<CedarEntityType>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CedarAction {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub applies_to: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CedarEntityType {
    pub name: String,
    pub shape: CedarAttributeShape,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CedarAttributeShape {
    #[serde(default)]
    pub attributes: HashMap<String, CedarAttributeType>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CedarAttributeType {
    #[serde(rename = "type")]
    pub attr_type: String,
    #[serde(default)]
    pub element: Option<Box<CedarAttributeType>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CedarTemplate {
    pub template_id: String,
    pub description: String,
    pub variables: Vec<CedarTemplateVariable>,
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CedarTemplateVariable {
    pub name: String,
    pub variable_type: String,
}
```

### Usage Example

```rust
use openauthority_cedar::{SecuritySpec, CedarPolicySet, compile_to_cedar};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load SecuritySpec from YAML
    let yaml_content = std::fs::read_to_string("policy.yaml")?;
    let spec: SecuritySpec = serde_yaml::from_str(&yaml_content)?;
    
    // Compile to Cedar policy set
    let policy_set = compile_to_cedar(&spec)?;
    
    // Serialize to Cedar JSON format
    let cedar_json = serde_json::to_string_pretty(&policy_set)?;
    println!("{}", cedar_json);
    
    Ok(())
}
```

### Cedar Evaluation Request

```rust
/// Request to evaluate a Cedar policy
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CedarEvaluationRequest {
    pub principal: CedarUid,
    pub action: String,
    pub resource: CedarUid,
    pub context: HashMap<String, serde_json::Value>,
}

/// Response from Cedar evaluation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CedarEvaluationResponse {
    pub decision: CedarDecision,
    pub matched_policy: Option<String>,
    pub reason: Option<String>,
    #[serde(default)]
    pub obligations: Vec<CedarObligation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CedarDecision {
    Permit,
    Forbid,
    Deny,
    NoMatch,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CedarObligation {
    pub kind: String,
    pub details: HashMap<String, serde_json::Value>,
}
```
