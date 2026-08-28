import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DIFFICULTY_BANDS,
  GUESSING_BRIER,
  MIN_RATIO,
  PRACTICE_THRESHOLDS,
  type PracticePool,
  SESSION_LENGTH,
  buildPracticeReport,
  buildSession,
  difficultyOf,
  isUsableId,
  questionId,
  resolveQuestion,
  toForecasts,
} from "@/lib/domain/practice";
import { brierScore } from "@/lib/domain/scoring";
import { practiceAnswersArb } from "./arbitraries";

/**
 * The trainer exists so a new journal is not silent for a season. Three
 * promises hold it up: it scores with the same arithmetic as the journal, it
 * refuses to say anything before it has grounds, and it never tells the browser
 * which answer is right.
 */

const answers = (count: number, confidence: number, correct: boolean) =>
  Array.from({ length: count }, () => ({ confidence, correct }));

/** A geometric spread, so every difficulty band is reachable. */
const pool = (kind: string, count = 60, ratio = 1.18): PracticePool => ({
  kind,
  subjects: Array.from({ length: count }, (_, i) => ({
    id: `${kind}${i}`,
    label: `${kind} ${i}`,
    value: Math.round(1000 * ratio ** i),
  })),
});

const POOLS = [pool("population"), pool("area", 60, 1.25)];

/**
 * The figures for a question. Only reachable by resolving it server-side, which
 * is the enforcement being tested rather than an inconvenience around it.
 */
const valuesOf = (id: string): [number, number] => {
  const key = resolveQuestion(POOLS, id);
  if (!key) throw new Error(`unresolvable: ${id}`);
  return [key.options[0].value, key.options[1].value];
};

