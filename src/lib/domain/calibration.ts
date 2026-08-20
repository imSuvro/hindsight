import {
  type Domain,
  DOMAINS,
  type DecisionView,
  decisionStatus,
} from "@/lib/schemas/domain";
import { type CalibrationBin, binForecasts } from "./binning";
import {
  type MurphyDecomposition,
  type ResolvedForecast,
  baseRate,
  brierScore,
  brierSkillScore,
  murphyDecomposition,
  probabilityOf,
  toResolvedForecast,
} from "./scoring";

/**
 * Turning a journal into the numbers the dashboard shows — and, just as
 * importantly, deciding when it shows nothing.
 *
 * A calibration curve drawn from four decisions is not a weak signal, it is an
 * invented one, and a product whose entire premise is "your memory flatters
 * you" cannot afford to flatter you with statistics. So the thresholds below
 * are part of the product, not a loading state: below them the interface
 * reports progress and shows individual results, and refuses to state an
 * aggregate.
 */
export const CALIBRATION_THRESHOLDS = {
  /** Headline Brier score and the reliability diagram. */
  headline: 10,
  /** Reliability/resolution split and the skill score. */
  decomposition: 20,
  /** Any per-domain figure. */
  domain: 5,
} as const;

export type CalibrationCounts = {
  logged: number;
  pending: number;
  due: number;
  resolved: number;
  /** Resolved *and* scoreable — excludes outcomes marked unresolvable. */
  scored: number;
  unresolvable: number;
};

export type DomainCalibration = {
  domain: Domain;
  logged: number;
  scored: number;
  unresolvable: number;
  brier: number | null;
  baseRate: number | null;
  meanForecast: number | null;
  /** Mean forecast minus observed rate. Positive means overconfident. */
  gap: number | null;
};

export type CalibrationTendency = {
  meanForecast: number;
  baseRate: number;
  /** Positive: predicted more often than it happened. */
  gap: number;
  direction: "overconfident" | "underconfident" | "calibrated";
};

export type CalibrationInsight = {
  bin: CalibrationBin;
  direction: "overconfident" | "underconfident";
  gap: number;
};

export type CalibrationUnlock = {
  /** How many more resolved decisions are needed. */
  remaining: number;
  /** What those decisions will unlock, in the interface's own words. */
  unlocks: string;
};

export type CalibrationReport = {
  counts: CalibrationCounts;
  thresholds: typeof CALIBRATION_THRESHOLDS;
  /** Null until `thresholds.headline` scored decisions exist. */
  brier: number | null;
  baseRate: number | null;
  meanForecast: number | null;
  tendency: CalibrationTendency | null;
  bins: CalibrationBin[];
  /** Null until `thresholds.decomposition` scored decisions exist. */
  decomposition: MurphyDecomposition | null;
  skillScore: number | null;
  /** The single bin furthest from the diagonal, once bins exist. */
  insight: CalibrationInsight | null;
  byDomain: DomainCalibration[];
  nextUnlock: CalibrationUnlock | null;
};

/** A decision is only scoreable once resolved to a definite outcome. */
export function resolvedForecasts(
  decisions: readonly DecisionView[],
): ResolvedForecast[] {
  const forecasts: ResolvedForecast[] = [];
  for (const decision of decisions) {
    if (!decision.resolution) continue;
    const forecast = toResolvedForecast(decision.confidence, decision.resolution.outcome);
    if (forecast) forecasts.push(forecast);
  }
  return forecasts;
}

function meanForecastOf(forecasts: readonly ResolvedForecast[]): number {
  let total = 0;
  for (const forecast of forecasts) total += probabilityOf(forecast.confidence);
  return total / forecasts.length;
}

/** Gaps smaller than this are noise, not a finding worth naming. */
const MEANINGFUL_GAP = 0.05;

