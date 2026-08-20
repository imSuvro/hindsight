import type { Collection, Db } from "mongodb";
import type { DecisionView, LedgerEntry } from "@/lib/schemas/domain";

/**
 * The stored shapes, and one place that names every collection.
 *
 * Two of these deliberately use a natural `_id` rather than an ObjectId: a
 * user has exactly one chain head, and a decision has exactly one projection
 * row, so the identity is already unique and a second key would only be
 * something to keep in sync.
 */

export const COLLECTIONS = {
  ledger: "ledger",
  chainHeads: "chain_heads",
  decisions: "decisions",
  notifications: "notifications",
} as const;

/**
 * One link in a user's chain. Written once and never touched again — there is
 * no code path in this application that updates or deletes a ledger document.
 */
export type LedgerDoc = LedgerEntry;

/** `_id` is the user id. Compare-and-swap target for appends. */
export type ChainHeadDoc = {
  _id: string;
  seq: number;
  hash: string;
  updatedAt: Date;
};

/**
 * The projection the interface reads. Every field is derivable from the ledger
 * by `rebuildDecisions`, so this can be discarded and rebuilt.
 *
 * `reviewAt` stays epoch milliseconds rather than becoming a `Date`: it is an
 * integer in the hashed payload, and keeping one representation removes any
 * chance of the stored value and the hashed value drifting apart. MongoDB
 * indexes and range-queries numbers perfectly well.
 */
export type DecisionDoc = Omit<DecisionView, "decisionId"> & { _id: string };

export type NotificationKind = "review_due";

/** Written after a send. The unique index on it is what makes sends idempotent. */
export type NotificationDoc = {
  _id: string;
  userId: string;
  decisionId: string;
  kind: NotificationKind;
  sentAt: Date;
};

export type Collections = {
  ledger: Collection<LedgerDoc>;
  chainHeads: Collection<ChainHeadDoc>;
  decisions: Collection<DecisionDoc>;
  notifications: Collection<NotificationDoc>;
};

export function collections(db: Db): Collections {
  return {
    ledger: db.collection<LedgerDoc>(COLLECTIONS.ledger),
    chainHeads: db.collection<ChainHeadDoc>(COLLECTIONS.chainHeads),
    decisions: db.collection<DecisionDoc>(COLLECTIONS.decisions),
    notifications: db.collection<NotificationDoc>(COLLECTIONS.notifications),
  };
}

export function toDecisionView(doc: DecisionDoc): DecisionView {
  const { _id, ...rest } = doc;
  return { decisionId: _id, ...rest };
}

export function toDecisionDoc(view: DecisionView): DecisionDoc {
  const { decisionId, ...rest } = view;
  return { _id: decisionId, ...rest };
}

/** The composite key that makes a notification send idempotent. */
export function notificationId(decisionId: string, kind: NotificationKind): string {
  return `${decisionId}:${kind}`;
}
