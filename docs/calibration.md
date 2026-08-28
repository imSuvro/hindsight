# Calibration methodology

The statistical claims Hindsight makes, stated precisely enough to argue with.

[ADR-0003](adr/0003-scoring-methodology.md) records why each choice was made and
what was rejected. `/how-scoring-works` is the same material written for someone
who did not come here for the notation. This document is the reference.

---

## Notation

For each resolved decision _i_:

- $f_i \in \{0.01, \dots, 0.99\}$ — the stated probability (confidence ÷ 100)
- $o_i \in \{0, 1\}$ — 1 if the expected outcome occurred

Decisions closed as _could not be settled_ are excluded from every quantity
below and reported separately. $n$ is the number of scoreable decisions;
$\bar{o}$ is the base rate.

---

## Brier score

$$BS = \frac{1}{n}\sum_{i=1}^{n}(f_i - o_i)^2$$

Range $[0, 1]$, lower better. Reference points worth carrying around:

| Behaviour                   | Score |
| --------------------------- | ----- |
| Perfect                     | 0     |
| Answering 50% to everything | 0.25  |
| Always confidently wrong    | → 1   |

**Strictly proper.** Expected score is minimised by reporting your true belief.
Given a true probability $p$, the expected contribution of stating $q$ is

$$p(1-q)^2 + (1-p)q^2$$

which is minimised at $q = p$. This is not decoration: a rule that could be
improved by shading numbers would teach people to shade them, and the thing being
measured would stop being their judgement. `tests/unit/scoring.test.ts`
demonstrates it rather than asserting it.

---

## Murphy decomposition

$$BS = \underbrace{REL}_{\text{calibration}} - \underbrace{RES}_{\text{discrimination}} + \underbrace{UNC}_{\text{difficulty}}$$

Grouping decisions by distinct forecast value $k$, with $n_k$ decisions, forecast
$f_k$ and observed frequency $\bar{o}_k$:

$$REL = \frac{1}{n}\sum_k n_k (f_k - \bar{o}_k)^2$$
$$RES = \frac{1}{n}\sum_k n_k (\bar{o}_k - \bar{o})^2$$
$$UNC = \bar{o}(1 - \bar{o})$$

- **Reliability** — 0 means that when you said 70%, it happened 70% of the time.
  This is the number the product is really about.
- **Resolution** — how far your forecasts move from your own base rate while
  still being right. Higher is better.
- **Uncertainty** — how hard the questions were. Not something you control.

Separating them matters because a forecaster can be perfectly calibrated and
useless (always predicting the base rate: $REL = 0$, $RES = 0$), or highly
discriminating and badly calibrated. One number hides which you are.

### Why the identity is exact here

The decomposition is exact only when forecasts are grouped by _identical_ value.
Grouping a range together leaves within-group variance and covariance terms
unaccounted for:

$$BS = REL - RES + UNC + \frac{1}{n}\sum_k n_k \mathrm{Var}_k(f) - \frac{2}{n}\sum_k n_k \mathrm{Cov}_k(f, o)$$

Since confidence is a whole percent between 1 and 99, there are at most 99 groups
and both correction terms are identically zero. The property test asserts the
identity to twelve decimal places.

**This is a different grouping from the one used to draw the diagram.** One is
chosen for arithmetic exactness, the other for legibility. Conflating them would
compromise both.

---

## Skill score

$$BSS = 1 - \frac{BS}{BS_{\text{ref}}}$$

The reference is a constant forecast at the user's own base rate, for which
$BS_{\text{ref}} = \bar{o}(1-\bar{o}) = UNC$. So

$$BSS = \frac{RES - REL}{UNC}$$

which is also how the test checks it — two derivations agreeing is worth more
than one derivation asserted twice.

Positive is skill. Zero means you are doing no better than someone who knew only
how often things generally go your way. Negative means worse than that.

**Undefined when $\bar{o} \in \{0, 1\}$.** If every resolved decision went the
same way, $UNC = 0$ and the quantity does not exist. The product returns `null`
and says so rather than dividing by something near zero and printing a dramatic
number.

---

## Reliability diagram

### Binning

Fixed decile bins are the textbook choice and wrong for a personal journal:
people cluster on 70, 80 and 90, so most fixed bins are empty and two carry all
the weight. Instead, quantile bins targeting equal population.

$$K = \mathrm{clamp}\left(\left\lfloor \frac{n}{5} \right\rfloor,\ 1,\ 10\right), \qquad T = \max\left(5, \left\lceil \frac{n}{K} \right\rceil\right)$$

Decisions are grouped by confidence value, sorted ascending, and packed greedily
until a group reaches $T$; any remainder joins the last bin.

The invariants, all covered by property tests:

- the bins partition the input exactly — nothing lost, nothing double-counted
- bins are contiguous and strictly ascending in confidence
- **no confidence value appears in two bins** — twelve decisions at 80% belong to
  one point, because a boundary drawn through them would be arbitrary
