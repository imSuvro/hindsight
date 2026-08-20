<!--
The PR title becomes the commit message on squash merge, so it must be a valid
Conventional Commit, e.g. `feat(charts): plot Wilson intervals on the diagram`.
-->

## What changed

<!-- One paragraph. What was wrong or missing, and what this does about it. -->

## Why

<!-- The reasoning a reviewer cannot get from the diff. -->

## Checks

- [ ] `pnpm lint` and `pnpm typecheck` pass
- [ ] `pnpm test` passes
- [ ] New behaviour is covered by tests; changes to `src/lib/domain/**` are
      covered by property tests
- [ ] Keyboard operable, labelled for screen readers, and charts do not rely on
      colour alone (if this touches the interface)
- [ ] `CHANGELOG.md` updated under `[Unreleased]` (if user-visible)
- [ ] No secrets, tokens, or real user data anywhere in the diff

## Anything a reviewer should look at closely

<!-- Trade-offs taken, alternatives rejected, or parts you are unsure about. -->
