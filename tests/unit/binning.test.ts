import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_BINS, MIN_BIN_COUNT, binForecasts } from "@/lib/domain/binning";
import { probabilityOf } from "@/lib/domain/scoring";
import { clusteredForecastsArb, forecastsArb } from "./arbitraries";

/**
 * Every point on the reliability diagram is a promise to the reader that it
 * represents a real, comparable group of decisions. These are the terms of that
 * promise.
 */
describe("binForecasts", () => {
  const bothDistributions = [
    ["uniform confidences", forecastsArb(1, 300)] as const,
    ["clustered confidences", clusteredForecastsArb(1, 300)] as const,
  ];

  for (const [label, arb] of bothDistributions) {
    describe(label, () => {
      it("accounts for every forecast exactly once", () => {
        fc.assert(
          fc.property(arb, (forecasts) => {
            const bins = binForecasts(forecasts);
            const counted = bins.reduce((sum, bin) => sum + bin.count, 0);
            const occurred = bins.reduce((sum, bin) => sum + bin.occurred, 0);
            expect(counted).toBe(forecasts.length);
            expect(occurred).toBe(forecasts.filter((f) => f.occurred).length);
          }),
        );
      });

      it("produces bins that ascend and never overlap", () => {
        fc.assert(
          fc.property(arb, (forecasts) => {
            const bins = binForecasts(forecasts);
            for (const bin of bins) {
              expect(bin.lowerConfidence).toBeLessThanOrEqual(bin.upperConfidence);
            }
            for (let i = 1; i < bins.length; i += 1) {
              expect(bins[i - 1].upperConfidence).toBeLessThan(bins[i].lowerConfidence);
            }
          }),
        );
      });

      it("never splits identical forecasts across a boundary", () => {
        fc.assert(
          fc.property(arb, (forecasts) => {
            const bins = binForecasts(forecasts);
            for (const forecast of forecasts) {
              const containing = bins.filter(
                (bin) =>
                  forecast.confidence >= bin.lowerConfidence &&
                  forecast.confidence <= bin.upperConfidence,
              );
              expect(containing).toHaveLength(1);
            }
          }),
        );
      });

      it("never draws a point from too little evidence", () => {
        fc.assert(
          fc.property(arb, (forecasts) => {
            const floor = Math.min(forecasts.length, MIN_BIN_COUNT);
            for (const bin of binForecasts(forecasts)) {
              expect(bin.count).toBeGreaterThanOrEqual(floor);
            }
          }),
        );
      });

      it("stays within the bin budget", () => {
        fc.assert(
          fc.property(arb, (forecasts) => {
            expect(binForecasts(forecasts).length).toBeLessThanOrEqual(MAX_BINS);
            expect(binForecasts(forecasts).length).toBeGreaterThanOrEqual(1);
          }),
        );
      });

      it("places each bin's mean forecast inside its own range", () => {
        fc.assert(
          fc.property(arb, (forecasts) => {
            for (const bin of binForecasts(forecasts)) {
              expect(bin.meanForecast).toBeGreaterThanOrEqual(
                probabilityOf(bin.lowerConfidence) - 1e-12,
              );
              expect(bin.meanForecast).toBeLessThanOrEqual(
                probabilityOf(bin.upperConfidence) + 1e-12,
              );
            }
          }),
        );
      });

      it("gives every point an interval that brackets its own frequency", () => {
        fc.assert(
          fc.property(arb, (forecasts) => {
            for (const bin of binForecasts(forecasts)) {
              expect(bin.observedFrequency).toBe(bin.occurred / bin.count);
              expect(bin.interval.lower).toBeLessThanOrEqual(
                bin.observedFrequency + 1e-12,
              );
              expect(bin.interval.upper).toBeGreaterThanOrEqual(
                bin.observedFrequency - 1e-12,
              );
            }
          }),
        );
      });

      it("numbers bins consecutively from zero", () => {
        fc.assert(
          fc.property(arb, (forecasts) => {
            const bins = binForecasts(forecasts);
            expect(bins.map((bin) => bin.index)).toStrictEqual(
              bins.map((_, index) => index),
            );
          }),
        );
      });
    });
  }

  it("returns nothing for an empty journal", () => {
    expect(binForecasts([])).toStrictEqual([]);
  });

  it("keeps a below-threshold sample in a single bin", () => {
    const few = Array.from({ length: 3 }, (_, i) => ({
      confidence: 20 + i * 20,
      occurred: i % 2 === 0,
    }));
    const bins = binForecasts(few);
    expect(bins).toHaveLength(1);
    expect(bins[0].count).toBe(3);
  });

  it("spreads a large journal across the full bin budget", () => {
    const many = Array.from({ length: 300 }, (_, i) => ({
      confidence: 1 + (i % 99),
      occurred: i % 3 === 0,
    }));
    expect(binForecasts(many)).toHaveLength(MAX_BINS);
  });

  it("collapses to one bin when every forecast was identical", () => {
    const same = Array.from({ length: 60 }, () => ({ confidence: 80, occurred: true }));
    const bins = binForecasts(same);
    expect(bins).toHaveLength(1);
    expect(bins[0].lowerConfidence).toBe(80);
    expect(bins[0].upperConfidence).toBe(80);
    expect(bins[0].count).toBe(60);
  });
});
