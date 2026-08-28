# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.1] — 2026-08-28

An adversarial review of v0.5.0 found seven defects in the calibration trainer.
The first one meant the feature did not work.

### Fixed

- **Only the first question of a session could be answered.** The run read
  `useActionState`'s result to decide whether the *current* question had been
  answered, and that result survives until the component unmounts — so from
  question two onward the controls rendered disabled, the submit button was
  absent, and the previous verdict was still on screen. Exactly one answer per
  page load reached the database, which made the trainer's whole premise, a
  real reading inside one sitting, unreachable.
- **The reliability diagram asserted "No band is meaningfully off the line" to
  every reader.** The chart writes that caption from `insight`, the practice
  page never passed one, and the fallback is a claim about the data rather than
  a neutral default — printed directly beneath a headline saying the reader's
  confidence ran twenty points hot. It was false in essentially every session,
  including for a perfectly calibrated reader.
- The running tally counted submissions rather than stored answers, so a
  refused repeat or a rejected answer inflated it and the figure on screen
  contradicted the reading below it.
- "Another set" linked to the route it was already on, so nothing remounted and
  the finished screen stayed up looking broken.
- A *negative* edge over guessing was reported as "no better than answering 50
  to everything". Worse than a shrug is not the same as equal to one, and that
  reader is the one who most needs telling.
- The chart called practice answers "resolved decisions" in four places — the
  journal's ledger vocabulary, on the page whose promise is that the two are
  kept apart. The noun is now a prop.
- `resolveQuestion` returned whichever id spelling was posted rather than the
  canonical one, so one pair could be stored as two rows and scored twice.
- `/practice` was missing from the proxy's signed-in list. The page still
  refused a signed-out visitor, but the bounce lost the destination, so a
  shared link landed on a bare sign-in.

### Testing

The suite was green through all of the above because every spec answered
exactly one question. A suite that only exercises the first step of a loop is
not testing the loop. Adds specs that walk a whole sitting, check the tally
against what was stored, and assert a fresh question is never pre-filled with
the last one's confidence.

## [0.5.0] — 2026-08-28

### Added

