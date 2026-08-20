# Hindsight — build plan (final)

## Context

Greenfield build of **Hindsight**: a private decision journal that locks a
user's prediction (expected outcome + stated confidence %) at the moment of
decision, resurfaces it on a chosen review date, records what actually
happened, and computes calibration over time by life domain. The product's
claim is that memory rewrites original beliefs; Hindsight makes the original
belief permanent and then scores it. Everything rides on two things being
unimpeachable: immutability of the record and correctness of the scoring math.

Fixed by the brief: TypeScript end to end, React, Node.js, MongoDB Atlas, live
public deployment, no AI in the product, no AWS, no paid services. New project
folder: `D:\Personal\hindsight` (career-os is untouched). All gray areas were
researched against current official docs (Aug 2026) and are **decided** below;
the design then survived an adversarial validation pass whose corrections are
baked in.

---

## What the operator must provide (and exactly when)

Nothing hard-blocks before M6 (deploy). Milestones are sequenced so all
build/test work runs credential-free (in-memory Mongo, log-transport email,
test-mode auth).

**Whenever convenient (needed by M6):**

1. **MongoDB Atlas**: free M0 cluster, DB user (readWrite on `hindsight`),
   network access `0.0.0.0/0` (Vercel egress is dynamic; SCRAM creds are the
   control). → `MONGODB_URI`.
2. **Google OAuth client** (Web application) with redirect URIs
   `http://localhost:3000/api/auth/callback/google` and
   `https://<prod-url>/api/auth/callback/google` (exact prod URL supplied
   right after first deploy). → `AUTH_GOOGLE_ID/SECRET`.
3. **GitHub OAuth app ×1** — since 2026-08-14 OAuth apps take up to 10
   callback URLs: register localhost + prod callbacks
   (`…/api/auth/callback/github`), **disable wildcard matching per URI**.
   Fallback if that rollout hasn't reached the account: two apps.
   → `AUTH_GITHUB_ID/SECRET`.
4. **Brevo account** (free, 300 sends/day): verify one sender email address,
   create API v3 key. → `BREVO_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`.

**At M6, one Vercel dashboard session** (the MCP connector has no env-var
tool, so this is an operator step): paste Production env vars — the four
groups above plus my generated `AUTH_SECRET`, `CRON_SECRET`,
`BETTER_AUTH_URL`. Optionally disable Deployment Protection for previews
(preview URLs sit behind Vercel Auth by default; production is public
regardless).

**At M6, one interactive verification**: I cannot type passwords or complete
OAuth consent (safety rules). Either the operator performs one Google + one
GitHub sign-in on the live site, or we drive their logged-in Chrome via the
claude-in-chrome connector with per-click approval in chat.

I generate secrets myself; I set GitHub Actions secrets via `gh secret set`
(scope already present). I cannot create third-party accounts (Atlas, Brevo,
cron-job.org) — those are operator tasks by rule.

---

## Task 1 — environment enumeration & installs

Enumerated via ListSkills, ListPlugins, MCP registry search, session tool
listing. Capability map used by this build: **Vercel MCP connector**
(connected; project creation, deploys, logs, deployment-protection control) —
the deploy path; **`gh` CLI v2.93** authenticated as imSuvro (repo, workflow
scopes) — repo creation, branch protection, PRs, releases, Actions secrets;
**Browser pane** (screenshots, a11y tree, mobile preset, console/network) —
verification; **claude-in-chrome** — operator-session OAuth checks;
**skills**: frontend-design + dataviz (load before chart work),
design:accessibility-review, design:ux-copy, engineering:architecture (ADR
format), engineering:code-review + /security-review before merges. Local:
Node 22.22, pnpm 11.16, git 2.54 on Windows 11. **Installs: none needed** —
the MCP registry has no MongoDB connector (DB inspection = small driver
scripts); everything else (Playwright, Vitest, fast-check,
mongodb-memory-server…) arrives via npm. Cloudflare skills present but unused
(hosting decision below). GitHub MCP plugin exists but needs OAuth; `gh`
makes it redundant.

---

## Architecture (ADR-001 hosting, ADR-004 jobs)

