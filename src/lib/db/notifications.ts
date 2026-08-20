import { MongoServerError } from "mongodb";
import { type NotificationKind, collections, notificationId } from "./collections";
import type { DbContext } from "./ledger";

/**
 * The record of what has already been sent.
 *
 * This is what makes the resurfacing job safe to run twice, late, or
 * concurrently with itself. The claim is taken *before* the send, using a
 * unique `_id`, so two overlapping runs cannot both decide they are the one
 * that will send this notification. See ADR-0004.
 */

const DUPLICATE_KEY_CODE = 11000;

/**
 * Try to become the sender for this notification.
 *
 * Returns `true` if the claim was taken and the caller should send, `false` if
 * someone already has it. Claiming first and sending second means the failure
 * mode is a missed email rather than a duplicate one — the right way round,
 * since a duplicate is a bug the user sees and a miss is visible in the app's
 * own review queue anyway.
 */
export async function claimNotification(
  ctx: DbContext,
  input: { userId: string; decisionId: string; kind: NotificationKind; at: Date },
): Promise<boolean> {
  const { notifications } = collections(ctx.db);
  try {
    await notifications.insertOne({
      _id: notificationId(input.decisionId, input.kind),
      userId: input.userId,
      decisionId: input.decisionId,
      kind: input.kind,
      sentAt: input.at,
    });
    return true;
  } catch (error) {
    if (error instanceof MongoServerError && error.code === DUPLICATE_KEY_CODE) {
      return false;
    }
    throw error;
  }
}

/**
 * Give the claim back when the send failed, so a later run can retry it.
 * A claim that is never released simply means one missed notification.
 */
export async function releaseNotification(
  ctx: DbContext,
  decisionId: string,
  kind: NotificationKind,
): Promise<void> {
  await collections(ctx.db).notifications.deleteOne({
    _id: notificationId(decisionId, kind),
  });
}

export async function wasNotified(
  ctx: DbContext,
  decisionId: string,
  kind: NotificationKind,
): Promise<boolean> {
  const found = await collections(ctx.db).notifications.findOne(
    { _id: notificationId(decisionId, kind) },
    { projection: { _id: 1 } },
  );
  return found !== null;
}