describe("buildPracticeReport", () => {
  it("says nothing at all before the headline threshold", () => {
    fc.assert(
      fc.property(practiceAnswersArb(0, PRACTICE_THRESHOLDS.headline - 1), (given) => {
        const report = buildPracticeReport(given);
        expect(report.brier).toBeNull();
        expect(report.hitRate).toBeNull();
        expect(report.meanConfidence).toBeNull();
        expect(report.gap).toBeNull();
        expect(report.direction).toBeNull();
        expect(report.edgeOverGuessing).toBeNull();
        expect(report.bins).toEqual([]);
        expect(report.counts.answered).toBe(given.length);
      }),
    );
  });

  it("withholds the decomposition until its own, higher threshold", () => {
    fc.assert(
      fc.property(
        practiceAnswersArb(
          PRACTICE_THRESHOLDS.headline,
          PRACTICE_THRESHOLDS.decomposition - 1,
        ),
        (given) => {
          const report = buildPracticeReport(given);
          expect(report.brier).not.toBeNull();
          expect(report.decomposition).toBeNull();
          expect(report.skillScore).toBeNull();
        },
      ),
    );
  });

  it("scores with exactly the same arithmetic as the journal", () => {
    fc.assert(
      fc.property(practiceAnswersArb(PRACTICE_THRESHOLDS.headline, 200), (given) => {
        const report = buildPracticeReport(given);
        expect(report.brier).toBeCloseTo(brierScore(toForecasts(given)), 12);
      }),
    );
  });

  it("never reports a count it cannot support", () => {
    fc.assert(
      fc.property(practiceAnswersArb(0, 200), (given) => {
        const report = buildPracticeReport(given);
        expect(report.counts.answered).toBe(given.length);
        expect(report.counts.correct).toBe(given.filter((a) => a.correct).length);
        expect(report.counts.correct).toBeLessThanOrEqual(report.counts.answered);
        expect(report.remainingForHeadline).toBeGreaterThanOrEqual(0);
        expect(report.remainingForDecomposition).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("does not depend on the order the questions were answered in", () => {
    fc.assert(
      fc.property(practiceAnswersArb(PRACTICE_THRESHOLDS.decomposition, 120), (given) => {
        const rotated = [...given.slice(1), given[0]];
        const a = buildPracticeReport(given);
        const b = buildPracticeReport(rotated);
        expect(b.brier).toBeCloseTo(a.brier as number, 12);
        expect(b.hitRate).toBeCloseTo(a.hitRate as number, 12);
      }),
    );
  });

  it("calls someone always sure and always right calibrated, not overconfident", () => {
    // 99% stated, 100% achieved: a one-point gap, inside the noise band.
    const report = buildPracticeReport(answers(40, 99, true));
    expect(report.direction).toBe("calibrated");
    expect(report.hitRate).toBe(1);
  });

  it("names overconfidence when the gap is real, with the arithmetic to match", () => {
    const report = buildPracticeReport([
      ...answers(20, 90, true),
      ...answers(20, 90, false),
    ]);
    expect(report.direction).toBe("overconfident");
    expect(report.gap).toBeCloseTo(0.9 - 0.5, 12);
    // ((0.9 - 1)^2 + (0.9 - 0)^2) / 2 = (0.01 + 0.81) / 2
    expect(report.brier).toBeCloseTo((0.01 + 0.81) / 2, 12);
  });

  it("names underconfidence too", () => {
    const report = buildPracticeReport([
      ...answers(36, 60, true),
      ...answers(4, 60, false),
    ]);
    expect(report.direction).toBe("underconfident");
  });

  it("returns a null skill score rather than a number when every answer agreed", () => {
    // Uncertainty is zero, so the quantity does not exist. Rendering it as 0
    // would read as "no better than your own base rate", which is a claim.
    const report = buildPracticeReport(answers(45, 80, true));
    expect(report.decomposition).not.toBeNull();
    expect(report.skillScore).toBeNull();
  });

  describe("edge over guessing", () => {
    it("is zero for someone who shrugs at everything", () => {
      // 50 to everything scores exactly 0.25 whatever happens.
      const report = buildPracticeReport([
        ...answers(10, 50, true),
        ...answers(10, 50, false),
      ]);
      expect(report.brier).toBeCloseTo(GUESSING_BRIER, 12);
      expect(report.edgeOverGuessing).toBeCloseTo(0, 12);
    });

    it("approaches one for someone who is sure and right", () => {
      const report = buildPracticeReport(answers(20, 99, true));
      expect(report.edgeOverGuessing as number).toBeGreaterThan(0.99);
    });

    it("goes negative when the confidence is actively misleading", () => {
      const report = buildPracticeReport(answers(20, 95, false));
      expect(report.edgeOverGuessing as number).toBeLessThan(0);
    });

    it("is defined wherever the Brier score is, unlike the skill score", () => {
      fc.assert(
        fc.property(practiceAnswersArb(PRACTICE_THRESHOLDS.headline, 100), (given) => {
          const report = buildPracticeReport(given);
          expect(report.edgeOverGuessing).not.toBeNull();
          expect(report.edgeOverGuessing).toBeCloseTo(
            1 - (report.brier as number) / GUESSING_BRIER,
            12,
          );
        }),
      );
    });
  });
});

describe("the diagram's caption", () => {
  /*
   * The report has to carry `insight`, because the chart writes its caption
   * from it and an absent one is not neutral: the chart falls through to "no
   * band is meaningfully off the line", which is a claim about the data. The
   * practice page shipped without it, so the trainer told every reader their
   * confidence had tracked reality — directly under a headline saying it ran
   * twenty points hot.
   */
  it("names the band furthest off the line when one is really off", () => {
    const given = [
      ...answers(20, 90, true).slice(0, 10),
      ...answers(10, 90, false),
      ...answers(12, 60, true),
      ...answers(8, 60, false),
    ];
    const report = buildPracticeReport(given);
    expect(report.insight).not.toBeNull();
    // The 90 band came off half the time; the 60 band is on the line.
    expect(report.insight?.bin.lowerConfidence).toBe(90);
    expect(report.insight?.direction).toBe("overconfident");
    expect(Math.abs(report.insight?.gap ?? 0)).toBeGreaterThan(0.05);
  });

  it("reports no insight only when nothing is meaningfully off", () => {
    // Said 80, right 80% of the time: on the line.
    const report = buildPracticeReport([
      ...answers(32, 80, true),
      ...answers(8, 80, false),
    ]);
    expect(report.insight).toBeNull();
  });

  it("has no insight below the threshold, because it has no bins", () => {
    const report = buildPracticeReport(answers(5, 90, false));
    expect(report.bins).toEqual([]);
    expect(report.insight).toBeNull();
  });
});

describe("buildSession", () => {
  it("delivers exactly the number of questions it promised", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), (seed) => {
        expect(buildSession(POOLS, { seed }).length).toBe(SESSION_LENGTH);
      }),
    );
  });

  it("never asks the same pair, or the same subject, twice in one sitting", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), (seed) => {
        const session = buildSession(POOLS, { seed });
        expect(new Set(session.map((q) => q.id)).size).toBe(session.length);

        const subjects = session.flatMap((q) => q.options.map((o) => o.id));
        expect(new Set(subjects).size).toBe(subjects.length);
      }),
    );
  });

  it("is deterministic: the same seed gives the same session", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), (seed) => {
        const a = buildSession(POOLS, { seed });
        const b = buildSession(POOLS, { seed });
        expect(b.map((q) => q.id)).toEqual(a.map((q) => q.id));
      }),
    );
  });

  it("carries no answer at all — the browser must not be told", () => {
    /*
     * The type forbids it, but a spread or a stray assignment would not be
     * caught at runtime, and a trainer whose answers are in the page source
     * measures nothing. So the shape is asserted, not assumed.
     */
    for (const question of buildSession(POOLS, { seed: "leak-check" })) {
      expect(Object.keys(question).sort()).toEqual([
        "difficulty",
        "id",
        "kind",
        "options",
      ]);

      /*
       * The figures matter more than the field name. Serialising `value` or
       * `detail` alongside the labels would hand over the answer without
       * anything called "answerId" appearing anywhere — which is exactly the
       * leak that shipped and had to be caught by reading the served bytes.
       */
      for (const option of question.options) {
        expect(Object.keys(option).sort()).toEqual(["id", "label"]);
      }
      const serialised = JSON.stringify(question);
      expect(serialised).not.toContain("answerId");
      expect(serialised).not.toContain("value");
      expect(serialised).not.toContain("detail");
    }
  });

  it("keeps every pair inside the band it was drawn for", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), (seed) => {
        for (const question of buildSession(POOLS, { seed })) {
          const [a, b] = valuesOf(question.id);
          const ratio = Math.max(a, b) / Math.min(a, b);
          const band = DIFFICULTY_BANDS[question.difficulty];
          expect(ratio).toBeGreaterThanOrEqual(band.min);
          expect(ratio).toBeLessThan(band.max);
        }
      }),
    );
  });

  it("never asks a question inside the correctness floor", () => {
    /*
     * Two countries a couple of percent apart is not a fact anyone can be
     * calibrated about — the gap is inside the source's own estimation error —
     * and the real dataset contains outright ties where no answer exists.
     */
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), (seed) => {
        for (const question of buildSession(POOLS, { seed })) {
          const [a, b] = valuesOf(question.id);
          const ratio = Math.max(a, b) / Math.min(a, b);
          expect(ratio).toBeGreaterThanOrEqual(MIN_RATIO);
        }
      }),
    );
  });

  it("spreads difficulty instead of asking mostly gimmes", () => {
    // Uniform pairing would put every answer at 95-99% and collapse the
    // diagram into one corner. A quarter of a session must be genuinely close.
    const session = buildSession(POOLS, { seed: "spread" });
    const close = session.filter((q) => q.difficulty === "close").length;
    const clear = session.filter((q) => q.difficulty === "clear").length;
    expect(close).toBeGreaterThanOrEqual(5);
    expect(clear).toBeLessThanOrEqual(8);
  });

  it("does not let position predict difficulty", () => {
    // A run that ramps teaches the reader to lower confidence by the clock.
    const first = SESSION_LENGTH / 2;
    const session = buildSession(POOLS, { seed: "ramp" });
    const closeEarly = session
      .slice(0, first)
      .filter((q) => q.difficulty === "close").length;
    const closeLate = session.slice(first).filter((q) => q.difficulty === "close").length;
    expect(Math.abs(closeEarly - closeLate)).toBeLessThanOrEqual(2);
  });

  it("does not encode the answer in the order the options are shown", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      buildSession(POOLS, { seed: `order-${i}` }),
    ).flat();
    const largerFirst = many.filter((q) => {
      const key = resolveQuestion(POOLS, q.id);
      return key !== null && key.answerId === q.options[0].id;
    }).length;
    const share = largerFirst / many.length;
    expect(share).toBeGreaterThan(0.35);
    expect(share).toBeLessThan(0.65);
  });

  it("prefers unseen pairs, so a returning account meets new questions", () => {
    const first = buildSession(POOLS, { seed: "return" });
    const seen = new Set(first.map((q) => q.id));
    const second = buildSession(POOLS, { seed: "return", exclude: seen });
    expect(second.some((q) => seen.has(q.id))).toBe(false);
  });

  it("still delivers a full session when almost everything is excluded", () => {
    // Short is the worse failure: promising twenty and giving seventeen looks
    // broken, where a repeat merely looks like a repeat.
    const small = [pool("tiny", 8, 1.6)];
    const everything = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      for (const q of buildSession(small, { seed: `fill-${i}` })) everything.add(q.id);
    }
    const session = buildSession(small, { seed: "squeezed", exclude: everything });
    expect(session.length).toBe(SESSION_LENGTH);
  });

  it("returns nothing rather than something broken when it cannot build one", () => {
    expect(buildSession([], { seed: "x" })).toEqual([]);
    expect(buildSession([{ kind: "k", subjects: [] }], { seed: "x" })).toEqual([]);
    expect(buildSession(POOLS, { seed: "x", length: 0 })).toEqual([]);
  });

  it("ignores subjects with a non-positive value rather than taking log of zero", () => {
    const dirty: PracticePool = {
      kind: "k",
      subjects: [
        { id: "zero", label: "Zero", value: 0 },
        { id: "neg", label: "Negative", value: -5 },
        ...pool("k", 20).subjects,
      ],
    };
    for (const question of buildSession([dirty], { seed: "dirty" })) {
      const key = resolveQuestion([dirty], question.id);
      expect(key).not.toBeNull();
      expect(key?.options[0].value).toBeGreaterThan(0);
      expect(key?.options[1].value).toBeGreaterThan(0);
    }
  });

  it("draws from every pool it was given", () => {
    const kinds = new Set(buildSession(POOLS, { seed: "kinds" }).map((q) => q.kind));
    expect(kinds.size).toBe(2);
  });
});

