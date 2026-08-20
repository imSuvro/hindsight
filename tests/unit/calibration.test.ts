import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CALIBRATION_THRESHOLDS,
  buildCalibrationReport,
  resolvedForecasts,
} from "@/lib/domain/calibration";
import type { DecisionView, Domain, Outcome } from "@/lib/schemas/domain";
import { DOMAINS } from "@/lib/schemas/domain";

const NOW = Date.parse("2026-06-01T00:00:00Z");

let counter = 0;
function decision(overrides: Partial<DecisionView> = {}): DecisionView {
  counter += 1;
  const id = String(counter).padStart(16, "0");
  return {
    decisionId: id,
    userId: "u1",
    title: `Decision ${counter}`,
    situation: "",
    expectedOutcome: "It works out",
    confidence: 70,
    domain: "career",
    tags: [],
    reviewAt: NOW - 1000,
    reviewLocal: { date: "2026-05-31", time: "09:00", timeZone: "UTC" },
    lockedAt: NOW - 100_000,
    lockedSeq: counter,
    entryHash: "0".repeat(64),
    rescheduleCount: 0,
    resolution: null,
    ...overrides,
  };
}

function resolved(
  count: number,
  confidence: number,
  outcome: Outcome,
  domain: Domain = "career",
): DecisionView[] {
  return Array.from({ length: count }, () =>
    decision({
      confidence,
      domain,
      resolution: { outcome, notes: "", resolvedAt: NOW, resolvedSeq: 1 },
    }),
  );
}

/**
 * The product's promise about small samples is a promise about what it does
 * *not* show. These tests hold it to that.
 */