function tendencyOf(forecasts: readonly ResolvedForecast[]): CalibrationTendency {
  const mean = meanForecastOf(forecasts);
  const observed = baseRate(forecasts);
  const gap = mean - observed;
  return {
    meanForecast: mean,
    baseRate: observed,
    gap,
    direction:
      Math.abs(gap) < MEANINGFUL_GAP
        ? "calibrated"
        : gap > 0
          ? "overconfident"
          : "underconfident",
  };
}

function insightOf(bins: readonly CalibrationBin[]): CalibrationInsight | null {
  let worst: CalibrationInsight | null = null;
  for (const bin of bins) {
    const gap = bin.meanForecast - bin.observedFrequency;
    if (Math.abs(gap) < MEANINGFUL_GAP) continue;
    if (!worst || Math.abs(gap) > Math.abs(worst.gap)) {
      worst = { bin, gap, direction: gap > 0 ? "overconfident" : "underconfident" };
    }
  }
  return worst;
}

function domainBreakdown(decisions: readonly DecisionView[]): DomainCalibration[] {
  return DOMAINS.map((domain) => {
    const inDomain = decisions.filter((decision) => decision.domain === domain);
    const forecasts = resolvedForecasts(inDomain);
    const unresolvable = inDomain.filter(
      (decision) => decision.resolution?.outcome === "unresolvable",
    ).length;

    if (forecasts.length < CALIBRATION_THRESHOLDS.domain) {
      return {
        domain,
        logged: inDomain.length,
        scored: forecasts.length,
        unresolvable,
        brier: null,
        baseRate: null,
        meanForecast: null,
        gap: null,
      };
    }

    const mean = meanForecastOf(forecasts);
    const observed = baseRate(forecasts);
    return {
      domain,
      logged: inDomain.length,
      scored: forecasts.length,
      unresolvable,
      brier: brierScore(forecasts),
      baseRate: observed,
      meanForecast: mean,
      gap: mean - observed,
    };
  });
}

function nextUnlockOf(scored: number): CalibrationUnlock | null {
  if (scored < CALIBRATION_THRESHOLDS.headline) {
    return {
      remaining: CALIBRATION_THRESHOLDS.headline - scored,
      unlocks: "your calibration curve",
    };
  }
  if (scored < CALIBRATION_THRESHOLDS.decomposition) {
    return {
      remaining: CALIBRATION_THRESHOLDS.decomposition - scored,
      unlocks: "your skill score and the calibration breakdown",
    };
  }
  return null;
}

export function buildCalibrationReport(
  decisions: readonly DecisionView[],
  now: number,
): CalibrationReport {
  const forecasts = resolvedForecasts(decisions);
  const resolved = decisions.filter((decision) => decision.resolution !== null);
  const unresolvable = resolved.filter(
    (decision) => decision.resolution?.outcome === "unresolvable",
  ).length;

  const counts: CalibrationCounts = {
    logged: decisions.length,
    pending: decisions.filter((d) => decisionStatus(d, now) === "pending").length,
    due: decisions.filter((d) => decisionStatus(d, now) === "due").length,
    resolved: resolved.length,
    scored: forecasts.length,
    unresolvable,
  };

  const hasHeadline = forecasts.length >= CALIBRATION_THRESHOLDS.headline;
  const hasDecomposition = forecasts.length >= CALIBRATION_THRESHOLDS.decomposition;
  const bins = hasHeadline ? binForecasts(forecasts) : [];

  return {
    counts,
    thresholds: CALIBRATION_THRESHOLDS,
    brier: hasHeadline ? brierScore(forecasts) : null,
    baseRate: hasHeadline ? baseRate(forecasts) : null,
    meanForecast: hasHeadline ? meanForecastOf(forecasts) : null,
    tendency: hasHeadline ? tendencyOf(forecasts) : null,
    bins,
    decomposition: hasDecomposition ? murphyDecomposition(forecasts) : null,
    skillScore: hasDecomposition ? brierSkillScore(forecasts) : null,
    insight: hasHeadline ? insightOf(bins) : null,
    byDomain: domainBreakdown(decisions),
    nextUnlock: nextUnlockOf(forecasts.length),
  };
}
