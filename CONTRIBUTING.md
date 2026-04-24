# Contributing to Clawthority

Thanks for your interest. Clawthority is a policy engine that agents rely on to enforce safety — small mistakes have blast radius, so we lean on explicit scope, tests, and a Definition of Done (DoD) suite. This guide gets you from clone to first PR.

## Ways to contribute

- **Bugs**: [open an issue](https://github.com/OpenAuthority/clawthority/issues/new/choose) with a reproduction. Security issues go to [SECURITY.md](SECURITY.md), not public issues.
- **Features**: open a discussion first for anything non-trivial. Rules engine changes in particular deserve a design sketch before code.
- **Docs**: typo fixes and clarifications are always welcome — open a PR directly.
- **Rules / action classes**: new canonical action classes should come with a threat-model note explaining why they deserve their risk tier. See [docs/threat-model.md](docs/threat-model.md) and [docs/action-registry.md](docs/action-registry.md).

## Dev setup

```bash
git clone https://github.com/OpenAuthority/clawthority.git
cd clawthority
nvm use            # matches .nvmrc
npm ci
npm run build
```

Supported Node version is pinned in `.nvmrc` and `engines` in `package.json`. If you hit install issues, try `npm ci` on a clean tree (`rm -rf node_modules package-lock.json` then reinstall) before opening an issue.

## Tests

Three test layers, all required to pass on main:

```bash
npm test              # unit tests (vitest)
npm run test:dod      # Definition-of-Done suite — invariants that must never regress
npm run test:e2e      # end-to-end against a real OpenClaw harness
```

The DoD suite is the one that catches bypasses. If you're changing anything in the capability gate, constraint enforcement, or action registry, your PR should add a DoD test that would have failed without your change. CI runs all three on every PR.

Coverage target: **≥ 85 %** on `src/`. Run `npm run coverage` locally to see hotspots.

## Code style

- TypeScript strict mode — no `any` without a justifying comment.
- Prettier + ESLint run on pre-commit (install hooks with `npm run prepare`).
- Public APIs need JSDoc. Internal helpers don't, but names should carry their weight.
- No new runtime dependencies without discussing in the PR — each `dependencies` addition expands the trust surface of a security tool.

## Commits and PRs

- Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`. CI validates the title.
- One logical change per PR. Multi-topic PRs get asked to split.
- PR description must cover:
  - **What** changed and **why**
  - Threat-model impact (even "none" — state it)
  - Tests added (which layer)
  - Docs updated (or N/A)
- Link the issue the PR resolves. Use `Closes #123` so it auto-closes on merge.

## Release process

Releases are cut from `main`. Version bumps follow SemVer strictly:

- **Patch**: bugfixes, docs, dependency bumps that don't change behavior.
- **Minor**: new rules, new action classes, new optional config keys.
- **Major**: anything that changes rule semantics, default-deny behavior, or the audit log schema. These get a migration note in `CHANGELOG.md`.

`CHANGELOG.md` is the source of truth and is mirrored to GitHub Releases.

## Security

Do not file public issues for vulnerabilities. See [SECURITY.md](SECURITY.md) for the disclosure process. We aim to triage within 48 hours and ship a patch within 7 days for high-severity issues.

## Code of conduct

By participating, you agree to uphold the [Contributor Covenant](CODE_OF_CONDUCT.md). Unacceptable behavior can be reported to the address listed there.

## Questions

[GitHub Discussions](https://github.com/OpenAuthority/clawthority/discussions) is the right channel for design questions, "does this use case fit?" questions, and general architecture chat.
