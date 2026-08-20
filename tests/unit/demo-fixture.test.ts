import { describe, expect, it } from "vitest";
import {
  DEMO_NOW,
  DEMO_USER_ID,
  demoChain,
  demoDecisions,
  demoHead,
} from "@/fixtures/demo";
import { verifyChain } from "@/lib/domain/chain";
import { CALIBRATION_THRESHOLDS, buildCalibrationReport } from "@/lib/domain/calibration";
import { rebuildDecisions } from "@/lib/domain/rebuild";

/**
 * The sample journal is the first thing most visitors see, and it is built from
 * real sealed entries rather than mocked data. These tests keep it that way:
 * if the hashing scheme, the fold or the scoring changed underneath it, the
 * demo would quietly start showing something the product does not do.
 */
describe("the sample journal", () => {
  it("is a valid chain", () => {
    const chain = demoChain();
    expect(chain.length).toBeGreaterThan(30);
    expect(verifyChain(DEMO_USER_ID, chain).valid).toBe(true);
  });

  it("folds without anomalies", () => {
    const { anomalies } = rebuildDecisions(DEMO_USER_ID, demoChain());
    expect(anomalies).toStrictEqual([]);
  });

  it("is deterministic across calls", () => {
    expect(demoHead()).toStrictEqual(demoHead());
    expect(demoChain()[0].hash).toBe(demoChain()[0].hash);
  });

  it("carries enough resolved decisions to unlock every figure", () => {
    const report = buildCalibrationReport(demoDecisions(), DEMO_NOW);
    expect(report.counts.scored).toBeGreaterThanOrEqual(
      CALIBRATION_THRESHOLDS.decomposition,
    );
    expect(report.brier).not.toBeNull();
    expect(report.decomposition).not.toBeNull();
    expect(report.bins.length).toBeGreaterThanOrEqual(3);
  });

  it("shows something worth looking at", () => {
    const report = buildCalibrationReport(demoDecisions(), DEMO_NOW);
    // A sample where the forecaster is perfect would teach nobody anything;
    // one where they are catastrophic would not be believable.
    expect(report.tendency?.direction).toBe("overconfident");
    expect(report.insight).not.toBeNull();
    expect(Math.abs(report.tendency?.gap ?? 0)).toBeGreaterThan(0.1);
    expect(Math.abs(report.tendency?.gap ?? 1)).toBeLessThan(0.3);
  });

  it("demonstrates the small-sample rule as well as the figures", () => {
    const report = buildCalibrationReport(demoDecisions(), DEMO_NOW);
    const withFigures = report.byDomain.filter((domain) => domain.brier !== null);
    const withoutFigures = report.byDomain.filter((domain) => domain.brier === null);
    expect(withFigures.length).toBeGreaterThan(0);
    expect(withoutFigures.length).toBeGreaterThan(0);
  });

  it("has decisions in every state, so every part of the interface is exercised", () => {
    const report = buildCalibrationReport(demoDecisions(), DEMO_NOW);
    expect(report.counts.due).toBeGreaterThan(0);
    expect(report.counts.pending).toBeGreaterThan(0);
    expect(report.counts.resolved).toBeGreaterThan(0);
    expect(report.counts.unresolvable).toBeGreaterThan(0);
  });

  it("never mentions a real person or organisation by a name that could be traced", () => {
    // The sample is invented. This is a guard against someone later pasting in
    // a real journal entry while editing it.
    const text = JSON.stringify(demoDecisions());
    expect(text).not.toMatch(/@[a-z0-9-]+\.(com|org|net|io|co)/i);
    expect(text).not.toMatch(/https?:\/\//);
  });
});
