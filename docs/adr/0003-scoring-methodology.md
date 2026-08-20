# ADR-0003: Score with the Brier score, decomposed, with Wilson intervals

**Status:** Accepted
**Date:** 2026-08-20
**Deciders:** Suvra Samajder

## Context

The product's entire claim is that it measures the quality of your judgement.
If the number is wrong, or if it can be gamed, or if it is confidently stated
from four data points, the product is not merely inaccurate — it is actively
misleading someone about how good their thinking is.

Three separate decisions are needed: which scoring rule, how to group forecasts
for the reliability diagram, and when to say nothing at all.

## Decision

### Scoring rule: the Brier score

`BS = mean((p - o)²)` where `p` is the stated probability and `o` is 1 if the
expected outcome occurred, 0 otherwise. Lower is better; 0 is perfect; 0.25 is
what answering "50%" to everything gets you.

**Strictly proper**, which is the requirement rather than a nicety. Under a
strictly proper rule, the way to minimise your expected score is to report the
probability you actually believe. Any rule that could be improved by shading
your numbers would corrupt the measurement at the source, because users would
learn to shade. There is a test (`scoring.test.ts`, "is minimised by reporting
the true probability") that demonstrates this rather than asserting it.

**Bounded** in `[0, 1]`, so one badly missed 99% cannot swamp a decade of
careful judgement, and so the number can be explained in a sentence.

### Rejected rules

- **Logarithmic score.** Also strictly proper, and preferred in parts of the
  forecasting literature, but its penalty diverges as a confident forecast
  approaches being wrong. One catastrophic entry would dominate the history and
  the resulting number would be uninterpretable to a non-specialist.
- **Percent correct.** Not proper at all — it rewards answering 51% to
  everything you think is more likely than not, which is the exact behaviour
  this product is trying to cure.
- **Continuous Ranked Probability Score.** Designed for distributional
  forecasts. Outcomes here are binary, where CRPS reduces to the Brier score
  anyway.

### Decomposition: Murphy's partition

`BS = reliability − resolution + uncertainty`

- **Reliability** — calibration error. Zero means that when you said 70%, it
  happened 70% of the time. This is the number the product is really about.
- **Resolution** — discrimination. How far your forecasts move away from your
  own base rate while still being right.
- **Uncertainty** — `p(1−p)` on the base rate. The difficulty of the questions
  you chose to ask, which is not something you control.

Separating these matters because a forecaster can be perfectly calibrated and
useless (always predicting the base rate), or highly discriminating and badly
calibrated. A single number hides which one you are.

**The identity is exact, not approximate.** It only holds exactly when
forecasts are grouped by _identical_ value; grouping a range together leaves
within-bin variance and covariance terms unaccounted for. Since confidence here
is a whole percent between 1 and 99, there are at most 99 groups and exactness
is free. The property test asserts the identity to twelve decimal places.

### Skill score

`BSS = 1 − BS / BS_reference`, where the reference is the user's own base rate.
It answers "am I doing better than someone who knew only how often things
generally go my way?" Positive is skill; zero is no better than the base rate.

Because the base-rate reference has `BS_reference = uncertainty`, the skill
score is **undefined when every resolved decision went the same way**. The
product returns `null` and says so, rather than dividing by something close to
zero and printing a dramatic number.

### Binning for the reliability diagram: adaptive, equal-count

Fixed decile bins are the textbook choice and the wrong one here. People do not
spread their confidence evenly — they cluster on 70, 80 and 90 — so fixed bins
leave most of the chart empty and put all the weight on two points.

Instead: quantile bins targeting equal population, `K = clamp(⌊n/5⌋, 1, 10)`,
with two rules.

1. **Identical forecasts never split across a boundary.** If you said 80% twelve
   times, all twelve belong to one point; a boundary drawn through them would be
   an arbitrary cut.
2. **No bin holds fewer than five decisions** unless the whole sample is
   smaller than that. A point built from two observations is noise, and drawing
   it as a point invites the reader to interpret it.

This is a _different_ grouping from the one used for the decomposition. One is
chosen for arithmetic exactness, the other for legibility; conflating them
would compromise both.

### Uncertainty on each point: 95% Wilson score intervals

The normal approximation, `p ± z·√(p(1−p)/n)`, is wrong at exactly the sample
sizes a personal journal produces. It gives a zero-width interval when a bin is
all hits or all misses — implying certainty from five observations — and bounds
outside `[0, 1]` near the edges.

The Wilson interval, obtained by inverting the score test, keeps coverage close
to nominal at small `n` and always stays inside `[0, 1]`. It is verified in
tests against an independent derivation (solving the underlying quadratic
directly) rather than against a remembered constant.

### Saying nothing: the display thresholds

| Shown                                     | Requires                         |
| ----------------------------------------- | -------------------------------- |
| Individual decisions and outcomes         | always                           |
| Headline Brier score, reliability diagram | 10 resolved, scoreable decisions |
| Reliability/resolution split, skill score | 20                               |
| Any per-domain figure                     | 5 in that domain                 |

Below a threshold the interface reports progress — "six more to go" — and shows
individual results. It does not show a greyed-out number, a provisional
estimate, or a curve with an apology under it. A product whose premise is that
your memory flatters you cannot flatter you with statistics.

**Undetermined outcomes are excluded from every score and reported as their own
count.** Quietly dropping the decisions that got murky would flatter every user,
because the murky ones are disproportionately the ones that went badly.

## Consequences

**Easier.** Every number has a citation and a test. The decomposition means a
user can be told _which_ way they are wrong, not just that they are.

**Harder.** New users see very little for a while. That is a real product cost
and it is accepted deliberately; the demo journal exists so that the shape of
the payoff is visible before you have earned it.

**To revisit.** If enough users log enough decisions, per-domain thresholds
could be relaxed with a hierarchical model that pools across domains instead of
scoring each in isolation. That is a real improvement and a much larger claim to
defend, so it is not in v0.1.0.

## References

- Brier, G. W. (1950). _Verification of forecasts expressed in terms of
  probability._ Monthly Weather Review 78(1).
- Murphy, A. H. (1973). _A new vector partition of the probability score._
  Journal of Applied Meteorology 12(4).
- Wilson, E. B. (1927). _Probable inference, the law of succession, and
  statistical inference._ JASA 22(158).
- Brown, Cai & DasGupta (2001). _Interval estimation for a binomial
  proportion._ Statistical Science 16(2).
