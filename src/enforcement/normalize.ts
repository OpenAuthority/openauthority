/**
 * Action normalization registry.
 *
 * Provides deterministic mapping from tool names to semantic action classes
 * with associated risk levels and HITL modes. Unknown tools fail closed to
 * `unknown_sensitive_action` with critical risk.
 *
 * Also exports `sortedJsonStringify` — the canonical serialiser for
 * deterministic SHA-256 hashes over `Record<string, unknown>` payloads.
 */

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type HitlModeNorm = 'none' | 'per_request' | 'session_approval';
export type IntentGroup =
  | 'destructive_fs'
  | 'external_send'
  | 'data_exfiltration'
  | 'credential_access'
  | 'payment'
  | 'web_access';

/** A single entry in the action normalization registry. */
export interface ActionRegistryEntry {
  /** Canonical dot-separated action class (e.g. 'filesystem.read'). */
  readonly action_class: string;
  /** Default risk level before parameter-level reclassification. */
  readonly default_risk: RiskLevel;
  /** Default HITL mode for this action class. */
  readonly default_hitl_mode: HitlModeNorm;
  /**
   * Lowercase tool name aliases that map to this action class.
   * All stored in lowercase; matching is case-insensitive.
   */
  readonly aliases: readonly string[];
  /** Optional intent group for broader policy targeting. */
  readonly intent_group?: IntentGroup;
}

/** Result of normalizing a tool call. */
export interface NormalizedAction {
  /** Resolved semantic action class. */
  action_class: string;
  /** Effective risk level after parameter-level reclassification. */
  risk: RiskLevel;
  /** Effective HITL mode for this action. */
  hitl_mode: HitlModeNorm;
  /** Extracted target resource (file path, URL, email address, etc.). */
  target: string;
  /** Intent group for broader policy targeting, if applicable. */
  intent_group?: IntentGroup;
}

// ---------------------------------------------------------------------------
// Registry — 20 entries, aliases stored lowercase
// ---------------------------------------------------------------------------

