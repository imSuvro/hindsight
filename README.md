# Hindsight

A private decision journal that measures the quality of your judgement over time.

You record a decision before you know how it turns out: what you expect to
happen, and how confident you are as a percentage. The prediction is sealed. On
a date you choose, it comes back and asks what actually happened. Over enough
decisions, Hindsight can tell you something you cannot tell yourself — whether
the things you are 80% sure about happen 80% of the time.

**The product exists because memory rewrites what you originally believed.**
After the fact, everyone remembers having had doubts. Hindsight makes the
original belief permanent and then scores it.

---

## What makes it different from a notes app

- **The prediction is immutable, and provably so.** Every entry is written to an
  append-only ledger where each record carries the SHA-256 digest of the one
  before it. Change any byte of any past entry and every entry after it stops
  verifying. The current digest is shown in the app, printed in every
  notification email and included in every export, so a copy of it lives outside
  the database — which is what makes even operator-level tampering detectable.
  See [ADR-0002](docs/adr/0002-tamper-evidence.md) for the threat model,
  including what this does _not_ cover.
- **The statistics are defensible, and documented.** Scoring uses the Brier
  score with Murphy's decomposition and 95% Wilson intervals, chosen for
  specific reasons that are written down in
  [ADR-0003](docs/adr/0003-scoring-methodology.md).
- **It refuses to show a number it cannot support.** No aggregate appears below
  ten resolved decisions; the breakdown and skill score wait for twenty. Below
  those thresholds the interface reports progress instead of a confident figure
  from four data points.

## Stack

TypeScript end to end. Next.js 16 (App Router) on Vercel, MongoDB Atlas,
Better Auth with Google and GitHub sign-in, Vitest and fast-check for the
domain core, Playwright for end-to-end. No AI anywhere in the product.

Every significant choice has an ADR in [`docs/adr/`](docs/adr/).

## Running it locally

Requires Node 22.12 or later and pnpm 11.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

`.env.example` documents every variable and where to get it. The app validates
its environment at boot and refuses to start half-configured rather than failing
later in a way that is harder to diagnose.

You do not need a database, OAuth credentials or an email provider to run the
test suites — integration tests start an in-memory MongoDB replica set, and
email defaults to a transport that prints instead of sending.

```bash
pnpm test          # unit + integration
pnpm test:e2e      # end-to-end
pnpm lint
pnpm typecheck
```

## Repository layout

```
src/lib/domain/     pure, IO-free core: scoring, calibration, hashing, time
src/lib/schemas/    Zod schemas — the single source of truth for types
src/lib/db/         MongoDB client and repositories
src/lib/auth/       Better Auth configuration and session helpers
src/app/            routes, pages and API handlers
tests/unit/         property-based suites over the domain core
tests/integration/  repositories and handlers against a real MongoDB
tests/e2e/          Playwright, including accessibility scans
docs/adr/           architecture decision records
```

`src/lib/domain/` imports nothing from Next.js or MongoDB. That is deliberate:
the arithmetic the product's entire claim rests on is separable, and it is where
the property tests live.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security issues go through
[SECURITY.md](SECURITY.md), not the public issue tracker.

## Licence

[MIT](LICENSE).
