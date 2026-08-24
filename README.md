# Hindsight

**A private decision journal that measures the quality of your judgement over time.**

[![CI](https://github.com/imSuvro/hindsight/actions/workflows/ci.yml/badge.svg)](https://github.com/imSuvro/hindsight/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)

You record a decision before you know how it turns out: what you expect to
happen, and how confident you are as a percentage. The prediction is sealed. On a
date you choose it comes back and asks what actually happened. Over enough
decisions, Hindsight can tell you something you cannot tell yourself — whether
the things you are 80% sure about happen 80% of the time.

**It exists because memory rewrites what you originally believed.** After the
fact, everyone remembers having had doubts. Hindsight makes the original belief
permanent, and then scores it.

**[Try the sample journal →](https://hindsight-suvros-projects.vercel.app/demo)**
— four years of someone else's decisions, the predictions exactly as sealed,
and the calibration they add up to. No sign-in, nothing saved.
[Screenshots](docs/screenshots/) if you would rather not click.

> **Note on the live deployment.** It runs with no database configured, so the
> landing page, the sample journal and the methodology page work and sign-in
> does not. That is the deployment reporting its own state rather than a fault;
> [docs/deploying.md](docs/deploying.md) covers finishing the setup.

---

## Three things it does that a notes app does not

### The prediction is immutable, and provably so

Every entry goes into an append-only ledger where each record carries the SHA-256
digest of the one before it. Change any byte of any past entry and every entry
after it stops verifying.

The current digest is shown in the app, printed in the footer of every
notification email, and included in every export — so a copy lives outside the
database, which is what makes even operator-level tampering detectable. You can
check it three ways, the last of which requires trusting none of our
code: [in the app, over the API, or offline](docs/verify.md).

There is no update path and no delete path for a locked prediction. Not disabled
— absent.

### The statistics are defensible, and documented

Scoring uses the **Brier score** with **Murphy's decomposition** and **95% Wilson
intervals**. Each of those was chosen for a stated reason and against stated
alternatives ([ADR-0003](docs/adr/0003-scoring-methodology.md), and the same
material [in plain language](docs/calibration.md)).

The Brier score is _strictly proper_, meaning the only way to minimise your
expected score is to report what you actually believe. There is a test that
demonstrates this rather than asserting it, because a rule that could be gamed
would quietly teach people to game it.

### It refuses to show a number it cannot support

No aggregate below ten resolved decisions. No decomposition or skill score below
twenty. No per-domain figure below five in that domain. Below those thresholds
the interface reports progress — not a faded number, not a provisional estimate,
not a curve with an apology under it.

A calibration curve drawn from four decisions is not a weak signal, it is an
invented one, and a product whose premise is that your memory flatters you cannot
flatter you with statistics.

---

## Stack

TypeScript end to end. **Next.js 16** (App Router) on Vercel, **MongoDB Atlas**,
**Better Auth** with Google and GitHub sign-in, **Vitest + fast-check** over the
domain core, **Playwright** end to end. No AI or LLM anywhere in the product, no
analytics, no third-party scripts.

Every significant choice has a record in [`docs/adr/`](docs/adr/):
[hosting](docs/adr/0001-hosting.md) ·
[tamper evidence](docs/adr/0002-tamper-evidence.md) ·
[scoring](docs/adr/0003-scoring-methodology.md) ·
[scheduling](docs/adr/0004-scheduled-jobs.md) ·
[email](docs/adr/0005-email-provider.md) ·
[auth](docs/adr/0006-authentication.md) ·
[taxonomy](docs/adr/0007-domain-taxonomy.md)

---

## Running it locally

Node 22.12+ and pnpm 11.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

**Nothing needs configuring to start.** With an empty `.env.local` you get the
landing page, the sample journal and the methodology page, and the server prints
which features it can actually perform. Each block in `.env.example` unlocks one
more. A variable that is _present but malformed_ still fails hard — missing
means "feature off", wrong means "somebody typed this incorrectly".

**The test suites need no credentials.** Integration tests start an in-memory
MongoDB replica set; email defaults to a transport that prints instead of
sending.

```bash
pnpm test          # unit + integration
pnpm test:e2e      # end-to-end, including accessibility scans
pnpm lint
pnpm typecheck
```

To deploy your own: [docs/deploying.md](docs/deploying.md).

---

## Repository layout

```
src/lib/domain/     pure, IO-free core: scoring, calibration, hashing, time
src/lib/schemas/    Zod — the single source of truth for types
src/lib/db/         MongoDB client and repositories
src/lib/auth/       Better Auth configuration and session helpers
src/lib/actions/    server actions: session, validation, one ledger append
src/app/            routes, pages and API handlers
tests/unit/         property-based suites over the domain core
tests/integration/  repositories and jobs against a real MongoDB
tests/e2e/          Playwright, including axe scans, desktop and mobile
docs/adr/           architecture decision records
scripts/            db-setup, the e2e server wrapper, the offline verifier
```

`src/lib/domain/` imports nothing from Next.js or MongoDB. That is deliberate:
the arithmetic the product's entire claim rests on is separable, and it is where
the property tests live.

More in [docs/architecture.md](docs/architecture.md).

---

## Known limitations

Written down so nobody has to discover them.

- **Rate limiting is best-effort, not a control.** Serverless invocations share
  no memory, so per-instance throttling is a speed bump. Durable rate limiting
  needs infrastructure this project does not pay for. Sign-in itself is
  rate-limited by Better Auth.
- **The hash chain detects tampering; it does not prevent it.** Anyone holding
  the database can rewrite every row and recompute the chain. What defeats that
  is the head digest you already hold, from an email or an export.
- **Truncation of the newest entries is not detectable from the chain alone**,
  because any prefix of a valid chain is itself valid. Same defence: compare
  against a head you were shown earlier. There is a test named after this.
- **Notification timing is approximate.** The scheduler runs 15–20 minutes late
  typically and worse occasionally, and GitHub disables scheduled workflows after
  60 days of repository inactivity. The endpoint is catch-up capable, so lateness
  is the only failure mode — nothing is lost.
- **Email lands in spam sometimes.** On a free tier without a custom domain the
  sender is rewritten to an address the provider can authenticate. Email is a
  nudge; the in-app review queue is the real surface and never depends on it.
- **Better Auth's Mongo adapter transactions are disabled**, because in 1.7.1
  the wrapper aborts an already-committed transaction and fails every sign-up.
  The ledger's own transactions are unaffected.
- **Losing both OAuth accounts means losing the journal.** There is no recovery
  path, because adding one would mean adding a way in that is not OAuth.
- **Selection bias is unmeasurable.** You choose which decisions to record.
  Someone who only logs the ones they feel clever about gets a flattering curve
  and no scoring rule can detect it.
- **It will not deploy to Cloudflare Workers.** Next.js 16 pins the proxy to the
  Node.js runtime and refuses to let it be edge; OpenNext's Cloudflare adapter
  refuses Node.js middleware. Getting past that means deleting the proxy, which
  is where the CSP nonce is generated. Re-tested and written up in
  [ADR-0001](docs/adr/0001-hosting.md).
- **No mobile app, no sharing, no export to other journals.** Sharing and streaks
  were considered and cut — see [Scope](docs/adr/0007-domain-taxonomy.md) and
  CONTRIBUTING.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — particularly the list of changes that
will be sent back, which is shorter and more opinionated than usual.

Security issues go through [SECURITY.md](SECURITY.md), never a public issue.

## Licence

[MIT](LICENSE).