describe("buildCalibrationReport", () => {
  it("shows no aggregate below the headline threshold", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: CALIBRATION_THRESHOLDS.headline - 1 }),
        (count) => {
          const report = buildCalibrationReport(
            [...resolved(count, 70, "happened")],
            NOW,
          );
          expect(report.brier).toBeNull();
          expect(report.baseRate).toBeNull();
          expect(report.tendency).toBeNull();
          expect(report.insight).toBeNull();
          expect(report.bins).toStrictEqual([]);
          expect(report.decomposition).toBeNull();
          expect(report.skillScore).toBeNull();
        },
      ),
    );
  });

  it("names how many more decisions are needed, and for what", () => {
    const early = buildCalibrationReport(resolved(4, 70, "happened"), NOW);
    expect(early.nextUnlock).toStrictEqual({
      remaining: 6,
      unlocks: "your calibration curve",
    });

    const middle = buildCalibrationReport(
      [...resolved(12, 70, "happened"), ...resolved(0, 70, "happened")],
      NOW,
    );
    expect(middle.nextUnlock).toStrictEqual({
      remaining: 8,
      unlocks: "your skill score and the calibration breakdown",
    });

    const mature = buildCalibrationReport(
      [...resolved(15, 70, "happened"), ...resolved(10, 30, "did_not_happen")],
      NOW,
    );
    expect(mature.nextUnlock).toBeNull();
  });

  it("reveals the headline once there is enough evidence", () => {
    const decisions = [
      ...resolved(7, 70, "happened"),
      ...resolved(3, 70, "did_not_happen"),
    ];
    const report = buildCalibrationReport(decisions, NOW);
    // Seven hits at (0.7 - 1)² and three misses at (0.7 - 0)², over ten.
    expect(report.brier).toBeCloseTo(0.21, 10);
    expect(report.baseRate).toBeCloseTo(0.7, 10);
    expect(report.bins.length).toBeGreaterThan(0);
    // 20 scored decisions are still needed before the split is shown.
    expect(report.decomposition).toBeNull();
    expect(report.skillScore).toBeNull();
  });

  it("reveals the decomposition once there is more", () => {
    const decisions = [
      ...resolved(14, 70, "happened"),
      ...resolved(6, 70, "did_not_happen"),
    ];
    const report = buildCalibrationReport(decisions, NOW);
    expect(report.decomposition).not.toBeNull();
    expect(report.decomposition?.reliability).toBeCloseTo(0, 12);
    expect(report.skillScore).not.toBeNull();
  });

  it("never counts an undetermined outcome as a score", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 20 }),
        (scoreable, undetermined) => {
          const decisions = [
            ...resolved(scoreable, 70, "happened"),
            ...resolved(undetermined, 70, "unresolvable"),
          ];
          const report = buildCalibrationReport(decisions, NOW);
          expect(report.counts.resolved).toBe(scoreable + undetermined);
          expect(report.counts.scored).toBe(scoreable);
          expect(report.counts.unresolvable).toBe(undetermined);
          expect(resolvedForecasts(decisions)).toHaveLength(scoreable);
        },
      ),
    );
  });

  it("counts pending and due decisions against the review date", () => {
    const decisions = [
      decision({ reviewAt: NOW + 60_000 }),
      decision({ reviewAt: NOW - 60_000 }),
      decision({ reviewAt: NOW }),
      ...resolved(2, 70, "happened"),
    ];
    const report = buildCalibrationReport(decisions, NOW);
    expect(report.counts.logged).toBe(5);
    expect(report.counts.pending).toBe(1);
    expect(report.counts.due).toBe(2);
    expect(report.counts.resolved).toBe(2);
  });

  it("keeps every count internally consistent", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            confidence: fc.integer({ min: 1, max: 99 }),
            outcome: fc.option(
              fc.constantFrom<Outcome>("happened", "did_not_happen", "unresolvable"),
              { nil: undefined },
            ),
            reviewOffset: fc.integer({ min: -100_000, max: 100_000 }),
            domain: fc.constantFrom(...DOMAINS),
          }),
          { maxLength: 60 },
        ),
        (specs) => {
          const decisions = specs.map((spec) =>
            decision({
              confidence: spec.confidence,
              domain: spec.domain,
              reviewAt: NOW + spec.reviewOffset,
              resolution: spec.outcome
                ? { outcome: spec.outcome, notes: "", resolvedAt: NOW, resolvedSeq: 1 }
                : null,
            }),
          );
          const { counts } = buildCalibrationReport(decisions, NOW);
          expect(counts.logged).toBe(decisions.length);
          expect(counts.pending + counts.due + counts.resolved).toBe(counts.logged);
          expect(counts.scored + counts.unresolvable).toBe(counts.resolved);
        },
      ),
    );
  });

  it("names overconfidence in the direction it actually points", () => {
    // Said 90% twenty times; it happened half the time.
    const decisions = [
      ...resolved(10, 90, "happened"),
      ...resolved(10, 90, "did_not_happen"),
    ];
    const report = buildCalibrationReport(decisions, NOW);
    expect(report.tendency?.direction).toBe("overconfident");
    expect(report.tendency?.gap).toBeCloseTo(0.4, 10);
    expect(report.insight?.direction).toBe("overconfident");
  });

  it("names underconfidence too", () => {
    const decisions = [
      ...resolved(18, 55, "happened"),
      ...resolved(2, 55, "did_not_happen"),
    ];
    const report = buildCalibrationReport(decisions, NOW);
    expect(report.tendency?.direction).toBe("underconfident");
    expect(report.insight?.direction).toBe("underconfident");
  });

  it("stays quiet when the gap is not worth naming", () => {
    const decisions = [
      ...resolved(14, 70, "happened"),
      ...resolved(6, 70, "did_not_happen"),
    ];
    const report = buildCalibrationReport(decisions, NOW);
    expect(report.tendency?.direction).toBe("calibrated");
    expect(report.insight).toBeNull();
  });

  it("reports every domain, with figures only where they are earned", () => {
    const decisions = [
      ...resolved(6, 80, "happened", "technical"),
      ...resolved(2, 80, "happened", "financial"),
    ];
    const report = buildCalibrationReport(decisions, NOW);
    expect(report.byDomain).toHaveLength(DOMAINS.length);

    const technical = report.byDomain.find((d) => d.domain === "technical");
    expect(technical?.scored).toBe(6);
    expect(technical?.brier).toBeCloseTo(0.04, 10);

    const financial = report.byDomain.find((d) => d.domain === "financial");
    expect(financial?.logged).toBe(2);
    expect(financial?.brier).toBeNull();

    const people = report.byDomain.find((d) => d.domain === "people");
    expect(people?.logged).toBe(0);
    expect(people?.brier).toBeNull();
  });

  it("handles a journal with nothing in it", () => {
    const report = buildCalibrationReport([], NOW);
    expect(report.counts).toStrictEqual({
      logged: 0,
      pending: 0,
      due: 0,
      resolved: 0,
      scored: 0,
      unresolvable: 0,
    });
    expect(report.brier).toBeNull();
    expect(report.nextUnlock?.remaining).toBe(CALIBRATION_THRESHOLDS.headline);
  });

  it("withholds the skill score when every outcome went the same way", () => {
    const report = buildCalibrationReport(resolved(25, 70, "happened"), NOW);
    expect(report.decomposition).not.toBeNull();
    expect(report.skillScore).toBeNull();
  });
});