Single **Next.js 16** (App Router, 16.3.x, TS strict, Turbopack default) app
on **Vercel Hobby**, MongoDB Atlas M0 as the only datastore, no separate
backend. Scheduled work via **GitHub Actions cron → authenticated job
endpoint**.

```
Browser (React/RSC) ──> Vercel (Next.js 16: pages + /api route handlers)
                              │            │
                              │            ├── MongoDB Atlas M0 (auth collections,
                              │            │    ledger, decisions view, chain_heads,
                              │            │    notifications)
                              │            └── Brevo API (due notifications)
GitHub Actions (hourly) ──────┘  POST /api/jobs/resurface  (Bearer CRON_SECRET)
```

**Hosting reasoning** (verified Aug 2026): Vercel Hobby = full Node runtime
(official MongoDB driver works; module-scope client reuse), 300s/2GB
functions, no spin-down, production URL public by default, free preview
deploys on PRs. Rejected: Render free (15-min spin-down + ~1-min cold start;
cron is paid), Fly/Railway (no real free tier for new accounts), Cloudflare
Workers free (MongoDB unofficial, pool-less, 10ms CPU cap). Constraints
respected: Hobby is **strictly non-commercial** (no ads/payments/donation
buttons — README carries none), repo must live under the personal account,
runtime logs kept 1h, deployments >30 days old pruned (docs note).

**Jobs reasoning**: Vercel Cron on Hobby is daily-only ±59min — unusable.
GH Actions `schedule` in a public repo is free, 5-min minimum, typically
15–20 min late, occasionally dropped — fine because the endpoint is
**catch-up-capable** (processes everything due since forever) and
**idempotent** (unique index on notifications), so late/missed/double runs
are harmless. `workflow_dispatch` = manual trigger. **Cron fires only from
the default branch**, so `resurface-cron.yml` lands on `main` early (M4),
gated by repo variable `CRON_ENABLED`, flipped on after deploy. 60-day
inactivity auto-disable + optional operator-added cron-job.org second trigger
documented as limitations. In-app due queue works regardless of email/cron.
Hourly DB touches also prevent Atlas M0's 30-day auto-pause.

**Atlas M0 discipline**: the real M0 limit is ~100 ops/sec — every
transaction is exactly 3 writes, resurface scan is index-covered, client is
module-scope cached with `maxPoolSize` ≈ 5–10, `withTransaction()` with a
bounded jittered outer retry.

## Data model

- Better Auth collections (`user`, `session`, `account`, `verification`);
  app fields `timezone` (IANA) + `emailOptIn` via `user.additionalFields`.
- `ledger` — **append-only source of truth** for user assertions:
  `{_id, userId, seq, type ∈ {decision_locked, decision_resolved,
review_rescheduled}, payload, at, prevHash, hash}` with
  `hash = SHA256(canonical({userId, seq, type, payload, at, prevHash}))`,
  genesis `prevHash = SHA256("hindsight/v1/" + userId)`, unique index
  `(userId, seq)`.
- `chain_heads` — `{userId, seq, hash}`, **own collection** (never the
  auth-owned user doc): CAS target for appends; genesis via upsert
  `$setOnInsert` so two first-appends can't both mint genesis.
- `decisions` — materialized view derived from ledger, updated in the same
  transaction. Prediction fields (title, situation, expectedOutcome,
  confidence int 1–99, domain, reviewAt UTC + reviewLocal {date,time,tz})
  written once at lock; resolution ({outcome ∈ happened | did_not_happen |
  unresolvable, notes, resolvedAt}) set once from absent via guarded update;
  status derived. `rebuildDecisionsFromLedger(userId)` — a pure fold — ships
  as a first-class function (verify endpoint + demo fixture use it; it's the
  repair path and makes a non-transactional fallback a config flip).
- `notifications` — `{userId, decisionId, kind, sentAt}`, unique
  `(decisionId, kind)` → idempotent sends.
- Indexes + `$jsonSchema` validators applied by idempotent
  `scripts/db-setup.ts` (run at M2/M6 and by the E2E server wrapper) — never
  `createIndex` in serverless request paths.

**Append algorithm (no chain forks)**: read `chain_heads` → compute
`seq+1`, `prevHash = head.hash`, new hash → transaction { insert ledger doc;
CAS-update chain_heads matched on old seq; abort+retry on CAS miss } — with
unique `(userId, seq)` as structural backstop. Losers surface as CAS miss or
WriteConflict → deterministic retry; the chain cannot fork.

