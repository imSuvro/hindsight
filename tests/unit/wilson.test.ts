import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { InvalidSampleError, Z_95, wilsonInterval } from "@/lib/domain/wilson";

const sampleArb = fc
  .tuple(fc.integer({ min: 1, max: 5000 }), fc.double({ min: 0, max: 1, noNaN: true }))
  .map(([trials, share]) => ({ trials, successes: Math.round(share * trials) }));

describe("wilsonInterval", () => {
  it("stays inside [0, 1] and contains the point estimate", () => {
    fc.assert(
      fc.property(sampleArb, ({ successes, trials }) => {
        const { estimate, lower, upper } = wilsonInterval(successes, trials);
        expect(lower).toBeGreaterThanOrEqual(0);
        expect(upper).toBeLessThanOrEqual(1);
        expect(lower).toBeLessThanOrEqual(estimate + 1e-12);
        expect(upper).toBeGreaterThanOrEqual(estimate - 1e-12);
      }),
    );
  });

  it("pins the bound at the boundary rather than collapsing to a point", () => {
    // The normal approximation gives a zero-width interval here, which is the
    // exact failure that would make a small bin look certain.
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 500 }), (trials) => {
        const none = wilsonInterval(0, trials);
        expect(none.lower).toBeCloseTo(0, 12);
        expect(none.upper).toBeGreaterThan(0);

        const all = wilsonInterval(trials, trials);
        expect(all.upper).toBeCloseTo(1, 12);
        expect(all.lower).toBeLessThan(1);
      }),
    );
  });

  it("narrows as evidence accumulates", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 400 }), (halfTrials) => {
        const small = wilsonInterval(halfTrials, halfTrials * 2);
        const large = wilsonInterval(halfTrials * 10, halfTrials * 20);
        expect(large.upper - large.lower).toBeLessThan(small.upper - small.lower);
      }),
    );
  });

  it("widens as the requested confidence level rises", () => {
    const narrow = wilsonInterval(7, 20, 1.0);
    const wide = wilsonInterval(7, 20, Z_95);
    expect(wide.upper - wide.lower).toBeGreaterThan(narrow.upper - narrow.lower);
  });

  it("agrees with the roots of the score equation it is derived from", () => {
    // The Wilson bounds are by definition the two solutions of
    //   (p̂ - p)² = z²·p(1 - p)/n
    // Solving that quadratic directly is an independent derivation, so this
    // catches an algebra slip in the closed form that a remembered textbook
    // constant would not.
    const roots = (successes: number, trials: number, z: number) => {
      const p = successes / trials;
      const a = trials + z * z;
      const b = -(2 * trials * p + z * z);
      const c = trials * p * p;
      const discriminant = Math.sqrt(b * b - 4 * a * c);
      return {
        lower: (-b - discriminant) / (2 * a),
        upper: (-b + discriminant) / (2 * a),
      };
    };

    fc.assert(
      fc.property(sampleArb, ({ successes, trials }) => {
        const actual = wilsonInterval(successes, trials);
        const expected = roots(successes, trials, Z_95);
        expect(actual.lower).toBeCloseTo(expected.lower, 12);
        expect(actual.upper).toBeCloseTo(expected.upper, 12);
      }),
    );
  });

  it("rejects samples it cannot describe", () => {
    expect(() => wilsonInterval(0, 0)).toThrow(InvalidSampleError);
    expect(() => wilsonInterval(-1, 10)).toThrow(InvalidSampleError);
    expect(() => wilsonInterval(11, 10)).toThrow(InvalidSampleError);
    expect(() => wilsonInterval(1.5, 10)).toThrow(InvalidSampleError);
    expect(() => wilsonInterval(1, 10, 0)).toThrow(InvalidSampleError);
    expect(() => wilsonInterval(1, 10, Number.NaN)).toThrow(InvalidSampleError);
  });
});