const REGISTRY: readonly ActionRegistryEntry[] = [
  {
    action_class: 'filesystem.read',
    default_risk: 'low',
    default_hitl_mode: 'none',
    aliases: [
      'read',
      'read_file',
      'readfile',
      'read_files',
      'cat_file',
      'view_file',
      'open_file',
      'get_file_contents',
    ],
  },
  {
    action_class: 'filesystem.write',
    default_risk: 'medium',
    default_hitl_mode: 'per_request',
    aliases: [
      'write',
      'edit',
      'write_file',
      'writefile',
      'create_file',
      'save_file',
      'update_file',
      'edit_file',
      'patch_file',
    ],
  },
  {
    action_class: 'filesystem.delete',
    default_risk: 'high',
    default_hitl_mode: 'per_request',
    aliases: [
      'delete_file',
      'deletefile',
      'remove_file',
      'rm_file',
      'unlink_file',
      'rm',
      'rm_rf',
      'unlink',
      'delete',
      'remove',
      'move_to_trash',
      'trash',
      'shred',
      'rmdir',
      'format',
      'empty_trash',
      'purge',
    ],
    intent_group: 'destructive_fs',
  },
  {
    action_class: 'filesystem.list',
    default_risk: 'low',
    default_hitl_mode: 'none',
    aliases: [
      'list',
      'list_files',
      'listfiles',
      'list_directory',
      'list_dir',
      'read_directory',
      'ls',
    ],
  },
  {
    action_class: 'web.search',
    default_risk: 'medium',
    default_hitl_mode: 'per_request',
    aliases: [
      'web_search',
      'google_search',
      'bing_search',
      'duckduckgo_search',
      'ddg_search',
      'search_web',
      'web_research',
      'news_search',
    ],
  },
  {
    action_class: 'web.fetch',
    default_risk: 'medium',
    default_hitl_mode: 'per_request',
    aliases: [
      'fetch',
      'http_get',
      'web_fetch',
      'get_url',
      'fetch_url',
      'http_request',
      'curl',
      'wget',
      'download_url',
      'http_head',
      'head_url',
      'http_options',
    ],
    intent_group: 'data_exfiltration',
  },
  {
    action_class: 'browser.scrape',
    default_risk: 'medium',
    default_hitl_mode: 'per_request',
    aliases: [
      'scrape_page',
      'extract_page',
      'read_url',
    ],
  },
  {
    action_class: 'web.post',
    default_risk: 'medium',
    default_hitl_mode: 'per_request',
    aliases: [
      'http_post',
      'post_url',
      'web_post',
      'post_request',
      'submit_form',
      'http_put',
      'put_url',
      'web_put',
      'put_request',
      'http_patch',
      'patch_url',
      'web_patch',
      'patch_request',
    ],
    intent_group: 'web_access',
  },
  {
    action_class: 'shell.exec',
    default_risk: 'high',
    default_hitl_mode: 'per_request',
    aliases: [
      'bash',
      'shell_exec',
      'run_command',
      'execute_command',
      'run_terminal_cmd',
      'terminal_exec',
      'cmd',
    ],
  },
  {
    action_class: 'communication.email',
    default_risk: 'high',
    default_hitl_mode: 'per_request',
    aliases: [
      'send_email',
      'email_send',
      'send_mail',
      'compose_email',
      'email',
    ],
    intent_group: 'external_send',
  },
  {
    action_class: 'communication.slack',
    default_risk: 'medium',
    default_hitl_mode: 'per_request',
    aliases: [
      'send_slack',
      'slack_message',
      'slack_send',
      'post_slack',
    ],
    intent_group: 'external_send',
  },
  {
    action_class: 'communication.webhook',
    default_risk: 'medium',
    default_hitl_mode: 'per_request',
    aliases: [
      'call_webhook',
      'webhook',
      'trigger_webhook',
      'post_webhook',
    ],
    intent_group: 'external_send',
  },
  {
    action_class: 'memory.read',
    default_risk: 'low',
    default_hitl_mode: 'none',
    aliases: [
      'memory_get',
      'read_memory',
      'get_memory',
      'recall',
      'retrieve_memory',
    ],
  },
  {
    action_class: 'memory.write',
    default_risk: 'medium',
    default_hitl_mode: 'none',
    aliases: [
      'memory_set',
      'write_memory',
      'set_memory',
      'store_memory',
      'save_memory',
      'remember',
    ],
  },
  {
    action_class: 'credential.read',
    default_risk: 'high',
    default_hitl_mode: 'per_request',
    aliases: [
      'read_secret',
      'get_secret',
      'get_credential',
      'retrieve_secret',
      'read_credential',
    ],
    intent_group: 'credential_access',
  },
  {
    action_class: 'credential.write',
    default_risk: 'critical',
    default_hitl_mode: 'per_request',
    aliases: [
      'write_secret',
      'set_secret',
      'set_credential',
      'store_secret',
      'create_secret',
    ],
    intent_group: 'credential_access',
  },
  {
    action_class: 'code.execute',
    default_risk: 'high',
    default_hitl_mode: 'per_request',
    aliases: [
      'run_code',
      'execute_code',
      'eval_code',
      'python',
      'javascript',
      'node_exec',
      'code_runner',
    ],
  },
  {
    action_class: 'payment.initiate',
    default_risk: 'critical',
    default_hitl_mode: 'per_request',
    aliases: [
      'pay',
      'payment',
      'initiate_payment',
      'create_payment',
      'charge',
      'stripe_payment',
    ],
    intent_group: 'payment',
  },
  {
    action_class: 'unknown_sensitive_action',
    default_risk: 'critical',
    default_hitl_mode: 'per_request',
    aliases: [],
  },
] as const;

// ---------------------------------------------------------------------------
// Internal alias index — built once at module load for O(1) lookup
// ---------------------------------------------------------------------------

const ALIAS_INDEX = new Map<string, ActionRegistryEntry>();
for (const entry of REGISTRY) {
  for (const alias of entry.aliases) {
    ALIAS_INDEX.set(alias, entry);
  }
}

const UNKNOWN_ENTRY = REGISTRY[REGISTRY.length - 1] as ActionRegistryEntry;

// ---------------------------------------------------------------------------
// Shell metacharacter detection
// ---------------------------------------------------------------------------

