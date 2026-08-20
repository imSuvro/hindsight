# ADR-0001: Host on Vercel Hobby with MongoDB Atlas M0

**Status:** Accepted
**Date:** 2026-08-20
**Deciders:** Suvra Samajder

## Context

Hindsight must run at a live public URL, be written in TypeScript end to end
with React and Node.js, store data in MongoDB Atlas, and cost nothing. It also
needs to run a recurring job (see [ADR-0004](0004-scheduled-jobs.md)). AWS is
excluded. Free tiers move constantly, so every claim below was checked against
vendor documentation in August 2026 rather than recalled.

The binding constraint is not traffic — this is a personal journal with a
handful of writes a day. It is that the app must hold an outbound TCP
connection to MongoDB using the official driver, must be reachable without a
login wall, and must not go to sleep between visits, because a product about
returning to old decisions is worthless if the first visit after a fortnight
takes a minute to load.

## Decision

Deploy a single Next.js application to **Vercel Hobby**, with **MongoDB Atlas
M0** as the only datastore, connected with the official `mongodb` Node driver
from a module-scope client.

## Options considered

### Vercel Hobby — chosen

| Dimension       | Assessment                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| MongoDB driver  | Full Node.js runtime; official driver works; MongoDB publishes a first-party Atlas–Vercel integration             |
| Cold start      | None. No spin-down on inactivity                                                                                  |
| Function budget | 300s duration, 2 GB memory on Hobby — far beyond what is needed                                                   |
| Public URL      | Production is public by default. Hobby _cannot_ put production behind Vercel Authentication even if you wanted to |
| Cost            | Free: 100 GB transfer, 1M invocations, 4 CPU-hours per month                                                      |
| Cron            | Daily only, ±59 minutes — unusable, hence ADR-0004                                                                |

**Constraints accepted:** Hobby is restricted to non-commercial personal use.
Ads, payment collection, affiliate links and **donation buttons** all breach
it, so this repository carries no funding link and the README carries no
sponsor badge. The Git repository must live under a personal account rather
than an organisation. Runtime logs are retained for one hour, and deployments
older than 30 days are pruned.

### Render free — rejected

Free web services spin down after 15 minutes of inactivity and take about a
minute to come back. That is precisely the visit pattern Hindsight has. Render
Cron Jobs are not available on the free tier at all — they bill per second with
a $1/month minimum — so it would not have solved the scheduling problem either.

### Cloudflare Workers free — rejected

`node:net` and TLS sockets do work in workerd now, and the MongoDB driver can
be coaxed into running. But MongoDB publishes no support statement for it,
Cloudflare's own "connect to databases" documentation lists no MongoDB path,
there is no cross-invocation connection pooling without building a Durable
Object in front of it, and the free plan caps CPU at 10 ms per invocation —
which a cold TLS handshake plus SCRAM authentication can exceed on its own.
Attractive for the cron trigger, unsuitable as the data layer.

### Fly.io and Railway — rejected

Neither has a free tier for new accounts in 2026. Fly offers a trial of two VM
hours or seven days; Railway offers a one-time $5 credit and then charges. Both
fail the hard "no paid services" constraint.

## Consequences

**Easier.** One deployable unit, one language, no container to maintain.
Vercel's Git integration gives a preview deployment per pull request at no
cost. Hourly job traffic incidentally keeps the Atlas cluster from
auto-pausing after 30 days of inactivity.

**Harder.** Scheduling has to be solved outside the platform. Rate limiting
cannot be durable, because serverless invocations share no memory — the
implementation is best-effort and the README says so plainly rather than
implying protection it does not have. Atlas M0 throttles at roughly 100
operations per second and offers no private networking, so the IP access list
must be `0.0.0.0/0` and SCRAM credentials are the real control.

**To revisit.** If the project ever takes money in any form, Hobby is breached
and this decision has to be reopened. If Atlas M0's 512 MB or the 100 ops/sec
ceiling ever bind, the datastore moves before the host does.

## Working within the constraints

- One `MongoClient` at module scope, reused across warm invocations, with
  `maxPoolSize` held small so warm-instance fan-out cannot approach Atlas M0's
  500-connection cap.
- Every ledger append is exactly three writes inside one transaction.
- The resurfacing scan is served entirely by an index.