**Domain taxonomy (ADR-007, decided: hybrid)** — five fixed domains (career,
technical, financial, people, personal) are the only calibration axis (keeps
per-domain samples meaningful); optional free-text tags never feed stats.

## Immutability & tamper-evidence (ADR-002, decided: hash-chained append-only ledger)

- No update/delete code paths for ledger docs or locked fields; repos expose
  append + resolve-once only; `$jsonSchema` rejects malformed docs.
- Tamper-**evidence**: per-user SHA-256 chain (above). "Verify my record"
  (UI + `GET /api/ledger/verify`) replays the ledger, recomputes hashes,
  reports first divergence. JSON export includes full ledger + hashes;
  `scripts/verify-export.mjs` (~20 lines, documented in `docs/verify.md`)
  re-verifies outside the app.
- External trust anchor: chain-head hash shown in UI, stamped into every
  notification email footer and every export — copies in the user's inbox
  live outside the DB, so even operator-level rewriting is detectable
  against any previously received head. Honest threat model in docs: this
  **detects** tampering, doesn't prevent it; no blockchain, deliberately.
  Alternatives in ADR: plain audit table (no crypto linkage — rejected),
  Merkle/OpenTimestamps anchoring (deferred, in limitations/roadmap).
- Canonicalization `v1`: deterministic JSON — sorted keys, explicit field
  list, **integers/ISO-strings only (no floats)**; strings NFC-normalized
  **once at the input boundary** (Zod transform) so stored payload and hash
  input are byte-identical.

## Calibration & scoring (ADR-003, decided)

Documented in `docs/calibration.md` + an in-app "How scoring works" page.

- **Brier score** — strictly proper (honesty is the optimal strategy —
  the product must never reward gaming), bounded [0,1], standard in
  forecasting. Log loss rejected: unbounded penalty lets one bad 99% entry
  dominate a history.
- **Murphy decomposition** (reliability − resolution + uncertainty) so
  calibration and discrimination are reported separately; **skill score**
  BSS = 1 − BS/BS_base vs the user's own base rate.
- Confidence: integer 1–99 ("how likely is this outcome?"); UI notes <50
  means you expect it not to happen. Scored as stated, no folding.
- **Binning**: adaptive equal-count quantile bins, K = clamp(⌊n/5⌋, 1, 10),
  ≥5 per bin; reliability diagram plots bin mean confidence vs observed
  frequency with **95% Wilson intervals** (correct at small n).
- **Small-sample honesty as designed UI state**: headline Brier + curve at
  n≥10 resolved; decomposition + BSS at n≥20; per-domain at n≥5/domain.
  Below: progress ("4 of 10 resolved") and individual results, never a
  confident aggregate. `unresolvable` excluded from scoring, always shown
  as a count.

## Auth & security (ADR-006, decided: Better Auth)

- **Better Auth ≥1.7.1**, Google + GitHub `socialProviders` (GitHub scope
  `user:email`), `mongodbAdapter(db, { client })` (client passed →
  transactions work). Chosen over Auth.js v5: Auth.js was absorbed by the
  Better Auth team (Sept 2025) whose announcement recommends Better Auth for
  new projects; v5 is still beta after 3 years with two criticals patched
  only in the latest beta; Better Auth has first-class Mongo (no
  migrations), documented Next 16 integration, and leads downloads. CVE
  cadence managed by: pin latest, Dependabot, and **zero optional _feature_
  plugins** (the advisory cluster lives in oidc-provider/mcp/api-key/device;
  the `nextCookies` framework-glue plugin is the one explicit carve-out).
- Sessions: DB-backed + signed short-lived `cookieCache` (revocable, one DB
  hit per cache expiry; HttpOnly, Secure, SameSite=Lax). State+PKCE OAuth.
  `trustedOrigins` = prod URL + localhost. OAuth won't work on preview
  deploys (unregistered redirect URIs) — stated, not fought.
- Session validated **per route handler / server component**
  (`auth.api.getSession`); `proxy.ts` (Next 16 rename, Node runtime) does
  optimistic redirects + CSP nonce only — never the security boundary.
