# OpenClaw Action Taxonomy

> **Status: frozen v1**
>
> This taxonomy is locked as a stable contract for the implementation phase. The action class names, risk defaults, HITL defaults, and intent groups defined here are **immutable** until a formal RFC is approved.
>
> **Change control:** Any modification to this taxonomy — adding a class, removing a class, renaming a class, changing a risk level, or changing an intent group assignment — requires an approved RFC. Submit an RFC to the governance track before making changes to `packages/action-registry/src/index.ts` or this document.

---

## Overview

Every tool call an agent makes is normalized to a canonical **action class** before policy evaluation. The taxonomy defines 26 action classes organized into functional namespaces.

The frozen v1 taxonomy is the source of truth for:
- Policy authoring (`action_class` and `intent_group` values in YAML rules)
- Tool manifest declarations (`action_class` field in `ToolManifest`)
- HITL enforcement (default `risk_tier` and `default_hitl_mode` alignment requirements)

---

## Frozen Action Class Table

| # | Action Class | Namespace | Risk | HITL Mode | Intent Group |
|---|---|---|---|---|---|
| 1 | `filesystem.read` | filesystem | low | none | — |
| 2 | `filesystem.write` | filesystem | medium | per_request | — |
| 3 | `filesystem.delete` | filesystem | high | per_request | `destructive_fs` |
| 4 | `filesystem.list` | filesystem | low | none | — |
| 5 | `web.search` | web | medium | per_request | — |
| 6 | `web.fetch` | web | medium | per_request | `data_exfiltration` |
| 7 | `web.post` | web | medium | per_request | `web_access` |
| 8 | `browser.scrape` | browser | medium | per_request | — |
| 9 | `shell.exec` | shell | high | per_request | — |
| 10 | `communication.email` | communication | high | per_request | `external_send` |
| 11 | `communication.slack` | communication | medium | per_request | `external_send` |
| 12 | `communication.webhook` | communication | medium | per_request | `external_send` |
| 13 | `memory.read` | memory | low | none | — |
| 14 | `memory.write` | memory | medium | none | — |
| 15 | `credential.read` | credential | high | per_request | `credential_access` |
| 16 | `credential.write` | credential | critical | per_request | `credential_access` |
| 17 | `code.execute` | code | high | per_request | — |
| 18 | `payment.initiate` | payment | critical | per_request | `payment` |
| 19 | `vcs.read` | vcs | low | none | — |
| 20 | `vcs.write` | vcs | medium | per_request | — |
| 21 | `vcs.remote` | vcs | medium | per_request | — |
| 22 | `package.install` | package | medium | per_request | — |
| 23 | `build.compile` | build | medium | per_request | — |
| 24 | `build.test` | build | low | none | — |
| 25 | `build.lint` | build | low | none | — |
| 26 | `unknown_sensitive_action` | — | critical | per_request | — |

---

## Namespaces

| Namespace | Action Classes | Description |
|---|---|---|
| `filesystem` | read, write, delete, list | Local filesystem operations |
| `web` | search, fetch, post | Outbound HTTP and search operations |
| `browser` | scrape | DOM-based content extraction |
| `shell` | exec | OS shell command execution |
| `communication` | email, slack, webhook | External messaging channels |
| `memory` | read, write | Agent-internal memory storage |
| `credential` | read, write | Secrets store access |
| `code` | execute | In-process code execution |
| `payment` | initiate | Financial transaction initiation |
| `vcs` | read, write, remote | Version control system operations |
| `package` | install | Dependency installation |
| `build` | compile, test, lint | Build pipeline operations |

---

## Intent Groups

Intent groups allow policy rules to target multiple action classes with a single rule.

| Intent Group | Member Action Classes | Policy use |
|---|---|---|
| `destructive_fs` | `filesystem.delete` | Block all deletion tools |
| `data_exfiltration` | `web.fetch` | Forbid outbound HTTP fetch operations |
| `web_access` | `web.post` | Gate state-mutating outbound HTTP calls |
| `external_send` | `communication.email`, `communication.slack`, `communication.webhook` | Block all external messaging channels |
| `credential_access` | `credential.read`, `credential.write` | Prevent all secrets store access |
| `payment` | `payment.initiate` | Block financial transactions |

---

## Risk Level Definitions

| Risk Level | Meaning |
|---|---|
| `low` | Read-only or purely local operations with no side effects visible outside the agent |
| `medium` | Writes or outbound calls that have side effects but are bounded and recoverable |
| `high` | Irreversible or externally visible actions — data loss, external communication, or shell access |
| `critical` | Actions with financial, security, or system-wide impact — no safe default |

---

## HITL Mode Definitions

| HITL Mode | Behavior |
|---|---|
| `none` | Action proceeds without an approval token — no HITL check performed |
| `per_request` | Every invocation requires a fresh approval token bound to the specific payload |
| `session_approval` | One approval covers all matching actions for the duration of the session |

---

## Fail-Closed Sentinel

`unknown_sensitive_action` is the fail-closed catch-all. Any tool name not present in the alias registry resolves to this class with `critical` risk and `per_request` HITL. It has no registered aliases — it is the result of a failed lookup, not a named tool.

---

## Change Control Process

This taxonomy is frozen at v1. The action class names, namespace structure, risk defaults, HITL defaults, and intent group assignments listed above are **immutable** for the implementation phase.

### When an RFC is required

An RFC is required before any of the following changes can be made:

- **Adding** a new action class or namespace
- **Removing** an existing action class
- **Renaming** an action class or namespace
- **Changing** the `default_risk` of any action class
- **Changing** the `default_hitl_mode` of any action class
- **Adding, removing, or reassigning** an intent group
- **Changing** the `unknown_sensitive_action` sentinel behavior

Changes that do **not** require an RFC (alias-level changes only):

- Adding or removing tool name aliases for an existing action class (aliases are not part of the frozen contract)

### RFC process

1. Open an RFC issue in the governance track describing the proposed change, the motivation, and the impact on existing policy rules and tool manifests.
2. Obtain approval from the governance track maintainers.
3. Update this document and `packages/action-registry/src/index.ts` in the same PR.
4. Bump the taxonomy version header in this document (e.g., `frozen v2`).

> **Implementation note:** The RFC process implementation is tracked separately in the governance track. Until that process is in place, changes require explicit approval from the project maintainers via a PR review.

---

## Relation to Other Documents

- **`docs/action-registry.md`** — Full operational reference: alias tables, reclassification rules, HITL approval mode comparison, policy authoring guide, and per-class rationale. Consult this for implementation details.
- **`packages/action-registry/src/index.ts`** — Machine-readable source of truth. Must stay in sync with the frozen table above.
- **`docs/tool-schema-standard.md`** — F-05 standard for tool manifests. The `action_class` field in every manifest must use a class from this taxonomy.
