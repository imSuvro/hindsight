import type { DecisionView } from "@/lib/schemas/domain";
import { collections, toDecisionView } from "./collections";
import type { DbContext } from "./ledger";

/**
 * Reads over the decision projection.
 *
 * Nothing here writes. Every change to a decision goes through `appendEvent`,
 * so that no state can exist in the interface which is not also in the record.
 */

export async function listDecisions(
  ctx: DbContext,
  userId: string,
): Promise<DecisionView[]> {
  const docs = await collections(ctx.db)
    .decisions.find({ userId }, { sort: { lockedAt: -1 } })
    .toArray();
  return docs.map(toDecisionView);
}

export async function getDecision(
  ctx: DbContext,
  userId: string,
  decisionId: string,
): Promise<DecisionView | null> {
  const doc = await collections(ctx.db).decisions.findOne({ _id: decisionId, userId });
  return doc ? toDecisionView(doc) : null;
}

/** Unresolved decisions whose review moment has arrived, soonest first. */
export async function listDue(
  ctx: DbContext,
  userId: string,
  now: number,
): Promise<DecisionView[]> {
  const docs = await collections(ctx.db)
    .decisions.find(
      { userId, resolution: null, reviewAt: { $lte: now } },
      { sort: { reviewAt: 1 } },
    )
    .toArray();
  return docs.map(toDecisionView);
}

/** Unresolved decisions still in the future, soonest first. */
export async function listUpcoming(
  ctx: DbContext,
  userId: string,
  now: number,
  limit = 20,
): Promise<DecisionView[]> {
  const docs = await collections(ctx.db)
    .decisions.find(
      { userId, resolution: null, reviewAt: { $gt: now } },
      { sort: { reviewAt: 1 }, limit },
    )
    .toArray();
  return docs.map(toDecisionView);
}

/**
 * Everything due across every account, for the resurfacing job.
 *
 * Deliberately unbounded in time: the job asks "what is due and unsent" rather
 * than "what became due in the last hour", so a scheduler that runs late or
 * skips a run delays a notification instead of losing it. See ADR-0004.
 */
export async function listDueForNotification(
  ctx: DbContext,
  now: number,
  limit: number,
): Promise<DecisionView[]> {
  const docs = await collections(ctx.db)
    .decisions.find(
      { resolution: null, reviewAt: { $lte: now } },
      { sort: { reviewAt: 1 }, limit },
    )
    .toArray();
  return docs.map(toDecisionView);
}

export async function countDecisions(ctx: DbContext, userId: string): Promise<number> {
  return collections(ctx.db).decisions.countDocuments({ userId });
}