- **CSP decided, no hedge**: nonce-based CSP generated in proxy; all routes
  render dynamically (the app is small; correctness beats static marketing
  pages). Plus HSTS, X-Content-Type-Options, Referrer-Policy. No trackers.
- Test-only auth for E2E: Better Auth email+password enabled by a **runtime
  gate on platform-controlled env** — `AUTH_TEST_MODE === "1" &&
VERCEL_ENV !== "production"` — with a regression test asserting it
  resolves disabled in production even if `AUTH_TEST_MODE` leaks. (An
  earlier "compile-time excluded" claim was over-promised; this is the
  provable version.)
- Zod-validated env at boot; secrets only in Vercel env + Actions secrets;
  `.env.example` documents all; gitleaks in CI (free on personal repos).
- Data statement (README + docs): stores OAuth profile basics, timezone,
  decision text, hashes — nothing else. Account deletion cascades an
  enumerated list: user/session/account/verification + ledger + decisions +
  chain_heads + notifications (deleting your whole journal is not
  tampering; docs explain why).
- Rate limiting: honestly **decorative** on serverless (fresh isolates) —
  implemented as light per-instance throttle on mutations/jobs, and the
  README says exactly what it is and isn't.
- CSV export: formula-injection guard (`'` prefix on `= + - @` cells).

## Scheduled resurfacing & email (ADR-005: Brevo)

- Review date (+ optional time, default 09:00 — which conveniently never
  lands in real DST transition windows) interpreted in the user's IANA tz;
  UTC instant computed at lock with date-fns v4 + `@date-fns/tz`, both
  stored. **`reviewAt` UTC is authoritative** if tzdb rules change post-lock
  (immutability wins; `reviewLocal` is display metadata).
- GH Actions `schedule: 7 * * * *` + `workflow_dispatch` POSTs with Bearer
  `CRON_SECRET` (constant-time compare). Handler: find due unresolved
  un-notified decisions → send via transport → record notification (unique
  index). Email transport interface `log | brevo` — tests and E2E never
  touch Brevo.
- **Brevo** (free 300/day, single-sender verification, no domain needed;
  official `@getbrevo/brevo` SDK or plain fetch — decided at build).
  Documented caveat: Brevo rewrites free-mail senders to
  `…@NNNN.brevosend.com`; mitigations: From display name "Hindsight",
  Reply-To operator address, spam-folder expectation stated; acceptable
  because email is a nudge (OAuth-only sign-in, no must-receive email; the
  in-app queue is primary). Alternatives in ADR: SMTP2GO (1,000/mo + 25/hr
  caps), Resend (best DX but needs a domain — the ~$10/yr upgrade path if
  the operator ever buys one; not assumed).

## Frontend & design (first-class)

Thesis: **an instrument, not an app** — the product photographs your
judgment; the interface is a precision instrument: calm, exact,
typographically confident, data-dense without clutter. Explicitly avoid the
three stock AI looks (cream+terracotta serif; near-black+acid accent;
broadsheet hairlines). Refined at build with frontend-design + dataviz
skills; tokens as CSS custom properties.

- Typography-led: characterful display + quiet body + tabular mono for
  numbers (numbers are the product).
- Signature element: the **reliability diagram** — hand-built SVG, rendered
  as a **server component** (zero client JS; interactivity, if added, is a
  thin client wrapper), perfect-calibration diagonal as literal reference
  wire, quantile bins with Wilson whiskers, plain-language annotation
  ("when you said 80%, it happened 55% of the time"). Shape+label
  encodings, never color alone; table fallback for every chart.
- Landing teaches the loop in <30s: worked example card flipping belief →
  outcome → score; three steps; no filler copy.
- `/demo`: read-only sample journal from a deterministic committed fixture
  (clearly labeled, signed-out browsable, zero DB writes) — the
  explore-before-committing requirement.
- Post-login: greeting + avatar, review queue, timezone confirmation,
  guided first decision (realistic template starters, confidence slider
  with plain-language anchors), teaching empty states.
- Accessibility as merge gate: keyboard operable, visible focus, labels,
  axe in E2E, prefers-reduced-motion, responsive to mobile.

## Scope (decided)

