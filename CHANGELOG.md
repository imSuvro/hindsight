# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[unreleased]: https://github.com/imSuvro/hindsight/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/imSuvro/hindsight/releases/tag/v0.1.0
