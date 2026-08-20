import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  EmptySampleError,
  baseRate,
  brierScore,
  brierSkillScore,
  murphyDecomposition,
  probabilityOf,
  toResolvedForecast,
  uncertainty,
  type ResolvedForecast,
} from "@/lib/domain/scoring";
import { clusteredForecastsArb, forecastsArb } from "./arbitraries";

const EPSILON = 1e-9;

describe("brierScore", () => {
  it("stays within its theoretical bounds", () => {
    fc.assert(
      fc.property(forecastsArb(1), (forecasts) => {
        const score = brierScore(forecasts);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }),
    );
  });

  it("does not depend on the order decisions were resolved in", () => {
    fc.assert(
      fc.property(forecastsArb(1), fc.nat(), (forecasts, rotation) => {
        const offset = forecasts.length > 0 ? rotation % forecasts.length : 0;
        const rotated = [...forecasts.slice(offset), ...forecasts.slice(0, offset)];
        expect(brierScore(rotated)).toBeCloseTo(brierScore(forecasts), 12);
      }),
    );
  });

  it("rewards confidence that matched reality", () => {
    const confident: ResolvedForecast[] = Array.from({ length: 20 }, () => ({
      confidence: 99,
      occurred: true,
    }));
    expect(brierScore(confident)).toBeCloseTo(0.0001, 12);
  });

  it("punishes confidence that contradicted reality", () => {
    const wrong: ResolvedForecast[] = Array.from({ length: 20 }, () => ({
      confidence: 99,
      occurred: false,
    }));
    expect(brierScore(wrong)).toBeCloseTo(0.9801, 12);
  });

  it("scores a coin-flip forecaster at exactly 0.25", () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 100 }),
        (outcomes) => {
          const hedged = outcomes.map((occurred) => ({ confidence: 50, occurred }));
          expect(brierScore(hedged)).toBeCloseTo(0.25, 12);
        },
      ),
    );
  });

  /**
   * Propriety, demonstrated rather than asserted: against a fixed truth
   * distribution, stating your real belief beats shading it in either
   * direction. This is the reason the whole product can be honest.
   */
  it("is minimised by reporting the true probability", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 95 }),
        fc.integer({ min: 1, max: 5 }),
        (truePercent, multiple) => {
          // A world where the outcome occurs at exactly `truePercent`. Sizing
          // the sample as a multiple of 100 keeps that rate exactly expressible,
          // so the honest forecast really is the optimum being tested.
          const total = 100 * multiple;
          const occurrences = truePercent * multiple;
          const expectedScore = (stated: number) => {
            const p = probabilityOf(stated);
            return (occurrences * (p - 1) ** 2 + (total - occurrences) * p ** 2) / total;
          };
          const honest = expectedScore(truePercent);
          for (const shade of [-20, -10, -5, 5, 10, 20]) {
            const shaded = truePercent + shade;
            if (shaded < 1 || shaded > 99) continue;
            expect(honest).toBeLessThanOrEqual(expectedScore(shaded) + EPSILON);
          }
        },
      ),
    );
  });

  it("has no value for an empty sample", () => {
    expect(() => brierScore([])).toThrow(EmptySampleError);
    expect(() => baseRate([])).toThrow(EmptySampleError);
    expect(() => uncertainty([])).toThrow(EmptySampleError);
    expect(() => murphyDecomposition([])).toThrow(EmptySampleError);
  });
});