**In**: core loop, calibration dashboard + domain breakdown, demo journal,
export (JSON full-fidelity + CSV), due-date email + in-app queue,
snooze/reschedule (a visible ledger event — moving _when you look_ is
honest; editing _what you believed_ is not), verify-my-record, account
deletion. **Cut**: sharing (privacy product; audience invites performative
logging), streaks (incentivize junk decisions), weekly digest (volume +
complexity, marginal value), post-lock annotations (roadmap).

## Repo, branching, releases

- `imSuvro/hindsight`, public, personal account (Vercel Hobby requires it).
- Protected `main` and `develop`: PR-only, required status checks (checks
  gate merges; required reviews stay off — solo maintainer can't
  self-approve). **Squash-merge** feature PRs into develop (PR title lint =
  conventional commit; commitlint ignores merge commits); **merge-commit**
  for develop→main release PRs; linear history required on develop only
  (linear-history on main + merge-based releases would fork histories).
- Conventional Commits via commitlint + husky (POSIX sh hooks — Windows-safe
  with Git Bash present); Keep-a-Changelog `CHANGELOG.md`; SemVer; release =
  develop→main PR, tag `v0.1.0`, GitHub Release.
- ADRs 0001–0007 in `docs/adr/` (hosting, tamper-evidence, scoring, jobs,
  email, auth, taxonomy), written as decided, not retrofitted.
- Vercel: git-integration project (created via MCP) with production branch
  `main`; PRs get free preview deploys (behind Vercel Auth unless the
  operator disables preview protection — production is public regardless).

## Repo skeleton

```
hindsight/
├─ .github/workflows/ci.yml            # lint → typecheck → test → build → e2e (names = required checks)
├─ .github/workflows/resurface-cron.yml# 7 * * * * + workflow_dispatch, if vars.CRON_ENABLED
├─ .github/ISSUE_TEMPLATE/ · PULL_REQUEST_TEMPLATE.md
├─ .husky/                             # commit-msg (commitlint), pre-commit (lint-staged)
├─ docs/ plan.md architecture.md calibration.md verify.md adr/0001…0007
├─ scripts/ db-setup.ts                # idempotent indexes + validators
│          e2e-server.mjs              # replset → seed → next start (Playwright webServer)
│          verify-export.mjs           # user-facing external chain verifier
├─ src/proxy.ts                        # CSP nonce + optimistic redirect only
├─ src/app/ (marketing)/page.tsx demo/ (app)/dashboard|decisions|review|settings
│         api/auth/[...all]/ api/decisions[/…] api/ledger/verify api/export
│         api/account/delete api/jobs/resurface layout.tsx globals.css (tokens)
├─ src/lib/domain/  scoring.ts binning.ts wilson.ts canonical.ts chain.ts
│                   timez.ts rebuild.ts        # PURE, no IO
├─ src/lib/schemas/ env.ts ledger.ts decision.ts api.ts   # Zod = types + runtime validation
├─ src/lib/db/      client.ts repos/{ledger,decisions,notifications,chainHead}.repo.ts
├─ src/lib/auth/    auth.ts session.ts test-mode.ts
├─ src/lib/email/   transport.ts (log|brevo) templates.ts
├─ src/components/  charts/ReliabilityDiagram.tsx (server-renderable) ui/ forms/
├─ src/fixtures/demo.ts
├─ tests/unit (property suites) · integration (mms replset) · e2e (Playwright+axe)
└─ configs, README, CHANGELOG, LICENSE(MIT), CONTRIBUTING, SECURITY
```

## Testing & CI

- **Unit (Vitest)** on the pure domain core.
- **Property-based (fast-check)** — the centerpiece: Brier bounds/extremes/
  permutation invariance; Murphy identity (ε); binning partitions exactly,
  monotone edges, min-count; Wilson ⊆ [0,1] ∋ p̂; canonicalization stable
  under key order; chain accepts every honest append and rejects every
  single-field mutation (mutation-fuzzing); tz round-trip property + pinned
  DST cases (spring-forward gap, fall-back ambiguity, both hemispheres,
  Asia/Kathmandu +05:45).
