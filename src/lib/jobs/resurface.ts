import { ObjectId } from "mongodb";
import { collections } from "@/lib/db/collections";
import { listDueForNotification } from "@/lib/db/decisions";
import type { DbContext } from "@/lib/db/ledger";
import { claimNotification, releaseNotification } from "@/lib/db/notifications";
import { reviewDueEmail } from "@/lib/email/templates";
import { type EmailTransport, emailTransport } from "@/lib/email/transport";
import { FALLBACK_TIME_ZONE } from "@/lib/domain/timez";

/**
 * Bringing decisions back.
 *
 * Two properties make it safe to drive this from a scheduler that is late,
 * skips runs, or fires twice — which GitHub's is, does and can (ADR-0004):
 *
 * - **Catch-up.** It asks "what is due and not yet sent", never "what became
 *   due in the last hour". A missed run delays a notification; it cannot lose
 *   one.
 * - **Claim before send.** The notification record is written first, with a
 *   unique key. Two overlapping runs cannot both decide they are the one
 *   sending this message. If the send then fails the claim is released, so a
 *   later run retries it.
 *
 * The failure mode is therefore a missed email rather than a duplicate one,
 * which is the right way round: a duplicate is a bug the user sees, and a miss
 * is already visible in their review queue.
 */

export type ResurfaceSummary = {
  scanned: number;
  sent: number;
  skippedOptedOut: number;
  skippedAlreadySent: number;
  skippedNoEmail: number;
  failed: number;
  transport: string;
  ranAt: string;
};

type Recipient = {
  email: string;
  name: string;
  optIn: boolean;
  timeZone: string;
};

async function loadRecipients(
  ctx: DbContext,
  userIds: readonly string[],
): Promise<Map<string, Recipient>> {
  const objectIds: ObjectId[] = [];
  for (const id of userIds) {
    try {
      objectIds.push(new ObjectId(id));
    } catch {
      // A journal whose owner id is not an ObjectId cannot have come from
      // sign-in; skip rather than fail the whole run.
    }
  }
  if (objectIds.length === 0) return new Map();

  const users = await ctx.db
    .collection("user")
    .find({ _id: { $in: objectIds } })
    .toArray();

  const byId = new Map<string, Recipient>();
  for (const user of users) {
    const id = (user._id as ObjectId).toHexString();
    byId.set(id, {
      email: typeof user.email === "string" ? user.email : "",
      name: typeof user.name === "string" && user.name ? user.name : "there",
      optIn: user.emailOptIn !== false,
      timeZone:
        typeof user.timeZone === "string" && user.timeZone
          ? user.timeZone
          : FALLBACK_TIME_ZONE,
    });
  }
  return byId;
}

export async function runResurface(
  ctx: DbContext,
  options: {
    now: number;
    baseUrl: string;
    limit?: number;
    transport?: EmailTransport;
  },
): Promise<ResurfaceSummary> {
  const transport = options.transport ?? emailTransport();
  const limit = options.limit ?? 100;
  const due = await listDueForNotification(ctx, options.now, limit);

  const summary: ResurfaceSummary = {
    scanned: due.length,
    sent: 0,
    skippedOptedOut: 0,
    skippedAlreadySent: 0,
    skippedNoEmail: 0,
    failed: 0,
    transport: transport.name,
    ranAt: new Date(options.now).toISOString(),
  };

  if (due.length === 0) return summary;

  const recipients = await loadRecipients(ctx, [
    ...new Set(due.map((decision) => decision.userId)),
  ]);
  const { chainHeads } = collections(ctx.db);

  for (const decision of due) {
    const recipient = recipients.get(decision.userId);
    if (!recipient || !recipient.email) {
      summary.skippedNoEmail += 1;
      continue;
    }
    if (!recipient.optIn) {
      summary.skippedOptedOut += 1;
      continue;
    }

    const claimed = await claimNotification(ctx, {
      userId: decision.userId,
      decisionId: decision.decisionId,
      kind: "review_due",
      at: new Date(options.now),
    });
    if (!claimed) {
      summary.skippedAlreadySent += 1;
      continue;
    }

    try {
      const head = await chainHeads.findOne({ _id: decision.userId });
      await transport.send(
        reviewDueEmail({
          to: recipient.email,
          toName: recipient.name,
          decision,
          timeZone: recipient.timeZone,
          head: head ? { seq: head.seq, hash: head.hash } : { seq: 0, hash: "" },
          baseUrl: options.baseUrl,
        }),
      );
      summary.sent += 1;
    } catch (error) {
      // Hand the claim back so a later run picks it up again.
      await releaseNotification(ctx, decision.decisionId, "review_due");
      summary.failed += 1;
      console.error(
        `resurface: could not send for decision ${decision.decisionId}`,
        error,
      );
    }
  }

  return summary;
}
