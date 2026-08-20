import type { DecisionView, LedgerEntry, LedgerEventType } from "@/lib/schemas/domain";

/**
 * Folding the ledger back into the decisions the interface reads.
 *
 * The `decisions` collection is a projection, not a source of truth: every
 * field in it is derivable from the append-only ledger by replaying events in
 * order. Keeping that fold as a pure function has three payoffs — the
 * verification endpoint can prove the projection matches the record, the demo
 * journal is built from fixture events by the same code path as real data, and
 * a projection damaged by a bug can be rebuilt rather than hand-repaired.
 */

export type AnomalyReason =
  | "duplicate_lock"
  | "unknown_decision"
  | "already_resolved"
  | "reschedule_after_resolution";

export const ANOMALY_MESSAGES: Record<AnomalyReason, string> = {
  duplicate_lock: "A decision was locked twice.",
  unknown_decision: "An event refers to a decision that was never locked.",
  already_resolved: "A decision was resolved more than once.",
  reschedule_after_resolution: "A resolved decision was rescheduled.",
};

export type LedgerAnomaly = {
  seq: number;
  type: LedgerEventType;
  decisionId: string;
  reason: AnomalyReason;
};

export type RebuildResult = {
  decisions: DecisionView[];
  anomalies: LedgerAnomaly[];
};

/**
 * Replay `entries` into decision views.
 *
 * Structural tampering is caught by `verifyChain`; this catches the semantic
 * kind — an event that could not have been produced by using the product, such
 * as a decision resolved twice. Anomalies are collected rather than thrown so
 * the verification page can report every problem it found instead of only the
 * first.
 */
export function rebuildDecisions(
  userId: string,
  entries: readonly LedgerEntry[],
): RebuildResult {
  const ordered = [...entries].sort((a, b) => a.seq - b.seq);
  const byId = new Map<string, DecisionView>();
  const anomalies: LedgerAnomaly[] = [];

  const flag = (entry: LedgerEntry, reason: AnomalyReason): void => {
    anomalies.push({
      seq: entry.seq,
      type: entry.type,
      decisionId: entry.payload.decisionId,
      reason,
    });
  };

  for (const entry of ordered) {
    const { decisionId } = entry.payload;

    if (entry.type === "decision_locked") {
      if (byId.has(decisionId)) {
        flag(entry, "duplicate_lock");
        continue;
      }
      const payload = entry.payload;
      byId.set(decisionId, {
        decisionId,
        userId,
        title: payload.title,
        situation: payload.situation,
        expectedOutcome: payload.expectedOutcome,
        confidence: payload.confidence,
        domain: payload.domain,
        tags: [...payload.tags],
        reviewAt: payload.reviewAt,
        reviewLocal: { ...payload.reviewLocal },
        lockedAt: entry.at,
        lockedSeq: entry.seq,
        entryHash: entry.hash,
        rescheduleCount: 0,
        resolution: null,
      });
      continue;
    }

    const decision = byId.get(decisionId);
    if (!decision) {
      flag(entry, "unknown_decision");
      continue;
    }

    if (entry.type === "decision_resolved") {
      if (decision.resolution) {
        flag(entry, "already_resolved");
        continue;
      }
      decision.resolution = {
        outcome: entry.payload.outcome,
        notes: entry.payload.notes,
        resolvedAt: entry.at,
        resolvedSeq: entry.seq,
      };
      continue;
    }

    // review_rescheduled
    if (decision.resolution) {
      flag(entry, "reschedule_after_resolution");
      continue;
    }
    decision.reviewAt = entry.payload.reviewAt;
    decision.reviewLocal = { ...entry.payload.reviewLocal };
    decision.rescheduleCount += 1;
  }

  return {
    decisions: [...byId.values()].sort((a, b) => a.lockedSeq - b.lockedSeq),
    anomalies,
  };
}
