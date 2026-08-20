import { ObjectId } from "mongodb";
import { collections } from "@/lib/db/collections";
import type { DbContext } from "@/lib/db/ledger";

/**
 * Deleting an account, completely.
 *
 * Better Auth ships a delete-user flow, but using it would mean setting
 * `session.freshAge` to zero — because an OAuth-only user has no password to
 * re-confirm with, and without a password the library requires a session
 * created within the freshness window. Weakening session freshness across the
 * whole product to enable one action is the wrong trade, so the cascade is
 * written out here instead, where every collection it touches is visible and
 * covered by a test.
 *
 * Deleting your own journal is not tampering. Falsifying a record and
 * destroying it are different acts, and only one of them is a threat to the
 * person whose record it is. See ADR-0002.
 */

export type DeletionReceipt = {
  ledgerEntries: number;
  decisions: number;
  notifications: number;
  sessions: number;
  linkedAccounts: number;
};

export async function deleteAccount(
  ctx: DbContext,
  userId: string,
): Promise<DeletionReceipt> {
  // Better Auth stores its foreign keys as ObjectIds even though it hands the
  // id back as a hex string.
  let objectId: ObjectId;
  try {
    objectId = new ObjectId(userId);
  } catch {
    throw new Error(`Not a usable account id: ${userId}`);
  }

  const { db } = ctx;
  const own = collections(db);

  // Sessions go first: from this point the account cannot be used, even if a
  // later step fails and leaves data behind for a retry.
  const sessions = await db.collection("session").deleteMany({ userId: objectId });
  const linkedAccounts = await db.collection("account").deleteMany({
    userId: objectId,
  });
  await db.collection("verification").deleteMany({ identifier: userId });

  const notifications = await own.notifications.deleteMany({ userId });
  const decisions = await own.decisions.deleteMany({ userId });
  const ledgerEntries = await own.ledger.deleteMany({ userId });
  await own.chainHeads.deleteOne({ _id: userId });

  await db.collection("user").deleteOne({ _id: objectId });

  return {
    ledgerEntries: ledgerEntries.deletedCount,
    decisions: decisions.deletedCount,
    notifications: notifications.deletedCount,
    sessions: sessions.deletedCount,
    linkedAccounts: linkedAccounts.deletedCount,
  };
}
