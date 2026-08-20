# Verifying your record

Hindsight claims that once you lock a prediction, nobody can change it — not
you, and not whoever runs the service. This is how to check that claim rather
than take it.

There are three ways to do it. They differ in how much of the system you have to
trust, and the last one requires trusting none of it.

---

## 1. In the app

**Settings → Your record → Check my record.**

This replays your whole chain, recomputes every fingerprint and reports the first
place it stops adding up.

## 2. Against the API

```bash
curl -s https://YOUR-DEPLOYMENT/api/ledger/verify \
  -H "Cookie: <your session cookie>" | jq
```

```json
{
  "intact": true,
  "entries": 47,
  "decisions": 21,
  "head": { "seq": 47, "hash": "9c1f…" },
  "checkedAt": "2026-08-21T09:14:02.881Z",
  "problems": []
}
```

Returns `409` rather than `200` when something does not verify, so it can be
watched by anything that understands HTTP status codes.

## 3. Offline, trusting nothing

The first two ask the application whether the application has been tampered
with, which is a fair thing to be sceptical about. This one does not.

```bash
# Settings → Take it with you → Download JSON
node scripts/verify-export.mjs ~/Downloads/hindsight-2026-08-21.json
```

```
OK: all 47 entries verify.
    Exported:  2026-08-21T09:14:02.881Z
    Decisions: 21
    Head:      9c1f8b0d…

This proves nothing in the record was altered or reordered.
It cannot prove nothing was removed from the end — for that,
compare the head above against one you already have (the footer
of any review email carries it).
```

`scripts/verify-export.mjs` is about a hundred lines including its comments,
imports nothing but Node's own `crypto` and `fs`, and is meant to be read before
it is run.

---

## What is actually being checked

For every entry, in order:

1. **The sequence is unbroken** — 1, 2, 3, with no gaps and no repeats.
2. **It belongs to this account** — and the first entry is anchored to a genesis
   value derived from the account id, so an entry cannot be replayed from one
   journal into another.
3. **It names its predecessor** — `prevHash` equals the previous entry's `hash`.
4. **Its contents still produce its fingerprint** — the entry is re-serialised
   into the canonical form and rehashed.

```
hash = SHA256(canonical({
  at, canonicalVersion, chainVersion, payload, prevHash, seq, type, userId
}))
```

The canonical form is deterministic on purpose: keys sorted, integers only, no
floating point, strings normalised once when they were first accepted. Without
that, the same record could serialise two ways and produce two different
fingerprints — and an honest record would look tampered with.

Change one character of one payload and step 4 fails on that entry. Recompute
that entry's hash to cover it up and step 3 fails on the _next_ one. The only way
to make a single edit consistent is to rewrite every entry after it.

---

## What this cannot prove

**That nothing was removed from the end.** Any prefix of a valid chain is itself a
valid chain, so a shortened record verifies perfectly. This is arithmetic, not an
oversight, and there is a test named after it in `tests/unit/chain.test.ts`.

The defence is that the head fingerprint leaves the database. It is shown in the
footer of the app, printed in every review email, and included in every export.
Any copy you already hold is a witness that the operator cannot reach, so:

> **Compare the head against one you were shown before.** If an old review email
> says `9c1f8b0d…` and today's export cannot produce a chain containing it, the
> record has been shortened.

**That you were honest with yourself** when you typed the number. Nothing can
check that. All this guarantees is that whatever you typed is still exactly what
you typed.

---

## If verification fails

Nothing is repaired automatically, and nothing should be. The check reports which
entry diverged and how.

If you are running your own instance, the ledger is the record and `decisions` is
a projection of it — so a mismatch reported as `projection` means the view is
wrong and can be rebuilt, while one reported as `chain` means the record itself
has been altered and rebuilding would only launder the change.

If you are using a hosted instance and it reports a chain failure, that is worth
an issue, and worth keeping the export.
