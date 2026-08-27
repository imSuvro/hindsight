# Architecture

How Hindsight is put together, and — more usefully — which parts are load-bearing
and which are incidental.

The individual decisions and their reasoning live in [`docs/adr/`](adr/). This
document is the map.

---

## The shape of it

One Next.js application. No separate backend, no queue, no cache, one database.

```
Browser ──▶ Vercel (Next.js 16, Node runtime)
                │
                ├─▶ MongoDB Atlas M0
                │     ledger        append-only, hash-chained  ← the record
                │     chain_heads   one per user, CAS target
                │     decisions     projection, derived        ← what the UI reads
                │     notifications send-once claims
                │     practice_answers  the trainer, scored apart
                │     user/session/account/verification  (Better Auth)
                │
                └─▶ Brevo  (review emails)

GitHub Actions (hourly) ──▶ POST /api/jobs/resurface   Bearer CRON_SECRET
```

The interesting structure is not the boxes, it is the layering inside the app:

```
src/lib/domain/     pure. no IO, no framework, no database.
src/lib/schemas/    Zod. the only place types are declared.
src/lib/db/         repositories. the only place Mongo appears.
src/lib/auth/       Better Auth config and session helpers.
src/lib/actions/    server actions. session + validation + one ledger append.
src/app/            routes and pages.
```

`src/lib/domain/` imports nothing from Next.js or MongoDB, and that is enforced by
what is in it rather than by a lint rule: scoring, calibration, binning, intervals,
canonical serialisation, hash chaining, time-zone arithmetic and the ledger fold.
It is the part the product's claim rests on, so it is the part that is separable,
exhaustively property-tested, and runnable anywhere.

---

## The record

### One write path

Every change to a journal is an **append to the ledger**. There is no update
path and no delete path for a locked prediction — not disabled, absent. Three
event types exist:

| Event                | Carries                                                    |
| -------------------- | ---------------------------------------------------------- |
| `decision_locked`    | the prediction: wording, confidence, domain, review moment |
| `decision_resolved`  | the outcome and any closing note                           |
| `review_rescheduled` | a new review moment                                        |

`decisions` is a **projection**: every field in it is derivable from the ledger by
`rebuildDecisions`, a pure fold. It can be dropped and rebuilt. An integration
test asserts the two agree, which is what makes that claim safe to rely on.

### Appending without forking the chain

Each entry carries the SHA-256 digest of the previous entry in the same user's
chain, so two simultaneous appends must not both claim the same predecessor.

```
transaction {
  head = read chain_heads[userId]            ← inside the transaction
  entry = seal(payload, seq = head.seq + 1, prevHash = head.hash)
  compare-and-swap chain_heads[userId] from head.seq → entry.seq
  insert entry into ledger
  apply entry to decisions
}
```

**The order matters.** Claiming the head first means every racer collides on a
single document and is retried by the driver against a fresh head. An earlier
version inserted the ledger entry first, and under twelve concurrent appends
that surfaced as a duplicate-key error on `(userId, seq)` — an error the unique
index can only report, never resolve. The concurrency test in
`tests/integration/ledger.test.ts` is what caught it and is what keeps it fixed.

The unique index on `(userId, seq)` remains as a structural backstop: even if
this logic regressed, two entries could not occupy the same position.

### Guards

Every guard is a **filtered update** rather than a read-then-write, so nothing
can slip between the check and the change:

- locking a decision that exists → duplicate `_id`, transaction aborts
- resolving one that already has an outcome → `matchedCount === 0`
- touching a decision belonging to someone else → filter includes `userId`

Because they run inside the transaction, a refused event leaves **nothing**
behind: no ledger entry, no head movement, no projection change.

---

## Trust

See [ADR-0002](adr/0002-tamper-evidence.md) for the full reasoning. The short
version:

**Detected.** Editing a prediction, changing an outcome, back-dating, reordering,
deleting from the middle, moving an entry between accounts. Any of these breaks
every digest after the change.

**Detected only with an external witness.** Truncating the tail. Any prefix of a
valid chain is itself valid — that is arithmetic, not an oversight. The defence
is that the head digest leaves the database: it is in the interface, in the
footer of every review email, and in every export. A head the user already
received is a witness the operator cannot reach.

**Not addressed.** Whether the user was honest with themselves when they typed
the number. Nothing can check that. The product guarantees only that whatever
they typed is still exactly what they typed.

