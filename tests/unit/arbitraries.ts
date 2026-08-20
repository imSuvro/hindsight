import fc from "fast-check";
import { sealEntry, genesisPrevHash } from "@/lib/domain/chain";
import type { ResolvedForecast } from "@/lib/domain/scoring";
import {
  DOMAINS,
  type LedgerEntry,
  type ReviewLocal,
  type UnsealedLedgerEntry,
} from "@/lib/schemas/domain";

/** Shared generators. Keeping them in one place keeps the suites comparable. */

export const confidenceArb = fc.integer({ min: 1, max: 99 });

export const resolvedForecastArb: fc.Arbitrary<ResolvedForecast> = fc.record({
  confidence: confidenceArb,
  occurred: fc.boolean(),
});

export const forecastsArb = (minLength = 1, maxLength = 200) =>
  fc.array(resolvedForecastArb, { minLength, maxLength });

/**
 * Forecasts drawn from a deliberately small confidence vocabulary, which is how
 * people actually behave — everyone reaches for 70, 80 and 90.
 */
export const clusteredForecastsArb = (minLength = 1, maxLength = 200) =>
  fc.array(
    fc.record({
      confidence: fc.constantFrom(10, 25, 50, 60, 70, 75, 80, 90, 95),
      occurred: fc.boolean(),
    }),
    { minLength, maxLength },
  );

// ---------------------------------------------------------------------------
// Canonical-form values
// ---------------------------------------------------------------------------

/** Object keys that are safe to place on a plain object literal. */
const safeKeyArb = fc
  .string({ minLength: 1, maxLength: 12 })
  .filter((key) => key !== "__proto__");

export const canonicalValueArb: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
  value: fc.oneof(
    { maxDepth: 3, withCrossShrink: true },
    fc.constant(null),
    fc.boolean(),
    fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
    fc.string(),
    fc.array(tie("value"), { maxLength: 4 }),
    fc.dictionary(safeKeyArb, tie("value"), { maxKeys: 5, noNullPrototype: true }),
  ),
})).value;

/** Values `canonicalize` must refuse rather than coerce. */
export const nonCanonicalValueArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(undefined),
  fc.constant(Number.NaN),
  fc.constant(Number.POSITIVE_INFINITY),
  fc.constant(Number.NEGATIVE_INFINITY),
  fc.double({ min: 0.01, max: 0.99, noInteger: true, noNaN: true }),
  fc.constant(new Date(0)),
  fc.constant(new Map()),
  fc.constant(new Set()),
  fc.constant(() => undefined),
  fc.bigInt(),
);

// ---------------------------------------------------------------------------
// Ledger chains
// ---------------------------------------------------------------------------

export const decisionIdArb = fc
  .array(
    fc.constantFrom(
      ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".split(""),
    ),
    { minLength: 16, maxLength: 16 },
  )
  .map((chars) => chars.join(""));

export const userIdArb = fc
  .string({ minLength: 6, maxLength: 24 })
  .filter((s) => s.trim().length >= 6);

const reviewLocalArb: fc.Arbitrary<ReviewLocal> = fc.record({
  date: fc
    .date({
      min: new Date("2020-01-01T00:00:00Z"),
      max: new Date("2040-01-01T00:00:00Z"),
      noInvalidDate: true,
    })
    .map((d) => d.toISOString().slice(0, 10)),
  time: fc.constantFrom("09:00", "12:30", "18:45", "07:15"),
  timeZone: fc.constantFrom(
    "UTC",
    "America/New_York",
    "Europe/London",
    "Asia/Kolkata",
    "Australia/Sydney",
  ),
});

const instantArb = fc.integer({ min: 1_600_000_000_000, max: 2_200_000_000_000 });

/**
 * A plausible sequence of things one user did, in the order they did them:
 * decisions get locked, some get rescheduled, some get resolved. Only sequences
 * the product could actually produce — the invalid ones are constructed
 * explicitly in the tests that care about them.
 */
export const chainArb: fc.Arbitrary<{ userId: string; entries: LedgerEntry[] }> = fc
  .tuple(
    userIdArb,
    fc.array(
      fc.record({
        decisionId: decisionIdArb,
        title: fc.string({ minLength: 1, maxLength: 60 }).filter((s) => s.trim() !== ""),
        situation: fc.string({ maxLength: 80 }),
        expectedOutcome: fc
          .string({ minLength: 1, maxLength: 60 })
          .filter((s) => s.trim() !== ""),
        confidence: confidenceArb,
        domain: fc.constantFrom(...DOMAINS),
        tags: fc.array(fc.constantFrom("work", "money", "health", "team"), {
          maxLength: 3,
        }),
        reviewAt: instantArb,
        reviewLocal: reviewLocalArb,
        at: instantArb,
        resolve: fc.option(
          fc.record({
            outcome: fc.constantFrom(
              "happened" as const,
              "did_not_happen" as const,
              "unresolvable" as const,
            ),
            notes: fc.string({ maxLength: 60 }),
            at: instantArb,
          }),
          { nil: undefined },
        ),
        reschedule: fc.option(
          fc.record({
            reviewAt: instantArb,
            reviewLocal: reviewLocalArb,
            at: instantArb,
          }),
          { nil: undefined },
        ),
      }),
      { minLength: 1, maxLength: 12 },
    ),
  )
  .map(([userId, specs]) => {
    const seen = new Set<string>();
    const unique = specs.filter((spec) => {
      if (seen.has(spec.decisionId)) return false;
      seen.add(spec.decisionId);
      return true;
    });

    const entries: LedgerEntry[] = [];
    let prevHash = genesisPrevHash(userId);
    let seq = 0;

    const append = (draft: Omit<UnsealedLedgerEntry, "userId" | "seq" | "prevHash">) => {
      seq += 1;
      const sealed = sealEntry({
        ...draft,
        userId,
        seq,
        prevHash,
      } as UnsealedLedgerEntry);
      entries.push(sealed);
      prevHash = sealed.hash;
    };

    for (const spec of unique) {
      append({
        type: "decision_locked",
        at: spec.at,
        payload: {
          decisionId: spec.decisionId,
          title: spec.title.normalize("NFC").trim(),
          situation: spec.situation.normalize("NFC").trim(),
          expectedOutcome: spec.expectedOutcome.normalize("NFC").trim(),
          confidence: spec.confidence,
          domain: spec.domain,
          tags: [...new Set(spec.tags)].sort(),
          reviewAt: spec.reviewAt,
          reviewLocal: spec.reviewLocal,
        },
      });
      if (spec.reschedule) {
        append({
          type: "review_rescheduled",
          at: spec.reschedule.at,
          payload: {
            decisionId: spec.decisionId,
            reviewAt: spec.reschedule.reviewAt,
            reviewLocal: spec.reschedule.reviewLocal,
          },
        });
      }
      if (spec.resolve) {
        append({
          type: "decision_resolved",
          at: spec.resolve.at,
          payload: {
            decisionId: spec.decisionId,
            outcome: spec.resolve.outcome,
            notes: spec.resolve.notes.normalize("NFC").trim(),
          },
        });
      }
    }

    return { userId, entries };
  });