describe("resolveQuestion", () => {
  it("resolves every question a session produced, and marks the larger value", () => {
    /*
     * The load-bearing property. The browser posts only an id; if any generated
     * question failed to resolve, that answer could never be scored.
     */
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), (seed) => {
        for (const question of buildSession(POOLS, { seed })) {
          const key = resolveQuestion(POOLS, question.id);
          expect(key).not.toBeNull();
          const [a, b] = (key as NonNullable<typeof key>).options;
          const larger = a.value > b.value ? a : b;
          expect((key as NonNullable<typeof key>).answerId).toBe(larger.id);
        }
      }),
    );
  });

  it("refuses a forged or unresolvable id rather than scoring it", () => {
    for (const bad of [
      "",
      "nonsense",
      "population",
      "population:population0",
      "population:population0:population0",
      "population:population0:does-not-exist",
      "no-such-kind:population0:population1",
      "population:population0:population1:extra",
    ]) {
      expect(resolveQuestion(POOLS, bad)).toBeNull();
    }
  });

  it("refuses a pair inside the correctness floor even if asked directly", () => {
    const tied: PracticePool = {
      kind: "area",
      subjects: [
        { id: "aruba", label: "Aruba", value: 180 },
        { id: "marshall", label: "Marshall Islands", value: 180 },
        { id: "big", label: "Big", value: 100_000 },
      ],
    };
    // The real dataset contains exactly this tie; a question with no right
    // answer must not be scoreable.
    expect(resolveQuestion([tied], questionId("area", "aruba", "marshall"))).toBeNull();
    expect(resolveQuestion([tied], questionId("area", "aruba", "big"))).not.toBeNull();
  });

  it("returns the canonical id, so one pair cannot be stored twice", () => {
    /*
     * The id is the storage key. Returning whatever spelling was posted let
     * `population:B:A` and `population:A:B` become two rows for one pair, so a
     * question could be answered and scored twice.
     */
    const canonical = questionId("population", "population3", "population9");
    const reversed = "population:population9:population3";
    expect(reversed).not.toBe(canonical);

    const key = resolveQuestion(POOLS, reversed);
    expect(key).not.toBeNull();
    expect(key?.id).toBe(canonical);
  });

  it("gives the same answer whichever way the pair is named", () => {
    const forward = resolveQuestion(
      POOLS,
      questionId("population", "population3", "population9"),
    );
    const backward = resolveQuestion(
      POOLS,
      questionId("population", "population9", "population3"),
    );
    expect(forward?.answerId).toBe(backward?.answerId);
  });
});

describe("questionId", () => {
  it("is the same however the pair is ordered", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.string(), (kind, a, b) => {
        expect(questionId(kind, a, b)).toBe(questionId(kind, b, a));
      }),
    );
  });

  it("separates the same pair asked about different things", () => {
    expect(questionId("population", "a", "b")).not.toBe(questionId("area", "a", "b"));
  });

  it("rejects ids that would make the question id ambiguous", () => {
    expect(isUsableId("FRA")).toBe(true);
    expect(isUsableId("")).toBe(false);
    expect(isUsableId("a:b")).toBe(false);
  });
});

describe("difficultyOf", () => {
  it("names each band at its own boundaries", () => {
    expect(difficultyOf(MIN_RATIO)).toBe("close");
    expect(difficultyOf(1.49)).toBe("close");
    expect(difficultyOf(1.5)).toBe("near");
    expect(difficultyOf(3.99)).toBe("near");
    expect(difficultyOf(4)).toBe("clear");
    expect(difficultyOf(1000)).toBe("clear");
  });
});
