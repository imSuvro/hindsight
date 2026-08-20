import type { Db } from "mongodb";
import { COLLECTIONS } from "./collections";

/**
 * Indexes and stored validators, applied idempotently.
 *
 * This never runs inside a request. Serverless invocations are short-lived and
 * numerous, so calling `createIndex` on a request path would issue the same
 * command thousands of times a day for no benefit. It is run deliberately —
 * `pnpm db:setup` before a deploy, and by the end-to-end harness when it
 * prepares a throwaway database.
 *
 * The `$jsonSchema` validators are a second line under the application's own
 * Zod validation: even a direct write from a shell cannot put a malformed entry
 * into the ledger.
 */

const HEX64 = "^[0-9a-f]{64}$";

export async function setupDatabase(db: Db): Promise<void> {
  await ensureCollection(db, COLLECTIONS.ledger, {
    bsonType: "object",
    required: ["userId", "seq", "type", "at", "payload", "prevHash", "hash"],
    additionalProperties: true,
    properties: {
      userId: { bsonType: "string", minLength: 1 },
      seq: { bsonType: "int", minimum: 1 },
      type: {
        enum: ["decision_locked", "decision_resolved", "review_rescheduled"],
      },
      at: { bsonType: ["int", "long", "double"] },
      payload: { bsonType: "object" },
      prevHash: { bsonType: "string", pattern: HEX64 },
      hash: { bsonType: "string", pattern: HEX64 },
    },
  });

  await ensureCollection(db, COLLECTIONS.chainHeads, {
    bsonType: "object",
    required: ["_id", "seq", "hash"],
    additionalProperties: true,
    properties: {
      _id: { bsonType: "string" },
      seq: { bsonType: ["int", "long"], minimum: 0 },
      hash: { bsonType: "string", pattern: HEX64 },
    },
  });

  await ensureCollection(db, COLLECTIONS.decisions, {
    bsonType: "object",
    required: ["_id", "userId", "confidence", "domain", "reviewAt", "entryHash"],
    additionalProperties: true,
    properties: {
      _id: { bsonType: "string" },
      userId: { bsonType: "string", minLength: 1 },
      confidence: { bsonType: ["int", "long"], minimum: 1, maximum: 99 },
      domain: {
        enum: ["career", "technical", "financial", "people", "personal"],
      },
      reviewAt: { bsonType: ["int", "long", "double"] },
      entryHash: { bsonType: "string", pattern: HEX64 },
    },
  });

  await ensureCollection(db, COLLECTIONS.notifications, {
    bsonType: "object",
    required: ["_id", "userId", "decisionId", "kind", "sentAt"],
    additionalProperties: true,
    properties: {
      _id: { bsonType: "string" },
      userId: { bsonType: "string", minLength: 1 },
      decisionId: { bsonType: "string", minLength: 1 },
      kind: { enum: ["review_due"] },
      sentAt: { bsonType: "date" },
    },
  });

  // Two entries can never occupy the same position in one chain. This is the
  // structural backstop under the compare-and-swap in `appendEvent`.
  await db
    .collection(COLLECTIONS.ledger)
    .createIndex({ userId: 1, seq: 1 }, { unique: true, name: "chain_position" });

  await db
    .collection(COLLECTIONS.decisions)
    .createIndex({ userId: 1, lockedAt: -1 }, { name: "journal_order" });

  // Serves the review queue and, crucially, the resurfacing scan — which runs
  // across every account and must not become a collection sweep.
  await db
    .collection(COLLECTIONS.decisions)
    .createIndex({ resolution: 1, reviewAt: 1 }, { name: "due_for_review" });

  await db
    .collection(COLLECTIONS.decisions)
    .createIndex(
      { userId: 1, resolution: 1, reviewAt: 1 },
      { name: "user_review_queue" },
    );

  await db
    .collection(COLLECTIONS.notifications)
    .createIndex({ userId: 1, sentAt: -1 }, { name: "notifications_by_user" });
}

/**
 * MongoDB will not attach a validator to a collection that does not exist yet,
 * and `collMod` fails on one that does not. Create, then modify, tolerating the
 * case where a parallel run got there first.
 */
async function ensureCollection(
  db: Db,
  name: string,
  schema: Record<string, unknown>,
): Promise<void> {
  const existing = await db.listCollections({ name }, { nameOnly: true }).toArray();
  if (existing.length === 0) {
    try {
      await db.createCollection(name, {
        validator: { $jsonSchema: schema },
        validationLevel: "strict",
        validationAction: "error",
      });
      return;
    } catch (error) {
      // NamespaceExists (48): another process created it first; fall through to
      // collMod so the validator still gets applied.
      const code = (error as { code?: number }).code;
      if (code !== 48) throw error;
    }
  }

  await db.command({
    collMod: name,
    validator: { $jsonSchema: schema },
    validationLevel: "strict",
    validationAction: "error",
  });
}