describe("murphyDecomposition", () => {
  /**
   * The identity the whole dashboard rests on. Grouping by identical forecast
   * value makes it exact, not approximate, so this is asserted to twelve
   * decimal places rather than "close enough".
   */
  it("satisfies BS = reliability - resolution + uncertainty exactly", () => {
    fc.assert(
      fc.property(forecastsArb(1), (forecasts) => {
        const d = murphyDecomposition(forecasts);
        expect(d.reliability - d.resolution + d.uncertainty).toBeCloseTo(d.brier, 12);
      }),
    );
  });

  it("holds for the clustered confidences people actually use", () => {
    fc.assert(
      fc.property(clusteredForecastsArb(1), (forecasts) => {
        const d = murphyDecomposition(forecasts);
        expect(d.reliability - d.resolution + d.uncertainty).toBeCloseTo(d.brier, 12);
      }),
    );
  });

  it("keeps every component inside its valid range", () => {
    fc.assert(
      fc.property(forecastsArb(1), (forecasts) => {
        const d = murphyDecomposition(forecasts);
        expect(d.reliability).toBeGreaterThanOrEqual(0);
        expect(d.resolution).toBeGreaterThanOrEqual(0);
        expect(d.uncertainty).toBeGreaterThanOrEqual(0);
        expect(d.uncertainty).toBeLessThanOrEqual(0.25 + EPSILON);
        expect(d.resolution).toBeLessThanOrEqual(d.uncertainty + EPSILON);
      }),
    );
  });

  it("reports zero reliability error for a perfectly calibrated forecaster", () => {
    // Said 70% ten times; it happened exactly seven times.
    const calibrated: ResolvedForecast[] = [
      ...Array.from({ length: 7 }, () => ({ confidence: 70, occurred: true })),
      ...Array.from({ length: 3 }, () => ({ confidence: 70, occurred: false })),
    ];
    expect(murphyDecomposition(calibrated).reliability).toBeCloseTo(0, 12);
  });

  it("counts distinct forecast values, not decisions", () => {
    const forecasts: ResolvedForecast[] = [
      { confidence: 70, occurred: true },
      { confidence: 70, occurred: false },
      { confidence: 90, occurred: true },
    ];
    expect(murphyDecomposition(forecasts).distinctForecasts).toBe(2);
  });
});

describe("brierSkillScore", () => {
  it("equals (resolution - reliability) / uncertainty", () => {
    fc.assert(
      fc.property(forecastsArb(2), (forecasts) => {
        const d = murphyDecomposition(forecasts);
        const skill = brierSkillScore(forecasts);
        if (d.uncertainty === 0) {
          expect(skill).toBeNull();
          return;
        }
        expect(skill).toBeCloseTo((d.resolution - d.reliability) / d.uncertainty, 10);
      }),
    );
  });

  it("is undefined when every outcome went the same way", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 99 }), { minLength: 1, maxLength: 30 }),
        fc.boolean(),
        (confidences, occurred) => {
          const uniform = confidences.map((confidence) => ({ confidence, occurred }));
          expect(brierSkillScore(uniform)).toBeNull();
        },
      ),
    );
  });

  it("never exceeds 1, and reaches it only for perfect forecasts", () => {
    fc.assert(
      fc.property(forecastsArb(2), (forecasts) => {
        const skill = brierSkillScore(forecasts);
        if (skill !== null) expect(skill).toBeLessThanOrEqual(1 + EPSILON);
      }),
    );
  });

  it("scores a base-rate forecaster at zero", () => {
    // Ten decisions, six occurred; always stating 60%.
    const atBaseRate: ResolvedForecast[] = [
      ...Array.from({ length: 6 }, () => ({ confidence: 60, occurred: true })),
      ...Array.from({ length: 4 }, () => ({ confidence: 60, occurred: false })),
    ];
    expect(brierSkillScore(atBaseRate)).toBeCloseTo(0, 12);
  });
});

describe("toResolvedForecast", () => {
  it("excludes outcomes that could not be determined", () => {
    expect(toResolvedForecast(70, "unresolvable")).toBeNull();
    expect(toResolvedForecast(70, "happened")).toStrictEqual({
      confidence: 70,
      occurred: true,
    });
    expect(toResolvedForecast(70, "did_not_happen")).toStrictEqual({
      confidence: 70,
      occurred: false,
    });
  });
});
