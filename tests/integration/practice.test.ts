import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  listPracticeAnswers,
  recordPracticeAnswer,
  seenQuestionIds,
  toPracticeAnswers,
} from "@/lib/db/practice";
import { buildPracticeReport } from "@/lib/domain/practice";
import { type Harness, clearJournal, createHarness } from "./harness";

/**
 * The trainer's storage makes one promise: a question can be answered once per
 * account. A second attempt measures memory rather than calibration, and
 * letting it through would quietly inflate the reader's score on exactly the
 * questions they found hard the first time.
 */

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness("practice");
});

afterEach(async () => {
  await clearJournal(harness);
});

afterAll(async () => {
  await harness.close();
});

const answer = (userId: string, questionId: string, overrides = {}) => ({
  userId,
  questionId,
  kind: "population",
  confidence: 70,
  correct: true,
  at: new Date("2026-03-01T10:00:00Z"),
  ...overrides,
});

describe("recordPracticeAnswer", () => {
  it("stores an answer and reads it back", async () => {
    expect(await recordPracticeAnswer(harness, answer("u1", "population:AAA:BBB"))).toBe(
      true,
    );

    const stored = await listPracticeAnswers(harness, "u1");
    expect(stored).toHaveLength(1);
    expect(stored[0].questionId).toBe("population:AAA:BBB");
    expect(stored[0].confidence).toBe(70);
    expect(stored[0].correct).toBe(true);
  });

  it("refuses a second answer to the same question, without throwing", async () => {
    await recordPracticeAnswer(harness, answer("u1", "population:AAA:BBB"));

    const again = await recordPracticeAnswer(
      harness,
      answer("u1", "population:AAA:BBB", { confidence: 99, correct: false }),
    );

    // Not an error — the guarantee working. And the first answer stands.
    expect(again).toBe(false);
    const stored = await listPracticeAnswers(harness, "u1");
    expect(stored).toHaveLength(1);
    expect(stored[0].confidence).toBe(70);
    expect(stored[0].correct).toBe(true);
  });

  it("lets two accounts answer the same question independently", async () => {
    expect(await recordPracticeAnswer(harness, answer("u1", "population:AAA:BBB"))).toBe(
      true,
    );
    expect(await recordPracticeAnswer(harness, answer("u2", "population:AAA:BBB"))).toBe(
      true,
    );

    expect(await listPracticeAnswers(harness, "u1")).toHaveLength(1);
    expect(await listPracticeAnswers(harness, "u2")).toHaveLength(1);
  });

  it("keeps one account's history out of another's", async () => {
    await recordPracticeAnswer(harness, answer("u1", "population:AAA:BBB"));
    await recordPracticeAnswer(harness, answer("u1", "population:CCC:DDD"));
    await recordPracticeAnswer(harness, answer("u2", "area:EEE:FFF"));

    const mine = await listPracticeAnswers(harness, "u1");
    expect(mine).toHaveLength(2);
    expect(mine.every((doc) => doc.userId === "u1")).toBe(true);
  });
});

describe("seenQuestionIds", () => {
  it("reports exactly what this account has answered", async () => {
    await recordPracticeAnswer(harness, answer("u1", "population:AAA:BBB"));
    await recordPracticeAnswer(harness, answer("u1", "area:CCC:DDD"));
    await recordPracticeAnswer(harness, answer("u2", "population:EEE:FFF"));

    const seen = await seenQuestionIds(harness, "u1");
    expect(seen).toEqual(new Set(["population:AAA:BBB", "area:CCC:DDD"]));
  });

  it("is empty for an account that has never practised", async () => {
    expect(await seenQuestionIds(harness, "nobody")).toEqual(new Set());
  });
});

describe("scoring what was stored", () => {
  it("feeds the domain core, which stays silent below its threshold", async () => {
    for (let i = 0; i < 5; i += 1) {
      await recordPracticeAnswer(harness, answer("u1", `population:A${i}:B${i}`));
    }

    const report = buildPracticeReport(
      toPracticeAnswers(await listPracticeAnswers(harness, "u1")),
    );
    expect(report.counts.answered).toBe(5);
    expect(report.brier).toBeNull();
  });

  it("produces a real reading once enough questions have been answered", async () => {
    // Twenty at 80%, sixteen of them right: exactly calibrated.
    for (let i = 0; i < 20; i += 1) {
      await recordPracticeAnswer(
        harness,
        answer("u1", `population:A${i}:B${i}`, {
          confidence: 80,
          correct: i < 16,
        }),
      );
    }

    const report = buildPracticeReport(
      toPracticeAnswers(await listPracticeAnswers(harness, "u1")),
    );
    expect(report.counts.answered).toBe(20);
    expect(report.counts.correct).toBe(16);
    expect(report.hitRate).toBeCloseTo(0.8, 12);
    expect(report.direction).toBe("calibrated");
    // (0.8-1)^2 * 16 + (0.8-0)^2 * 4, over 20.
    expect(report.brier).toBeCloseTo((0.04 * 16 + 0.64 * 4) / 20, 12);
  });
});