- **Integration (Vitest + mongodb-memory-server)**: `MongoMemoryReplSet`
  (1 node — transactions need a replset), **pinned mongod binary**
  (`MONGOMS_VERSION`) so Windows and CI match, binary cached in CI
  (actions/cache keyed on version), raised hookTimeout for first download.
  Covers repos, transactional append+view, CAS retry under concurrency,
  resolve-once, cron idempotency (run twice → one email), handlers with
  test sessions. (Docker service containers rejected: no Docker on the dev
  machine, replset init pain in CI.)
- **E2E (Playwright)**: `webServer.command = node scripts/e2e-server.mjs`
  (starts replset → db-setup + seed → spawns `next start` with
  `AUTH_TEST_MODE=1`, `EMAIL_MODE=log`) — this sidesteps the
  webServer-before-globalSetup trap. Chromium-only in CI + browser cache.
  Flows: sign-in → onboarding → log → lock (confirm step) → UI+API refuse
  edits → resolve → dashboard numbers correct; demo signed-out;
  keyboard-only pass; axe scans; mobile viewport project.
- **CI**: pnpm/action-setup + store cache; jobs lint → typecheck →
  unit+integration → build → e2e; gitleaks step; concurrency cancellation.
  Required checks on develop + main.

## Milestones (feature branch → PR → develop, unless noted)

- **M0 Bootstrap** — ordered to dodge the protection chicken-and-egg:
  scaffold (create-next-app@16, pnpm, TS strict, ESLint flat config direct —
  Next 16 dropped `next lint` — Prettier, Vitest, Playwright, husky+
  commitlint, lint-staged) + CI workflow pushed **straight to unprotected
  main** → create `develop` → one trivial PR so check names register →
  apply branch protection via `gh api` naming those checks. Docs seeded
  (plan→`docs/plan.md`, ADR stubs, README stub, `.env.example`).
- **M1 Domain core**: schemas; scoring/binning/wilson; canonical/chain;
  timez; rebuild fold — full property suites. Pure, no IO. The product's
  claim, proven first.
- **M2 Data + auth**: Mongo client/repos/db-setup, transactional append
  with CAS, Better Auth config incl. test-mode gate + its regression test,
  env validation, `e2e-server.mjs`. Fully covered by mms — no credentials
  needed (optional live-Atlas smoke if `MONGODB_URI` has arrived).
- **M3 App**: API routes; all pages (landing, demo, log/lock, review,
  dashboard + reliability diagram as RSC, settings incl. export + verify +
  delete); design tokens; empty states; first authed E2E specs.
- **M4 Jobs + email**: resurface endpoint (catch-up, idempotent), transport
  (log|brevo), templates with chain-head footer; **`resurface-cron.yml`
  lands on `main` now, gated off by `CRON_ENABLED`** (cron only runs from
  the default branch — otherwise it'd be dead until v0.1.0).
- **M5 Hardening**: full E2E + axe pass, keyboard pass, visual polish loop
  (screenshots → critique → iterate), /security-review + /code-review.
- **M6 Deploy** — operator gate concentrated here, explicit checklist:
  Vercel project via MCP (git integration, prod branch main) → operator
  pastes env vars in dashboard → I supply exact prod URL for OAuth redirect
  registration → `gh secret set` PROD_URL + CRON_SECRET → flip
  `CRON_ENABLED` → prod smoke: public URL, demo walkthrough signed-out,
  mobile preset via Browser pane, live `workflow_dispatch` cron run + real
  email received + second run sends nothing, `/api/ledger/verify` valid,
  chain-head in email matches UI, axe pass; OAuth sign-in verified with
  operator (constraint above).
- **M7 OSS finish + release**: README (screenshots, live URL, data
  statement, honest limitations incl. decorative rate limiting, cron lag,
  Brevo sender rewrite, M0 quotas; **no donation button** — Vercel Hobby
  non-commercial), CONTRIBUTING, SECURITY, templates, LICENSE (MIT),
  CHANGELOG, develop→main release PR (merge commit), tag `v0.1.0`, GitHub
  Release, final written summary incl. gray-area resolutions + full tool
  enumeration.

## Verification

- Every PR: CI green end to end; domain core property suites at high run
  counts.
- Production (M6 list above) + post-release: confirm tag/Release/CHANGELOG
  coherent, no secrets in history, repo presents as a credible OSS project
  to a cold visitor.
