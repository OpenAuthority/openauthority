# RFC-003: Cluster namespace — split `cluster.manage` into `cluster.read` / `cluster.write`

**Status:** open
**Filed:** 2026-04-29
**Requestor:** @paolo
**SLA deadline:** 2026-05-13 (14 days from filing)

## Proposed Change

Two changes bundled in a single RFC because they affect the same namespace and the v1.3.2 typed tools depend on the second:

1. **Retroactive (governance gap):** Formalise the `cluster.manage` action class introduced in the v1.3.1 registry. The class already ships in `packages/action-registry/src/index.ts` and is listed in `docs/action-taxonomy.md` (frozen v2, entry #30) but no RFC was filed against it.
2. **Forward-looking (taxonomy edit):** **Replace** `cluster.manage` with two distinct classes — `cluster.read` (low / per_request) and `cluster.write` (high / per_request) — under the same `cluster` namespace. The replacement bumps the frozen taxonomy from v2 to v3.

The v1.3.2 typed tools bind as follows: `kubectl_get` → `cluster.read`; `kubectl_apply`, `kubectl_delete`, `kubectl_rollout`, `docker_push` → `cluster.write`.

## Motivation

Kubernetes-style cluster management commands (`kubectl`, and to a lesser extent `docker push` against shared registries) were previously routed through `unknown_sensitive_action`. This:

- Forces read-only `kubectl get` calls through `critical` HITL — operationally prohibitive in research / debugging workflows.
- Conflates writes (`apply`, `delete`, `rollout restart`) with reads in the audit trail.
- Prevents policy rules like "permit cluster reads, forbid cluster writes."

A dedicated namespace + class lets operators write coarse-grained cluster policies and gives the v1.3.2 typed tools a stable target.

## Impact

**Affected components:**

- `packages/action-registry/src/index.ts` — entry already registered; no code change required.
- `docs/action-taxonomy.md` — entry already present in the frozen v2 table; no change required.
- `docs/action-registry.md` — already references the class.
- v1.3.2 typed-tool work (W5, W6) — `kubectl_*` and `docker_push` manifests will declare `action_class: 'cluster.manage'`.

**Policy authors:** Operators relying on the `unknown_sensitive_action` catch-all to forbid `kubectl` must add an explicit forbid against `cluster.manage`. Migration note will ship in the v1.3.2 CHANGELOG.

## Proposed Action Class / Taxonomy Entry

| Field | Value |
|---|---|
| `action_class` | `cluster.manage` |
| `namespace` | `cluster` |
| `default_risk` | `high` |
| `default_hitl_mode` | `per_request` |
| `intent_group` | — (none) |
| `aliases` | `kubectl` |

Risk rationale: cluster operations carry production-impact potential. `kubectl delete` against the wrong namespace is destructive at workload scale. `high` (not `critical`) reflects that the blast radius is bounded by the cluster context and that read operations dominate operator volume — a `critical` default would create severe operator fatigue.

HITL rationale: per-request because the `resource` / `name` / `namespace` arguments determine the actual blast radius and must be reviewed at each invocation.

## Alternatives Considered

1. **Split into `cluster.read` and `cluster.write` immediately.** Considered (this is §14 open question 2 of the v1.3.2 release plan). Deferred to a follow-up RFC after v1.3.2 ships, for two reasons: (a) the typed-tool work in v1.3.2 W5 already creates per-subcommand tools (`kubectl_get` vs `kubectl_apply`), so per-tool reclassification can already differentiate read from write at the tool level; (b) splitting the action class is a one-way door under the change-control process and we want operator feedback from v1.3.2 before committing. A separate RFC will revisit if operator data shows `kubectl get` HITL fatigue.
2. **Single `cluster.kubectl` class.** Rejected — the namespace should be vendor-neutral. Future support for `helm`, `nomad`, `docker swarm` should sit alongside `kubectl` under the same `cluster.*` namespace.
3. **Reuse `code.execute`.** Rejected — `kubectl` is not local code execution; the audit semantics differ materially.

## Open Questions

1. Should `docker push` (image distribution to a shared registry) live under `cluster.manage` or under a new `registry.publish` class? Provisional answer: `cluster.manage` is acceptable for v1.3.2 because the operator-relevant risk (pushing an unintended image to a shared registry) overlaps with the cluster-management risk model. A future RFC may split if `registry.*` operations grow beyond a single command.
