import type { Outcome } from "@/lib/schemas/domain";

/**
 * Scoring rule: the Brier score, with Murphy's decomposition.
 *
 * Why Brier and not log loss, or "percent correct":
 *
 * - It is **strictly proper**. A forecaster minimises their expected score only
 *   by reporting what they actually believe. Any rule that could be gamed by
 *   shading numbers would quietly corrupt the thing this product measures, so
 *   propriety is not a nicety here — it is the requirement.
 * - It is **bounded** in [0, 1]. Log loss is also strictly proper, but its
 *   penalty diverges as a confident forecast approaches being wrong, so a single
 *   badly-missed 99% would dominate a lifetime of careful judgement. A score
 *   nobody can interpret is a score nobody will trust.
 * - "Percent correct" is not proper at all: it rewards always saying 51%.
 *
 * Lower is better. 0 is perfection; 0.25 is what you get by answering 50% to
 * everything; above 0.25 means the forecasts are actively misleading.
 *
 * Reference: Brier (1950); Murphy (1973), "A New Vector Partition of the
 * Probability Score".
 */

export type ResolvedForecast = {
  /** Stated confidence as a whole percent, 1–99. */
  confidence: number;
  /** Whether the expected outcome actually occurred. */
  occurred: boolean;
};

export class EmptySampleError extends Error {
  constructor(what: string) {
    super(`${what} is undefined for an empty sample`);
    this.name = "EmptySampleError";
  }
}

/** Stated confidence as a probability in (0, 1). */
export function probabilityOf(confidence: number): number {
  return confidence / 100;
}

/**
 * Only `happened` and `did_not_happen` are scoreable. `unresolvable` is carried
 * through the product as its own visible count rather than being dropped, since
 * quietly discarding the decisions that got murky would flatter every user.
 */
export function toResolvedForecast(
  confidence: number,
  outcome: Outcome,
): ResolvedForecast | null {
  if (outcome === "unresolvable") return null;
  return { confidence, occurred: outcome === "happened" };
}

/** Mean squared error of stated probability against what happened. */
export function brierScore(forecasts: readonly ResolvedForecast[]): number {
  if (forecasts.length === 0) throw new EmptySampleError("Brier score");
  let total = 0;
  for (const f of forecasts) {
    const error = probabilityOf(f.confidence) - (f.occurred ? 1 : 0);
    total += error * error;
  }
  return total / forecasts.length;
}

/** Share of scored decisions where the expected outcome occurred. */
export function baseRate(forecasts: readonly ResolvedForecast[]): number {
  if (forecasts.length === 0) throw new EmptySampleError("Base rate");
  let occurred = 0;
  for (const f of forecasts) if (f.occurred) occurred += 1;
  return occurred / forecasts.length;
}

/**
 * Irreducible difficulty of the questions asked, `p(1 - p)` on the base rate.
 * At its maximum (0.25) outcomes are a coin flip; at 0 every decision went the
 * same way and there was nothing to forecast.
 */
export function uncertainty(forecasts: readonly ResolvedForecast[]): number {
  const p = baseRate(forecasts);
  return p * (1 - p);
}

export type MurphyDecomposition = {
  brier: number;
  /**
   * Calibration error. Zero means that whenever you said 70%, it happened 70%
   * of the time. This is the number the product is really about.
   */
  reliability: number;
  /**
   * Discrimination. How far your forecasts move away from your own base rate
   * while still being right — the ability to tell likely from unlikely. Higher
   * is better.
   */
  resolution: number;
  /** Difficulty of the question set. Not something the forecaster controls. */
  uncertainty: number;
  /** Number of distinct confidence values the decomposition was computed over. */
  distinctForecasts: number;
};

/**
 * Murphy's exact partition: `BS = reliability - resolution + uncertainty`.
 *
 * The identity is only exact when forecasts are grouped by *identical* value,
 * because grouping a range of values together leaves within-group variance and
 * covariance terms unaccounted for. Confidence here is an integer percent, so
 * there are at most 99 groups and exactness costs nothing.
 *
 * This is deliberately a different grouping from the one used to draw the
 * reliability diagram (see `binning.ts`), which needs wider bins to have enough
 * observations per point to say anything. One grouping is chosen for arithmetic
 * exactness, the other for legibility; conflating them would compromise both.
 */
export function murphyDecomposition(
  forecasts: readonly ResolvedForecast[],
): MurphyDecomposition {
  if (forecasts.length === 0) throw new EmptySampleError("Decomposition");

  const groups = new Map<number, { count: number; occurred: number }>();
  for (const f of forecasts) {
    const group = groups.get(f.confidence) ?? { count: 0, occurred: 0 };
    group.count += 1;
    if (f.occurred) group.occurred += 1;
    groups.set(f.confidence, group);
  }

  const n = forecasts.length;
  const overall = baseRate(forecasts);

  let reliability = 0;
  let resolution = 0;
  for (const [confidence, group] of groups) {
    const forecast = probabilityOf(confidence);
    const observed = group.occurred / group.count;
    reliability += group.count * (forecast - observed) ** 2;
    resolution += group.count * (observed - overall) ** 2;
  }

  return {
    brier: brierScore(forecasts),
    reliability: reliability / n,
    resolution: resolution / n,
    uncertainty: overall * (1 - overall),
    distinctForecasts: groups.size,
  };
}

/**
 * Brier skill score against the forecaster's own base rate: "am I doing better
 * than someone who knew only how often things generally go my way?"
 *
 * Positive is skill, 0 is no better than the base rate, negative is worse.
 *
 * Returns `null` when every scored decision went the same way. The reference
 * forecast is then perfect, the denominator is zero, and the honest answer is
 * that skill is not yet defined — not a large number pointing in some direction.
 */
export function brierSkillScore(forecasts: readonly ResolvedForecast[]): number | null {
  const reference = uncertainty(forecasts);
  if (reference === 0) return null;
  return 1 - brierScore(forecasts) / reference;
}
