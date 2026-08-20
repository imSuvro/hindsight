# Contributing to Hindsight

Thanks for looking. This is a small project with a specific point of view, so
this document is mostly about the parts where "obviously fine elsewhere" is not
fine here.

## Getting set up

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

The test suites need no credentials: integration tests start an in-memory
MongoDB replica set, and email runs on a transport that prints instead of
sending. The first integration run downloads a pinned `mongod` binary into
`.cache/`, which takes a minute and then never happens again.

```bash
pnpm test          # unit + integration
pnpm test:e2e      # Playwright, including accessibility scans
pnpm lint
pnpm typecheck
pnpm format
```

## Branching and commits

`main` is the released state. `develop` is the integration branch. Work happens
on short-lived branches off `develop` — `feat/…`, `fix/…`, `docs/…` — and lands
by pull request. Both protected branches require the CI checks to pass.

Commits follow [Conventional Commits](https://www.conventionalcommits.org/), and
a hook checks the message before it is written. Because feature pull requests
are squash-merged, **the pull request title becomes the commit message**, so it
has to be a valid Conventional Commit too:

```
feat(charts): plot Wilson intervals on the reliability diagram
fix(jobs): stop resurfacing a decision that was already resolved
docs(adr): record why the scheduler lives in GitHub Actions
```

Releases go from `develop` to `main` as a merge commit, tagged with a
[semantic version](https://semver.org/), with `CHANGELOG.md` updated in the same
pull request.

## Things that will get a change sent back

**Inventing a number.** Every figure the product shows has to be derivable from
the ledger and covered by a test. If you cannot say where a number comes from,
it does not ship.

**Weakening the small-sample rules.** The display thresholds in
`src/lib/domain/calibration.ts` are the product, not a loading state. A
calibration curve drawn from four decisions is not a weak signal, it is an
invented one, and this is a product whose whole premise is that people flatter
themselves.

**Making a locked prediction editable.** The ledger is append-only. Nothing
mutates a `decision_locked` payload, and no code path updates or deletes a
ledger document. If a feature seems to need one, it needs a new event type
instead, so that the change is visible in the record.

**`any`.** Banned by lint, no exceptions. Every boundary — request bodies,
database reads, environment variables — is validated at runtime with Zod, and
the TypeScript types are inferred from those schemas rather than declared
alongside them.

**Untested arithmetic.** Anything in `src/lib/domain/` needs property-based
tests, not just examples. That directory is where the product's entire claim
lives; examples confirm what you already thought of.

**Inaccessible interface work.** Keyboard operable, labelled for screen readers,
visible focus, and no chart that relies on colour alone. The Playwright suite
runs axe over the main pages, but passing the scan is the floor, not the goal.

## Design notes

Two accent colours carry meaning and are never decorative: **belief** (warm
brass) is what you predicted, **reality** (cool teal) is what happened. They
mean the same two things everywhere they appear. Tokens live in
`src/app/globals.css`; add to that system rather than hard-coding a colour.

## Opening an issue

Bug reports are most useful with the sequence of actions, what you expected, and
what happened instead. If it involves a decision or an outcome, please describe
the shape rather than pasting the content — it is your journal, not ours.

Please do not report security issues in a public issue. See
[SECURITY.md](SECURITY.md).
