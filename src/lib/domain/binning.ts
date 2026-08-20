import type { ResolvedForecast } from "./scoring";
import { probabilityOf } from "./scoring";
import { type ProportionInterval, wilsonInterval, Z_95 } from "./wilson";

/**
 * Grouping forecasts into the points of a reliability diagram.
 *
 * Fixed decile bins (0–10, 10–20, …) are the textbook choice and the wrong one
 * for a personal journal: people do not spread their confidence evenly, they
 * cluster on 70, 80 and 90, so most fixed bins end up empty and the two that
 * are not carry all the weight. Adaptive equal-count bins put roughly the same
 * number of observations behind every plotted point, which is what makes the
 * points comparable to each other.
 *
 * Two rules shape the implementation:
 *
 * 1. **Identical forecasts never split across a boundary.** If you said 80% on
 *    twelve occasions, all twelve belong to the same point; a boundary drawn
 *    through them would be an arbitrary cut with no meaning.
 * 2. **No bin holds fewer than `MIN_BIN_COUNT`** (unless the whole sample is
 *    smaller than that). A point built from two observations is noise, and
 *    drawing it as a point invites the reader to interpret it.
 */

export const MIN_BIN_COUNT = 5;
export const MAX_BINS = 10;

export type CalibrationBin = {
  index: number;
  /** Lowest stated confidence in this bin, whole percent. */
  lowerConfidence: number;
  /** Highest stated confidence in this bin, whole percent. */
  upperConfidence: number;
  count: number;
  occurred: number;
  /** Mean stated probability across the bin, in (0, 1). */
  meanForecast: number;
  /** Share of the bin where the expected outcome occurred, in [0, 1]. */
  observedFrequency: number;
  /** 95% Wilson interval around `observedFrequency`. */
  interval: ProportionInterval;
};

export type BinningOptions = {
  maxBins?: number;
  minBinCount?: number;
  z?: number;
};

type ConfidenceGroup = { confidence: number; count: number; occurred: number };

/**
 * Partition forecasts into contiguous, ascending confidence bins.
 *
 * Guarantees, all covered by property tests:
 * - the bins partition the input exactly (no forecast lost or double-counted);
 * - bins are contiguous and strictly ascending in confidence;
 * - no confidence value appears in two bins;
 * - every bin holds at least `min(n, minBinCount)` forecasts;
 * - there are never more than `maxBins` bins.
 */
export function binForecasts(
  forecasts: readonly ResolvedForecast[],
  options: BinningOptions = {},
): CalibrationBin[] {
  const { maxBins = MAX_BINS, minBinCount = MIN_BIN_COUNT, z = Z_95 } = options;
  const n = forecasts.length;
  if (n === 0) return [];

  const byConfidence = new Map<number, ConfidenceGroup>();
  for (const forecast of forecasts) {
    const group = byConfidence.get(forecast.confidence) ?? {
      confidence: forecast.confidence,
      count: 0,
      occurred: 0,
    };
    group.count += 1;
    if (forecast.occurred) group.occurred += 1;
    byConfidence.set(forecast.confidence, group);
  }

  const groups = [...byConfidence.values()].sort((a, b) => a.confidence - b.confidence);

  // Aim for `targetBins` bins of roughly equal population, then require each to
  // clear the minimum. Packing greedily against that threshold satisfies both
  // the size floor and the bin-count ceiling without a second pass.
  const targetBins = Math.min(maxBins, Math.max(1, Math.floor(n / minBinCount)));
  const threshold = Math.max(minBinCount, Math.ceil(n / targetBins));

  const packed: ConfidenceGroup[][] = [];
  let current: ConfidenceGroup[] = [];
  let currentCount = 0;

  for (const group of groups) {
    current.push(group);
    currentCount += group.count;
    if (currentCount >= threshold) {
      packed.push(current);
      current = [];
      currentCount = 0;
    }
  }

  if (current.length > 0) {
    // A remainder too small to stand alone joins the previous bin rather than
    // becoming an under-populated point of its own.
    if (packed.length === 0) packed.push(current);
    else packed[packed.length - 1].push(...current);
  }

  return packed.map((bin, index) => {
    let count = 0;
    let occurred = 0;
    let confidenceTotal = 0;
    for (const group of bin) {
      count += group.count;
      occurred += group.occurred;
      confidenceTotal += group.confidence * group.count;
    }
    return {
      index,
      lowerConfidence: bin[0].confidence,
      upperConfidence: bin[bin.length - 1].confidence,
      count,
      occurred,
      meanForecast: probabilityOf(confidenceTotal / count),
      observedFrequency: occurred / count,
      interval: wilsonInterval(occurred, count, z),
    };
  });
}
