# ADR-0002: Make the record tamper-evident with a per-user hash chain

**Status:** Accepted
**Date:** 2026-08-20
**Deciders:** Suvra Samajder

## Context

Hindsight exists because memory rewrites what you originally believed. If the
app cannot demonstrate that a stored prediction is the one that was made, it
has reproduced the problem it was built to solve — only now with a database
lending it false authority.

A disabled edit button is not enough. The user has to be able to satisfy
themselves that nothing changed, including by someone with database access,
including the person operating the service.

## Decision

The `ledger` collection is **append-only** and every entry carries the SHA-256
digest of the previous entry in the same user's chain:

```
hash = SHA256(canonical({
  at, canonicalVersion, chainVersion, payload, prevHash, seq, type, userId
}))
```

The first entry's `prevHash` is `SHA256("hindsight/v1/genesis/" + userId)`, so
chains cannot be spliced between accounts. Serialisation is defined by
`src/lib/domain/canonical.ts` — sorted keys, integers only, strings normalised
once at the input boundary — because a hash is only as trustworthy as the bytes
it covers, and `JSON.stringify` preserves insertion order, which means the same
logical record can produce two different digests.

The `decisions` collection is a **projection**, rebuildable from the ledger by a
pure fold (`rebuildDecisions`). The ledger is the record; everything else is a
cache of it.

Three things make this observable rather than merely true:

1. **Verification is a feature.** `GET /api/ledger/verify` replays the chain,
   recomputes every digest, and reports the first divergence.
2. **The head leaves the building.** The current head digest is shown in the
   interface, printed in the footer of every review email, and included in
   every export. Copies sitting in the user's inbox are outside the operator's
   reach.
3. **Verification does not require trusting the app.** Exports carry the full
   ledger with digests, and `scripts/verify-export.mjs` re-checks them offline
   in about twenty lines of code the user can read.

## Options considered

### Hash chain — chosen

Cheap (one SHA-256 per write), self-contained, no external dependency, and it
localises damage: verification reports _which_ entry diverged, not merely that
something is wrong.

### Plain audit table — rejected

An `audit_log` collection recording each change has no cryptographic linkage,
so anyone who can edit the record can edit the audit of it just as easily. It
documents honest history and is worthless against the threat that matters.

### Merkle tree with external timestamping — deferred

Anchoring periodic roots to OpenTimestamps or a public ledger would add proof
of _when_ an entry existed, not only that it is internally consistent. It is
strictly stronger and it is the natural next step. It is deferred because it
adds an external dependency, a scheduled anchoring job and a second failure
mode, for a gain that mostly matters if a third party is being asked to believe
the record. Recorded in the README's known limitations.

### Blockchain — rejected

Adds cost, latency and an external dependency, and publishes a fingerprint of a
private journal to a permanent public record. Wrong instrument for a privacy
product.

## What this does and does not defend against

**Detected.** Editing a stored prediction, changing a recorded outcome,
back-dating an entry, reordering entries, deleting an entry from the middle of
the chain, moving an entry between accounts, and rewriting the whole chain — the
last of these only if the user still holds any previously published head, which
is why the head is emailed and exported.

**Not detected by the chain alone.** Truncating the tail of a chain: any prefix
of a valid chain is itself a valid chain. This is a property of hash chains, not
an oversight, and it is the reason the head is published externally. There is a
test that asserts it explicitly (`chain.test.ts`, "cannot detect truncation on
its own") so the limitation is documented in the code, not just in prose.

**Out of scope.** Whether the user was honest with themselves when they typed
the prediction. No system can check that.

**Deleting your own journal is not tampering.** Account deletion removes
everything, on request, by design. Falsifying a record and destroying it are
different acts, and only one of them is a threat to the user.

## Consequences

**Easier.** Corruption is diagnosable rather than suspected. The projection can
be rebuilt from the ledger after a bug rather than repaired by hand. Fixtures
for the demo journal go through the same fold as real data, so the demo cannot
drift from reality.

**Harder.** Appends must be serialised per user, or two concurrent writes would
fork the chain. Resolved with a compare-and-swap on a `chain_heads` document
inside the same transaction as the ledger insert, plus a unique index on
`(userId, seq)` as a structural backstop.

**To revisit.** The canonical form and the chain are both version-tagged, so
the scheme can change without invalidating existing chains.