- **A calibration trainer at `/practice`.** The journal says nothing until ten
  decisions have come back and been answered, which takes months. This is the
  other half: two-option questions that already have an answer, asked now and
  scored now, so a real reliability diagram appears inside one sitting.
  - Scored by the same Brier machinery as the journal, joined at the
    dataset-agnostic seam, and kept **entirely apart** from the journal's
    figures and out of the ledger. Knowing which country is larger is not
    knowing how your own decisions turn out.
  - **No fact is authored.** 215 countries pulled from
    [World Bank Open Data](https://data.worldbank.org) by a committed script;
    questions are computed by comparison, so there is no answer key to get
    wrong. The page names its source.
  - **The answer never reaches the browser** — not the id, and not the figures
    either, which would have given it away just as completely. The browser
    posts a question id, a choice and a confidence; the server recomputes the
    answer.
  - Difficulty is spread deliberately. More than half of all country pairs
    differ by over eightfold, so uniform sampling would ask trivia, put every
    answer at 95–99% and collapse the diagram into one corner.
  - A correctness floor of 1.1 makes unanswerable pairs unaskable *and*
    unscoreable — the data really contains ties, and anything a couple of
    percent apart is inside the source's own estimation error.
  - Its own display thresholds, higher than the journal's at 20 and 40: noise
    does not care that practice answers are cheap to produce.
  - Adds a reading the journal cannot offer — **edge over guessing**, against
    the fixed 0.25 that answering 50 to everything scores, which is defined
    from the first session where the skill score is not.

## [0.4.1] — 2026-08-28

### Fixed

- Tables no longer scroll the page sideways on a narrow screen. At 360px the
  five-column domain table pushed `/demo` 13px wider than the viewport, so
  every phone narrower than a Pixel scrolled horizontally. Both tables now
  scroll inside their own container — which reverses the stacking rule
  `DESIGN.md` carried, for a reason recorded in the amendment: these tables
  exist to be compared down a column, and stacking destroys that.
- The horizontal-overflow guard now tests 360px explicitly rather than
  inheriting the mobile project's 412px viewport, and opens every disclosure
  first. That gap is why the bug reached production.

## [0.4.0] — 2026-08-28

The interface, rebuilt on a design system that is written down and enforced.

### Added

- **The Meridian design system** ([`DESIGN.md`](DESIGN.md)). Celestial
  navigation: you take a sighting, commit it, and the true position arrives
  later. The perfect-calibration diagonal is now named — the horizon — and is
  the signature element.
- **An instrument rail** on the dashboard and review screens, carrying the
  current reading alongside the work. Both screens previously stranded their
  content in the top-left quadrant of a wide viewport.
- **The reliability diagram's empty frame.** Below the display threshold the
  dashboard draws the instrument with nothing on it, rather than a paragraph
  explaining its absence. No data is plotted, so the thresholds in
  `docs/calibration.md` are untouched.
- **`scripts/palette-check.mjs`**, which recomputes every contrast,
  colour-blindness and chroma claim in `DESIGN.md` from the hex values, and
  fails the build if any component sets text in a data-mark colour. Runs in CI.
- Surface primitives (`Card`, `EmptyState`, `RailPanel`, `Skeleton`), a width
  scale, and a danger button variant.
- End-to-end coverage for the second half of the core loop — reading a due
  decision and recording what happened — which had none, because review dates
  are forward-only and nothing can become due inside a test run.
- Per-route smoke tests, a horizontal-overflow guard, and fifteen edge-case
  probes over injection, unicode, boundaries, unknown ids and the CSV guard.

### Changed

- Type is now Fraunces, IBM Plex Sans and IBM Plex Mono.
- The onboarding panel adapts to whether decisions exist. It could previously
  read "Write my first decision" directly beneath "3 decisions recorded".
- The timezone line reads as a confirmation with an escape hatch rather than a
  discrepancy to resolve.
- One name per action: "Record a decision" throughout, "Start a journal" for
  signed-out calls to action.
- The domain table no longer renders five rows of zeroes before anything has
  been answered.

### Fixed

- `hidden` now actually hides. Its user-agent rule sits at the lowest possible
  specificity, so a component setting `display` defeated it — which left the
  whole editable form on screen above "This is what gets sealed", the one
  irreversible moment in the product.
- Text is no longer set in `--belief` or `--reality`. Those are tuned to the
  3:1 bar that graphics clear, not the 4.5:1 bar that words clear; seven files
  were relying on the old palette happening to clear both.
- "Review before locking" now names the field that is still missing. A disabled
  control with no stated reason is a dead end, and a screen reader announces
  only "dimmed".
- An entirely empty review queue no longer stacks two empty states at two
  different widths.

## [0.3.0] — 2026-08-27

### Added

- SMTP2GO as an alternate email transport alongside Brevo (`EMAIL_MODE=smtp2go`,
  `SMTP2GO_API_KEY`), so a Brevo outage or signup issue doesn't block getting
  review notifications working. Same interface, same free-without-a-domain
  constraint. See [ADR-0005](docs/adr/0005-email-provider.md).

## [0.2.0] — 2026-08-24

### Changed

- The app now runs in a degraded-but-functional mode with zero configuration
  instead of refusing to start. Every credential is optional; each feature
  reports its own availability, and a variable that is present but malformed
  still fails hard. This is what let a Vercel-connector-created project (which
  starts with an empty environment, since the connector has no tool for setting
  environment variables) build and serve at all.
- Published the live production URL and the sample journal link.
- Recorded, with evidence, why the app cannot currently deploy to Cloudflare
  Workers — see [ADR-0001](docs/adr/0001-hosting.md).

## [0.1.0] — 2026-08-21

First release. The core loop works end to end, the record is tamper-evident, and
the arithmetic is covered by property tests.

### Added

**The loop**

- Record a decision with an expected outcome and a stated confidence of 1–99%,
  seal it, and have it come back on a date you choose.
- A confirmation step before locking that shows exactly what becomes permanent.
- Review queue, outcome recording with a third option for decisions that cannot
  honestly be settled either way, and rescheduling that is itself recorded.
- Five fixed domains for scoring plus free-text tags that never feed the maths.

**The record**

- Append-only ledger, hash-chained per account with SHA-256 over a deterministic
  canonical form. No update or delete path exists for a locked prediction.
- Compare-and-swap append inside a transaction, so concurrent writes cannot fork
  a chain; a unique index on `(userId, seq)` sits underneath as a backstop.
- "Check my record" in the app, `GET /api/ledger/verify`, and
  `scripts/verify-export.mjs` for offline verification that needs nothing but
  Node's own crypto.
- The chain head is published in the interface, in every review email and in
  every export, so a witness exists outside the database.
- JSON export carrying the full ledger with digests, and a flat CSV with a
  formula-injection guard.

**The measurement**

- Brier score, Murphy's decomposition and a skill score against the account's own
  base rate.
- Reliability diagram with adaptive equal-count bins and 95% Wilson intervals,
  rendered as a server component with no client JavaScript.
- Per-domain breakdown.
- Display thresholds — ten resolved decisions for any aggregate, twenty for the
  decomposition and skill score, five per domain — with progress shown instead of
  a number below them.

**Everything around it**

- Google and GitHub sign-in. No passwords, no reset flow, no magic links.
- Immediate and complete account deletion.
- Hourly resurfacing driven from GitHub Actions against a catch-up-capable,
  idempotent endpoint, with review emails through Brevo.
- A sample journal at `/demo`, browsable signed out, built from real sealed
  ledger entries so it cannot drift from how the product behaves.
- Nonce-based Content-Security-Policy with no `unsafe-inline` for scripts or
  styles, HSTS, and the usual hardening headers.
- Seven architecture decision records, a written calibration methodology, a
  verification guide and a deployment runbook.

### Security notes

Four hardening items found during the build, none of them user-facing bugs but
all worth recording:

- The post-sign-in redirect is validated by allowlist rather than blocklist. The
  earlier version rejected `//evil.com` but allowed `/\evil.com`, which several
  browsers read as protocol-relative.
- Server-action modules export writes only. A read helper left in one was
  reachable as an endpoint despite being unreferenced.
- `X-Powered-By` is off; there is no reason to announce the framework and
  version to an automated scan.
- Better Auth's Mongo adapter transactions are disabled, because in 1.7.1 the
  wrapper aborts an already-committed transaction and fails every sign-up.

### Known limitations

Listed in full in the [README](README.md#known-limitations). The ones worth
repeating: rate limiting is best-effort rather than a control; notification
timing is approximate; the hash chain detects tampering rather than preventing
it, and cannot detect truncation of the newest entries without an external
witness.

[unreleased]: https://github.com/imSuvro/hindsight/compare/v0.5.1...HEAD
[0.5.1]: https://github.com/imSuvro/hindsight/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/imSuvro/hindsight/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/imSuvro/hindsight/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/imSuvro/hindsight/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/imSuvro/hindsight/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/imSuvro/hindsight/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/imSuvro/hindsight/releases/tag/v0.1.0
