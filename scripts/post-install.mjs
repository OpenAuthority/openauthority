#!/usr/bin/env node
// Writes data/.installed to signal that plugin install has completed.
// Run this at the end of the install/bootstrap process; its presence gates
// policy activation in src/index.ts (see isInstalled()).
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = resolve(root, "data");
const markerPath = resolve(dataDir, ".installed");
const rulesPath = resolve(dataDir, "rules.json");
const hitlExamplePath = resolve(dataDir, "hitl-policy.yaml.example");

mkdirSync(dataDir, { recursive: true });
writeFileSync(markerPath, new Date().toISOString() + "\n");
console.log("[clawthority] install complete — data/.installed written");

// Secure-by-default: create starter rules.json only on fresh installs.
// Existing files are never overwritten to avoid breaking upgrades.
if (!existsSync(rulesPath)) {
  const starterRules = [
    {
      effect: "forbid",
      action_class: "unknown_sensitive_action",
      priority: 90,
      reason:
        "Actions whose class is not explicitly recognised are withheld pending human approval. " +
        "Configure a HITL policy (hitl-policy.yaml) so an operator can approve or deny each " +
        "request in real time. To permit a specific action class without HITL, add an explicit " +
        "permit rule at a priority lower than 90.",
      tags: ["security", "hitl", "default"],
    },
  ];
  writeFileSync(rulesPath, JSON.stringify(starterRules, null, 2) + "\n");
  console.log(
    "[clawthority] created data/rules.json with secure-by-default configuration"
  );
  console.log(
    "[clawthority]   → unknown_sensitive_action is forbidden at priority 90 until a human approves it"
  );
  console.log(
    "[clawthority]   → add explicit permit rules or configure hitl-policy.yaml to open access"
  );
} else {
  console.log(
    "[clawthority] data/rules.json already exists — skipping (upgrade safe)"
  );
}

// Create a baseline HITL policy example to guide operators.
// Also only written on fresh installs; existing files are left untouched.
const hitlExampleContent = `version: "1"

# Copy this file to hitl-policy.yaml and fill in your credentials.
# Environment variables (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
# SLACK_BOT_TOKEN, SLACK_CHANNEL_ID, SLACK_SIGNING_SECRET) always
# take precedence over values set directly here.

# telegram:
#   botToken: ""
#   chatId: ""

# slack:
#   botToken: ""
#   channelId: ""
#   signingSecret: ""
#   interactionPort: 3201

policies:
  # Gate every unrecognised or sensitive action through Telegram.
  # This policy mirrors the unknown_sensitive_action forbid rule in
  # rules.json: a human must approve before the action proceeds.
  - name: Unknown sensitive actions
    description: >
      Any action whose class is not explicitly permitted falls through to
      this policy. An operator reviews and approves or denies in real time.
    actions:
      - unknown_sensitive_action
    approval:
      channel: telegram
      timeout: 300   # 5 minutes — operator must respond within this window
      fallback: deny # deny if no response (fail-closed)
    tags:
      - security
      - default
`;

if (!existsSync(hitlExamplePath)) {
  writeFileSync(hitlExamplePath, hitlExampleContent);
  console.log(
    "[clawthority] created data/hitl-policy.yaml.example — copy to hitl-policy.yaml and configure credentials"
  );
} else {
  console.log(
    "[clawthority] data/hitl-policy.yaml.example already exists — skipping (upgrade safe)"
  );
}
