import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { genesisPrevHash, sealEntry } from "@/lib/domain/chain";
import { rebuildDecisions } from "@/lib/domain/rebuild";
import type { LedgerEntry, UnsealedLedgerEntry } from "@/lib/schemas/domain";
import { chainArb } from "./arbitraries";

/** Build a chain from raw drafts, sealing as it goes. */
function chainOf(
  userId: string,
  drafts: Array<Omit<UnsealedLedgerEntry, "userId" | "seq" | "prevHash">>,
): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  let prevHash = genesisPrevHash(userId);
  drafts.forEach((draft, index) => {
    const sealed = sealEntry({
      ...draft,
      userId,
      seq: index + 1,
      prevHash,
    } as UnsealedLedgerEntry);
    entries.push(sealed);
    prevHash = sealed.hash;
  });
  return entries;
}

const lock = (decisionId: string, confidence = 70, at = 1_700_000_000_000) =>
  ({
    type: "decision_locked" as const,
    at,
    payload: {
      decisionId,
      title: "Take the offer",
      situation: "",
      expectedOutcome: "I will still be there in a year",
      confidence,
      domain: "career" as const,
      tags: [],
      reviewAt: at + 86_400_000,
      reviewLocal: { date: "2026-01-01", time: "09:00", timeZone: "UTC" },
    },
  }) satisfies Omit<UnsealedLedgerEntry, "userId" | "seq" | "prevHash">;

const resolve = (
  decisionId: string,
  outcome: "happened" | "did_not_happen" | "unresolvable" = "happened",
  at = 1_700_100_000_000,
) =>
  ({
    type: "decision_resolved" as const,
    at,
    payload: { decisionId, outcome, notes: "" },
  }) satisfies Omit<UnsealedLedgerEntry, "userId" | "seq" | "prevHash">;

const reschedule = (decisionId: string, reviewAt: number, at = 1_700_050_000_000) =>
  ({
    type: "review_rescheduled" as const,
    at,
    payload: {
      decisionId,
      reviewAt,
      reviewLocal: { date: "2026-06-01", time: "09:00", timeZone: "UTC" },
    },
  }) satisfies Omit<UnsealedLedgerEntry, "userId" | "seq" | "prevHash">;

const ID_A = "aaaaaaaaaaaaaaaa";
const ID_B = "bbbbbbbbbbbbbbbb";

describe("rebuildDecisions", () => {
  it("reproduces one decision per locking event, in order", () => {
    fc.assert(
      fc.property(chainArb, ({ userId, entries }) => {
        const { decisions, anomalies } = rebuildDecisions(userId, entries);
        const locks = entries.filter((entry) => entry.type === "decision_locked");
        expect(anomalies).toStrictEqual([]);
        expect(decisions).toHaveLength(locks.length);
        expect(decisions.map((d) => d.decisionId)).toStrictEqual(
          locks.map((entry) => entry.payload.decisionId),
        );
      }),
    );
  });

  it("does not depend on the order entries arrive in", () => {
    fc.assert(
      fc.property(chainArb, ({ userId, entries }) => {
        const forwards = rebuildDecisions(userId, entries);
        const backwards = rebuildDecisions(userId, [...entries].reverse());
        expect(backwards.decisions).toStrictEqual(forwards.decisions);
      }),
    );
  });

  it("carries the locked belief through untouched", () => {
    const entries = chainOf("u1", [lock(ID_A, 85)]);
    const { decisions } = rebuildDecisions("u1", entries);
    expect(decisions[0].confidence).toBe(85);
    expect(decisions[0].expectedOutcome).toBe("I will still be there in a year");
    expect(decisions[0].lockedSeq).toBe(1);
    expect(decisions[0].entryHash).toBe(entries[0].hash);
    expect(decisions[0].resolution).toBeNull();
    expect(decisions[0].rescheduleCount).toBe(0);
  });

  it("records a resolution without touching the prediction", () => {
    const entries = chainOf("u1", [lock(ID_A, 85), resolve(ID_A, "did_not_happen")]);
    const { decisions } = rebuildDecisions("u1", entries);
    expect(decisions[0].confidence).toBe(85);
    expect(decisions[0].resolution).toStrictEqual({
      outcome: "did_not_happen",
      notes: "",
      resolvedAt: 1_700_100_000_000,
      resolvedSeq: 2,
    });
  });

  it("moves the review date and counts the move", () => {
    const entries = chainOf("u1", [
      lock(ID_A),
      reschedule(ID_A, 1_800_000_000_000),
      reschedule(ID_A, 1_900_000_000_000),
    ]);
    const { decisions } = rebuildDecisions("u1", entries);
    expect(decisions[0].reviewAt).toBe(1_900_000_000_000);
    expect(decisions[0].rescheduleCount).toBe(2);
  });

  it("flags a decision locked twice", () => {
    const entries = chainOf("u1", [lock(ID_A), lock(ID_A)]);
    const { decisions, anomalies } = rebuildDecisions("u1", entries);
    expect(decisions).toHaveLength(1);
    expect(anomalies).toStrictEqual([
      { seq: 2, type: "decision_locked", decisionId: ID_A, reason: "duplicate_lock" },
    ]);
  });

  it("flags a decision resolved twice and keeps the first answer", () => {
    const entries = chainOf("u1", [
      lock(ID_A),
      resolve(ID_A, "happened"),
      resolve(ID_A, "did_not_happen"),
    ]);
    const { decisions, anomalies } = rebuildDecisions("u1", entries);
    expect(decisions[0].resolution?.outcome).toBe("happened");
    expect(anomalies[0].reason).toBe("already_resolved");
  });

  it("flags an event for a decision that was never locked", () => {
    const entries = chainOf("u1", [lock(ID_A), resolve(ID_B)]);
    const { decisions, anomalies } = rebuildDecisions("u1", entries);
    expect(decisions).toHaveLength(1);
    expect(anomalies[0].reason).toBe("unknown_decision");
  });

  it("flags a reschedule after the answer was already recorded", () => {
    const entries = chainOf("u1", [
      lock(ID_A),
      resolve(ID_A),
      reschedule(ID_A, 1_900_000_000_000),
    ]);
    const { decisions, anomalies } = rebuildDecisions("u1", entries);
    expect(decisions[0].rescheduleCount).toBe(0);
    expect(anomalies[0].reason).toBe("reschedule_after_resolution");
  });

  it("returns nothing for an empty record", () => {
    expect(rebuildDecisions("u1", [])).toStrictEqual({ decisions: [], anomalies: [] });
  });

  it("does not alias arrays or objects from the ledger into the view", () => {
    const entries = chainOf("u1", [lock(ID_A)]);
    const { decisions } = rebuildDecisions("u1", entries);
    decisions[0].tags.push("mutated");
    decisions[0].reviewLocal.timeZone = "Mars/Olympus_Mons";
    const rebuilt = rebuildDecisions("u1", entries);
    expect(rebuilt.decisions[0].tags).toStrictEqual([]);
    expect(rebuilt.decisions[0].reviewLocal.timeZone).toBe("UTC");
  });
});