- every bin holds at least $\min(n, 5)$ decisions
- there are never more than 10 bins

### Uncertainty on each point

95% **Wilson score interval** on $s$ successes in $m$ trials, $\hat{p} = s/m$:

$$\frac{\hat{p} + \frac{z^2}{2m} \pm \frac{z}{\;}\sqrt{\frac{\hat{p}(1-\hat{p})}{m} + \frac{z^2}{4m^2}}}{1 + \frac{z^2}{m}}, \qquad z = 1.959963984540054$$

The normal approximation, $\hat{p} \pm z\sqrt{\hat{p}(1-\hat{p})/m}$, is wrong at
exactly the sample sizes a personal journal produces: it gives a **zero-width**
interval when a bin is all hits or all misses — implying certainty from five
observations — and bounds outside $[0,1]$ near the edges.

The Wilson interval inverts the score test instead. Properties held by tests:
$0 \le \text{lower} \le \hat{p} \le \text{upper} \le 1$ always; the bound pins at
0 or 1 rather than collapsing; width shrinks with $m$; and the bounds match the
roots of $(\hat{p} - p)^2 = z^2 p(1-p)/m$ to twelve decimal places — an
independent derivation of the same quantity.

---

## Display thresholds

| Shown                                              | Requires                   |
| -------------------------------------------------- | -------------------------- |
| Individual decisions and outcomes                  | always                     |
| Brier score, reliability diagram, overall tendency | 10 scoreable               |
| Murphy decomposition, skill score                  | 20 scoreable               |
| Any per-domain figure                              | 5 scoreable in that domain |

Below a threshold the interface reports progress and shows individual results. It
does not show a faded number, a provisional estimate, or a curve with an apology
under it. A product whose premise is that memory flatters you cannot flatter you
with statistics.

These constants live in `src/lib/domain/calibration.ts` and are read by the
interface, the methodology page and the tests, so the documentation cannot drift
from the behaviour.

### The trainer keeps the same rule, on its own count

The calibration trainer at `/practice` asks questions that already have an
answer, so a new journal is not silent for the months it takes ten decisions to
come back. It is scored by the same arithmetic and holds to the same refusal:

| Shown                                      | Requires    |
| ------------------------------------------ | ----------- |
| Hit rate, mean confidence, tendency, curve | 20 answered |
| Murphy decomposition, skill score          | 40 answered |

Its thresholds are **higher** than the journal's, and are its own constant in
`src/lib/domain/practice.ts` rather than a borrowed one. The reason the journal
shows nothing at nine is sampling noise, and noise does not care that practice
answers are cheap to produce — twenty coin-flips are twenty coin-flips whether
they took a year or ten minutes. The cheapness is what makes the higher bar
affordable, not what makes it unnecessary.

**Practice is never mixed into the journal's figures**, and never enters the
ledger. Knowing which of two countries is larger is not knowing how your own
decisions turn out; merging them would let the easy number flatter the hard one.

Because a two-alternative question has a confidence floor of 50 — below it you
would simply have picked the other option — the trainer has a fixed reference
the journal does not: answering 50 to everything scores exactly 0.25 whatever
happens. The trainer reports the distance from that, which is defined from the
first session, where the skill score is not.

---

## Domains

Calibration is broken down along five fixed domains: career, technical,
financial, people, personal. Free-text tags exist for organisation and **never
feed any statistic** — see [ADR-0007](adr/0007-domain-taxonomy.md) for why the
thing that gets measured is fixed and the thing that is flexible is not measured.

Each domain is scored in isolation. A hierarchical model pooling across domains
would let the threshold drop, and is a much larger claim to defend; it is not in
v0.1.0.

---

## What none of this measures

**Whether a decision was good.** A well-made decision can turn out badly and a
reckless one can turn out fine. A single outcome is never evidence about the
thinking behind it. What accumulates over dozens of decisions is evidence about
_confidence_ — whether the feeling of being sure means anything when you have it.

**Whether you were honest with yourself.** Nothing can check that.

**Anything about selection.** You choose which decisions to record. Someone who
only logs things they feel clever about will get a flattering curve, and no
scoring rule can detect it.

---

## References

- Brier, G. W. (1950). _Verification of forecasts expressed in terms of
  probability._ Monthly Weather Review 78(1), 1–3.
- Murphy, A. H. (1973). _A new vector partition of the probability score._
  Journal of Applied Meteorology 12(4), 595–600.
- Wilson, E. B. (1927). _Probable inference, the law of succession, and
  statistical inference._ JASA 22(158), 209–212.
- Brown, L. D., Cai, T. T., & DasGupta, A. (2001). _Interval estimation for a
  binomial proportion._ Statistical Science 16(2), 101–133.
- Gneiting, T., & Raftery, A. E. (2007). _Strictly proper scoring rules,
  prediction, and estimation._ JASA 102(477), 359–378.