const SHELL_METACHAR_RE = /[;|&><`$(){}[\]\\]/;

function containsShellMetachars(value: string): boolean {
  return SHELL_METACHAR_RE.test(value);
}

function hasShellMetacharsInParams(params: Record<string, unknown>): boolean {
  for (const val of Object.values(params)) {
    if (typeof val === 'string' && containsShellMetachars(val)) {
      return true;
    }
  }
  return false;
}

/**
 * Leading destructive commands we recognise inside a shell `command` param.
 * Matches at the start of the command string, optionally preceded by `sudo`.
 * Kept conservative to avoid false positives — only real Unix destructive
 * commands, not English words like `remove` or `purge`.
 */
const DESTRUCTIVE_SHELL_CMD_RE =
  /^\s*(?:sudo\s+)?(?:rm|rmdir|unlink|shred|trash-put|trash)\b/i;

/** Tool names that are generic shell-execution wrappers. */
const SHELL_WRAPPER_TOOL_NAMES = new Set<string>([
  'exec',
  'bash',
  'shell_exec',
  'run_command',
  'execute_command',
  'run_terminal_cmd',
  'terminal_exec',
  'cmd',
  'sh',
  'zsh',
]);

/**
 * Well-known credential file paths. Conservative — only paths where the
 * file contents are almost certainly secret. Matching is case-insensitive
 * and works against absolute paths, `~`-prefixed paths, and paths embedded
 * inside longer shell command strings. Public counterparts (`.pub` files,
 * `known_hosts`, `authorized_keys`) are explicitly NOT matched.
 */
const CREDENTIAL_PATH_PATTERNS: readonly string[] = [
  // AWS
  String.raw`\.aws/credentials\b`,
  String.raw`\.aws/config\b`,
  // SSH private keys — anchor on common algorithm names, exclude .pub
  String.raw`\.ssh/id_(?:rsa|ed25519|ecdsa|dsa)\b(?!\.pub)`,
  String.raw`\.ssh/[a-z0-9_-]+_(?:rsa|ed25519|ecdsa|dsa)\b(?!\.pub)`,
  // Kubernetes / Docker
  String.raw`\.kube/config\b`,
  String.raw`\.docker/config\.json\b`,
  // GCP application default credentials
  String.raw`\.config/gcloud/application_default_credentials\.json\b`,
  String.raw`\.config/gcloud/legacy_credentials\b`,
  // Generic home-directory credentials
  String.raw`\.netrc\b`,
  String.raw`\.pgpass\b`,
  String.raw`\.npmrc\b`,
  String.raw`\.gnupg(?:/|\b)`,
  // Dotenv files: .env, .env.local, .env.production, etc.
  String.raw`(?:^|[\s"'=/])\.env(?:\.[a-z0-9_-]+)?(?![a-z0-9_])`,
  // /etc/shadow
  String.raw`/etc/shadow\b`,
];
const CREDENTIAL_PATH_RE = new RegExp(CREDENTIAL_PATH_PATTERNS.join('|'), 'i');

/**
 * Leading commands that indicate a write/copy into the target path (when the
 * target is a credential path, this flips Rule 5 to `credential.write`).
 */
const CREDENTIAL_WRITE_CMD_RE =
  /^\s*(?:sudo\s+)?(?:cp|mv|scp|install|rsync|ln)\b/i;

/**
 * Shell output redirect (`>`, `>>`) — flips Rule 5 to credential.write.
 * Excludes fd redirects like `2>&1` by requiring the `>` to be preceded
 * by whitespace or start-of-string and not followed by `&`.
 */
const SHELL_REDIRECT_RE = /(?:^|\s)>{1,2}(?!&)/;

// ---------------------------------------------------------------------------
// Target extraction
// ---------------------------------------------------------------------------

/** Ordered list of param keys inspected when extracting the target resource. */
const TARGET_PARAM_KEYS = [
  'path',
  'file',
  'url',
  'destination',
  'to',
  'recipient',
  'email',
] as const;

function extractTarget(params: Record<string, unknown>): string {
  for (const key of TARGET_PARAM_KEYS) {
    const val = params[key];
    if (typeof val === 'string' && val.length > 0) {
      return val;
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the registry entry for a tool name using case-insensitive alias
 * matching. Always returns a valid entry — unknown tools return the
 * `unknown_sensitive_action` entry (fail closed).
 */
export function getRegistryEntry(toolName: string): ActionRegistryEntry {
  const key = toolName.toLowerCase();
  return ALIAS_INDEX.get(key) ?? UNKNOWN_ENTRY;
}

/**
 * Maps a tool name to its canonical action class string.
 * Case-insensitive; unknown tools resolve to `'unknown_sensitive_action'`.
 */
export function normalizeActionClass(toolName: string): string {
  return getRegistryEntry(toolName).action_class;
}

/**
 * Fully normalizes a tool call to a `NormalizedAction`.
 *
 * Post-lookup reclassification rules (applied in order):
 *   1. `filesystem.write` with a URL target → reclassified to `web.post`
 *   2. `filesystem.write` with an email address target (contains `@`) →
 *      reclassified to `communication.external.send`
 *   3. Any action class where a param value contains shell metacharacters
 *      → risk raised to `critical`
 *   4. Shell-wrapper tools (`exec`, `bash`, `cmd`, ...) whose `command` param
 *      begins with a destructive Unix command (`rm`, `rmdir`, `unlink`,
 *      `shred`, `trash`, optionally `sudo`-prefixed) → reclassified to
 *      `filesystem.delete`. Lets operators put `filesystem.delete` in HITL
 *      policy and have it actually fire for hosts that expose only a
 *      generic shell-exec tool (e.g. OpenClaw's `exec`).
 *   5. Any tool whose `target` or shell-wrapper `command` references a
 *      well-known credential file path (AWS creds, SSH private keys, kube
 *      config, .env*, /etc/shadow, ...) → reclassified to `credential.read`
 *      or `credential.write`. Write is picked when the starting class is
 *      already `filesystem.write`, when the command uses a shell redirect
 *      (`>`, `>>`), or when the command starts with `cp`/`mv`/`scp`/
 *      `rsync`/`install`/`ln`. Skipped when Rule 4 already reclassified to
 *      `filesystem.delete` — deleting a credential file stays a destructive
 *      fs action.
 *
 * @param toolName  Name of the tool being invoked (case-insensitive).
 * @param params    Tool call parameters used for target extraction and
 *                  parameter-level reclassification.
 */
export function normalize_action(
  toolName: string,
  params: Record<string, unknown> = {},
): NormalizedAction {
  const entry = getRegistryEntry(toolName);

  let action_class = entry.action_class;
  let risk: RiskLevel = entry.default_risk;
  let hitl_mode: HitlModeNorm = entry.default_hitl_mode;
  let intent_group: IntentGroup | undefined = entry.intent_group;
  const target = extractTarget(params);

  // Rule 1: filesystem.write with a URL target → web.post
  if (
    action_class === 'filesystem.write' &&
    (target.startsWith('http://') || target.startsWith('https://'))
  ) {
    const webPostEntry = ALIAS_INDEX.get('http_post') ?? UNKNOWN_ENTRY;
    action_class = webPostEntry.action_class;
    risk = webPostEntry.default_risk;
  }

  // Rule 2: filesystem.write with an email address target → communication.external.send
  if (action_class === 'filesystem.write' && target.includes('@')) {
    action_class = 'communication.external.send';
    risk = 'high';
  }

  // Rule 3: Shell metacharacter detection → critical risk
  if (hasShellMetacharsInParams(params)) {
    risk = 'critical';
  }

  // Rule 4: shell-wrapper tool + destructive command → filesystem.delete
  const toolKey = toolName.toLowerCase();
  const command = params['command'];
  const commandStr = typeof command === 'string' ? command : '';
  if (
    SHELL_WRAPPER_TOOL_NAMES.has(toolKey) &&
    commandStr !== '' &&
    DESTRUCTIVE_SHELL_CMD_RE.test(commandStr)
  ) {
    const deleteEntry = ALIAS_INDEX.get('rm') ?? UNKNOWN_ENTRY;
    action_class = deleteEntry.action_class;
    hitl_mode = deleteEntry.default_hitl_mode;
    intent_group = deleteEntry.intent_group;
    if (risk !== 'critical') risk = deleteEntry.default_risk;
  }

  // Rule 5: reference to a well-known credential path → credential.read / .write
  // Skip when Rule 4 already reclassified to filesystem.delete — a destructive
  // action on a credential file stays filesystem.delete.
  if (action_class !== 'filesystem.delete') {
    const targetHasCredPath = target !== '' && CREDENTIAL_PATH_RE.test(target);
    const commandHasCredPath = commandStr !== '' && CREDENTIAL_PATH_RE.test(commandStr);
    if (targetHasCredPath || commandHasCredPath) {
      const looksLikeWrite =
        action_class === 'filesystem.write' ||
        (commandStr !== '' &&
          (SHELL_REDIRECT_RE.test(commandStr) ||
            CREDENTIAL_WRITE_CMD_RE.test(commandStr)));
      const credAliasKey = looksLikeWrite ? 'write_secret' : 'read_secret';
      const credEntry = ALIAS_INDEX.get(credAliasKey) ?? UNKNOWN_ENTRY;
      action_class = credEntry.action_class;
      hitl_mode = credEntry.default_hitl_mode;
      intent_group = credEntry.intent_group;
      if (risk !== 'critical') risk = credEntry.default_risk;
    }
  }

  return { action_class, risk, hitl_mode, target, ...(intent_group !== undefined && { intent_group }) };
}

// ---------------------------------------------------------------------------
// sortedJsonStringify — canonical serialiser for deterministic SHA-256 hashes
// ---------------------------------------------------------------------------

/**
 * Recursively serialises a value to JSON with object keys sorted
 * alphabetically at every nesting level.
 *
 * Use this instead of `JSON.stringify` whenever computing a deterministic
 * SHA-256 hash over a `Record<string, unknown>` payload so the hash domain
 * is unambiguous regardless of key insertion order.
 */
export function sortedJsonStringify(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) {
    return '[' + value.map(sortedJsonStringify).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const pairs = Object.keys(obj)
    .sort()
    .map((k) => JSON.stringify(k) + ':' + sortedJsonStringify(obj[k]));
  return '{' + pairs.join(',') + '}';
}