**Deliberately allowed.** Deleting your own journal, completely and immediately.
Falsifying a record and destroying one are different acts and only the first is a
threat to the person whose record it is.

Verification is available three ways, in increasing order of how little you have
to trust us: in the app, via `GET /api/ledger/verify`, and offline against an
export with `scripts/verify-export.mjs` — twenty lines depending on nothing but
Node's own crypto.

---

## Security posture

**Authentication** is Google and GitHub OAuth only. No passwords, no reset flow,
no magic links, so nothing a user needs depends on email delivery and there is no
credential to steal.

**The proxy is not a security boundary.** `src/proxy.ts` does an optimistic
cookie check to redirect signed-out visitors and generates the CSP nonce, and
that is all. Every page and every handler that touches a journal calls
`getSession` and verifies for itself. This is the class of mistake behind
Auth.js's fail-open advisory, avoided by construction rather than by care.

**Content-Security-Policy** is nonce-based with no `unsafe-inline` for scripts
_or_ styles. That second part has a design consequence: a nonce does not apply to
inline `style` attributes, so no element can carry a computed width. The small
bars in the interface are SVG, where geometry lives in attributes. The cost of
the nonce is that every route renders dynamically; for an app this size that is a
trade worth making, and it is recorded in [ADR-0006](adr/0006-authentication.md).

**Validation** happens at every boundary with Zod, and the TypeScript types are
inferred from those schemas rather than declared beside them, so the two cannot
drift. `any` is banned by lint.

**Rate limiting** is honestly weak — see [Known limitations](#known-limitations).

---

## Scheduled work

Vercel's Hobby cron runs once a day with up to an hour of slop, which cannot
express "hourly", so the schedule lives in GitHub Actions and calls an
authenticated endpoint ([ADR-0004](adr/0004-scheduled-jobs.md)).

That only works because the endpoint does not care when it is called:

- **catch-up**: it asks "what is due and unsent", never "what became due this
  hour", so a missed run delays a notification and cannot lose one;
- **claim before send**: the notification row is written first with a unique key,
  so two overlapping runs cannot both send, and a failed send releases the claim
  for a later retry.

The failure mode is therefore a missed email rather than a duplicate — the right
way round, since the in-app review queue is independent of all of this and always
correct.

---

## Testing

| Layer       | What it holds                              | Where                |
| ----------- | ------------------------------------------ | -------------------- |
| Property    | the arithmetic and the chain               | `tests/unit/`        |
| Integration | concurrency, guards, idempotency, cascades | `tests/integration/` |
| End-to-end  | the loop, the CSP, accessibility, mobile   | `tests/e2e/`         |

The property suites are the ones that matter most. They assert the Murphy
decomposition identity to twelve decimal places, check the Wilson interval
against an independent derivation of the same quantity, demonstrate that stating
your real belief beats shading it, and fuzz single-field mutations across whole
chains to confirm every one is rejected.

Integration tests run against a real MongoDB — an in-memory single-node **replica
set**, because the append is a transaction and a standalone server cannot do
those. End-to-end tests run against a **production build**, because that is the
only configuration where the proxy, the CSP and the real server-action wiring all
apply; a dev-server run would pass while the shipped thing was broken. It has
already caught three defects none of the other layers could see.

---

## Known limitations

- **Rate limiting is decorative.** Serverless invocations share no memory, so
  per-instance throttling is a speed bump, not a control. Durable rate limiting
  needs infrastructure this project does not pay for. Sign-in itself is
  rate-limited by Better Auth.
- **Notification timing is approximate.** GitHub's scheduler runs late by
  15–20 minutes typically, worse occasionally, and disables scheduled workflows
  after 60 days of repository inactivity.
- **Email deliverability is imperfect.** On a free tier with no custom domain,
  Brevo rewrites the sender to an address it can authenticate, and some messages
  will be filtered. Email is a nudge, never a requirement.
- **Better Auth's Mongo adapter transactions are disabled**, because in 1.7.1 the
  wrapper aborts an already-committed transaction and fails every sign-up. The
  ledger's own transactions are unaffected.
- **Atlas M0 caps** at 512 MB, ~100 operations/second, and auto-pauses after 30
  days without a connection — which the hourly job incidentally prevents.
- **Losing both OAuth accounts means losing the journal.** There is no recovery
  path, because adding one would mean adding a way in that is not OAuth.
