<!-- .github/pull_request_template.md -->

## What and why

<!-- One paragraph: what this PR does and why. Link the issue with `Closes #123`. -->

## Threat-model impact

<!-- Required. Even "none — refactor only" is a valid answer. If this changes the
capability gate, constraint enforcement, action registry, or audit log, describe
what adversarial input you considered and why the change is still safe. -->

## Tests

- [ ] Unit tests added/updated (`npm test`)
- [ ] DoD test added for any safety-relevant change (`npm run test:dod`)
- [ ] E2E covers this path (`npm run test:e2e`)
- [ ] N/A — docs-only / chore

## Docs

- [ ] README / docs/ updated
- [ ] CHANGELOG.md entry added
- [ ] N/A

## Checklist

- [ ] Conventional Commit title (`feat:`, `fix:`, `docs:`, …)
- [ ] No new runtime dependencies, or a justifying note in the description
- [ ] `npm run lint` passes
- [ ] Self-review done
