# ADR-0004: Drive resurfacing from a GitHub Actions schedule

**Status:** Accepted
**Date:** 2026-08-20
**Deciders:** Suvra Samajder

## Context

A decision journal that never brings decisions back is a diary. Resurfacing is
the mechanism, so something has to run on a schedule, notice what has come due
in each user's own time zone, and send a notification.

[ADR-0001](0001-hosting.md) puts the app on Vercel Hobby, where the built-in
cron runs **once per day** and fires anywhere within a one-hour window.
Sub-daily expressions fail at deploy time. Something else has to trigger the
work.

## Decision

A **GitHub Actions scheduled workflow** in this public repository POSTs to
`/api/jobs/resurface` every hour, authenticating with a bearer `CRON_SECRET`
compared in constant time.

```yaml
on:
  schedule:
    - cron: "7 * * * *" # offset from the hour; the top of the hour is congested
  workflow_dispatch: # manual trigger, and the escape hatch
```

The endpoint is **catch-up capable** and **idempotent**, which is what makes an
unreliable scheduler acceptable:

- _Catch-up_: it processes everything due since the beginning of time that has
  not been notified, not "everything due in the last hour". A missed run delays
  a notification; it never loses one.
- _Idempotent_: a unique index on `(decisionId, kind)` in `notifications` means
  a duplicate or overlapping run cannot send a second email.

## Options considered

| Option                         | Verdict                                                                                                                                                                                                                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GitHub Actions schedule**    | Chosen. Free for public repositories with no minute quota, 5-minute minimum interval, lives beside the code, and `workflow_dispatch` gives a manual trigger                                                                                                                                                    |
| Vercel Cron on Hobby           | Rejected. Daily only, ±59 minutes. Cannot express hourly at all                                                                                                                                                                                                                                                |
| Cloudflare Worker Cron Trigger | Rejected as unnecessary. Free plan allows every minute and would work as a pinger, but it adds a second platform, a second deployment and a second set of secrets to solve a problem GitHub already solves                                                                                                     |
| cron-job.org                   | Not shipped, but documented. Free, one-minute resolution, and registering the same URL there gives a second independent trigger. Because the endpoint is idempotent, double firing is harmless. It needs an account the operator must create, so it is an optional addition rather than part of the deployment |

## Known weaknesses, and what absorbs them

**GitHub's scheduler is best-effort.** Its own documentation says runs may be
delayed under load, especially at the top of the hour, and that queued jobs may
be dropped. Community reports cluster around 15–20 minutes of lag with worse
outliers.

This is tolerable because the product's cadence is days to months, not minutes,
and because catch-up semantics mean lateness is the only failure mode. It is
stated in the README rather than hidden.

**Scheduled workflows only run from the default branch.** The workflow file must
be on `main` before the schedule ever fires — including during pre-release
verification, when `main` has not yet received a release. It is therefore landed
on `main` early and gated by a repository variable:

```yaml
if: vars.CRON_ENABLED == 'true'
```

so it exists, can be dispatched manually, and stays inert until the production
deployment is ready for it.

**Scheduled workflows are disabled after 60 days of repository inactivity.**
Real, documented, and unavoidable on a free public repository. Mitigations: the
in-app review queue is independent of email and always correct, so a dormant
scheduler degrades the product rather than breaking it; the optional
cron-job.org trigger is unaffected; and the limitation is in the README.

**The in-app queue is the primary surface.** Email is a nudge. Sign-in is
OAuth-only, so no email is ever required to use the account. If email delivery
and the scheduler both fail completely, a user who opens the app still sees
exactly what is due.

## Consequences

**Easier.** No extra platform, no extra bill, no cron primitive to emulate. The
job is a plain HTTP endpoint, so it can be triggered manually, tested with
`curl`, and covered by integration tests with no scheduler involved.

**Harder.** Notification timing is approximate. Two secrets now live in two
places (Vercel for the app, GitHub Actions for the caller). Anyone can see the
endpoint exists, so it must be secured on its own rather than by obscurity —
hence the bearer secret and the constant-time comparison.

**Incidental benefit.** Hourly traffic keeps the Atlas M0 cluster from
auto-pausing after 30 days of inactivity.

**To revisit.** If timing precision ever matters, the answer is a paid cron or a
Cloudflare Worker trigger, not a redesign of the endpoint — the endpoint's
contract is deliberately independent of what calls it.
