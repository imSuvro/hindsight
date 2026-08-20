# ADR-0007: Five fixed domains for scoring, free tags for everything else

**Status:** Accepted
**Date:** 2026-08-20
**Deciders:** Suvra Samajder

## Context

"Are you better at technical judgement than at judging people?" is one of the
more interesting questions this data can answer, and answering it requires
grouping decisions. The question is who chooses the groups.

The constraint that decides it is statistical. A calibration figure needs
enough resolved decisions behind it to mean anything —
[ADR-0003](0003-scoring-methodology.md) sets that floor at five per domain, and
ten for anything headline. Someone logging two decisions a week takes months to
earn a per-domain number in _one_ category.

## Decision

A hybrid, with a strict separation of duties.

**Five fixed domains, and they are the only axis calibration is broken down
along:** career, technical, financial, people, personal.

**Optional free-text tags, which never feed any statistic.** Up to six per
decision, lowercased and de-duplicated. They are for the user's own
organisation, filtering and recall.

## Options considered

### Fixed categories only — rejected

Simple and statistically sound, but it forces every decision into someone
else's ontology and leaves users with no way to track the grouping they
actually care about — a particular project, a particular relationship, a
recurring kind of call.

### User-defined categories only — rejected

Maximum expressiveness, and it destroys the feature it exists to serve.
Free-form categories fragment a small journal into slices too thin to score, so
the per-domain view would show "not enough data yet" forever. It also invites
near-duplicates — "work", "job", "career" — that split the same underlying
category three ways without the user noticing.

### Hybrid — chosen

Fixed domains keep the buckets few and stable enough that per-domain numbers
become available in a realistic timeframe, and comparable across time because
the category cannot be renamed or redefined halfway through. Tags absorb
everything the fixed list cannot express, at zero statistical cost, because
they are never used as a grouping for scoring.

The separation is the whole point: **the thing that gets measured is fixed, and
the thing that is flexible is not measured.** Letting tags into the maths would
reintroduce the fragmentation problem through the back door.

## Why these five

They separate kinds of judgement that plausibly differ in a person, rather than
subject matter that happens to differ:

- **career** — roles, offers, moves, direction
- **technical** — architecture, tools, estimates, technical bets
- **financial** — money, purchases, investments, pricing
- **people** — hiring, relationships, how someone will react
- **personal** — health, habits, living, commitments

Five is small enough that a user can pick one without deliberating and large
enough that the answer is interesting. "Other" is deliberately absent: it would
become the default and carry no information. `personal` is the honest home for
anything that does not fit elsewhere.

## Consequences

**Easier.** Per-domain figures become available in a realistic timeframe. The
domain is a closed enum end to end — validated by schema, exhaustive in
TypeScript, and safe to use as a chart legend and a colour scale.

**Harder.** Some decisions genuinely straddle two domains, and the user has to
pick one. Adding a sixth domain later would leave existing users with an empty
category and a discontinuity in their history, so the list is effectively
permanent — which is why it was worth getting right rather than getting
extensible.

**To revisit.** If the data ever shows one domain absorbing most entries, that
is evidence the split is wrong. Any change needs a migration story for existing
journals, not just a new enum value.
