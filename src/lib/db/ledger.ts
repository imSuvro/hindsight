import { type ClientSession, type Db, type MongoClient, MongoServerError } from "mongodb";
import { type ChainHead, genesisPrevHash, sealEntry } from "@/lib/domain/chain";
import type { LedgerEntry, UnsealedLedgerEntry } from "@/lib/schemas/domain";
import {
  type DecisionDoc,
  type LedgerDoc,
  collections,
  toDecisionDoc,
} from "./collections";

/**
 * Appending to the ledger — the only write path in the product that matters.
 *
 * Two things have to hold at once. The chain must not fork: two appends for the
 * same user racing each other must not both claim the same sequence number or
 * the same predecessor. And the projection must never disagree with the ledger:
 * if the decision view cannot accept an event, the event must not exist.
 *
 * Both fall out of one shape — read the head, compute the entry, then in a
 * single transaction insert the entry, compare-and-swap the head, and apply the
 * projection. A loser sees the swap match nothing and retries against the new
 * head. A projection that refuses the event aborts the whole transaction, so
 * nothing is recorded.
 *
 * The unique index on `(userId, seq)` is a structural backstop underneath all
 * of that: even if this logic regressed, two entries could not occupy the same
 * position in one chain.
 */

export type DbContext = { db: Db; client: MongoClient };

/** An event to append, before the chain assigns it a position. */
export type AppendInput = Omit<UnsealedLedgerEntry, "seq" | "prevHash">;

export type AppendResult = { entry: LedgerEntry; head: ChainHead };

export class DecisionAlreadyExistsError extends Error {
  constructor(decisionId: string) {
    super(`Decision ${decisionId} is already locked`);
    this.name = "DecisionAlreadyExistsError";
  }
}

export class DecisionNotFoundError extends Error {
  constructor(decisionId: string) {
    super(`No decision ${decisionId} in this journal`);
    this.name = "DecisionNotFoundError";
  }
}

export class DecisionAlreadyResolvedError extends Error {
  constructor(decisionId: string) {
    super(`Decision ${decisionId} already has an outcome recorded`);
    this.name = "DecisionAlreadyResolvedError";
  }
}

export class ChainContentionError extends Error {
  constructor() {
    super("Another entry was appended first");
    this.name = "ChainContentionError";
  }
}

const MAX_APPEND_ATTEMPTS = 8;
const WRITE_CONFLICT_CODE = 112;
const DUPLICATE_KEY_CODE = 11000;

function isRetryable(error: unknown): boolean {
  if (error instanceof ChainContentionError) return true;
  if (error instanceof MongoServerError) {
    if (error.code === WRITE_CONFLICT_CODE) return true;
    if (error.hasErrorLabel("TransientTransactionError")) return true;
    if (error.hasErrorLabel("UnknownTransactionCommitResult")) return true;
    // Two racers can also collide on the unique (userId, seq) index; that is
    // the same race, caught one layer lower down.
    if (error.code === DUPLICATE_KEY_CODE && error.message.includes("userId")) {
      return true;
    }
  }
  return false;
}

async function pause(attempt: number): Promise<void> {
  const backoff = 12 * 2 ** attempt;
  const jitter = Math.random() * backoff;
  await new Promise((resolve) => setTimeout(resolve, backoff + jitter));
}

/**
 * Read the user's chain head, minting the genesis anchor on first use.
 * `$setOnInsert` means two simultaneous first appends cannot both create it.
 */
export async function readChainHead(ctx: DbContext, userId: string): Promise<ChainHead> {
  const { chainHeads } = collections(ctx.db);
  await chainHeads.updateOne(
    { _id: userId },
    {
      $setOnInsert: {
        seq: 0,
        hash: genesisPrevHash(userId),
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  );
  const head = await chainHeads.findOne({ _id: userId });
  if (!head) throw new Error(`Chain head for ${userId} vanished between write and read`);
  return { seq: head.seq, hash: head.hash };
}

/**
 * Apply one event to the decision projection, inside the caller's transaction.
 * Every guard here is a filtered update rather than a read-then-write, so a
 * concurrent duplicate cannot slip between the check and the change.
 */
async function project(
  ctx: DbContext,
  entry: LedgerEntry,
  session: ClientSession,
): Promise<void> {
  const { decisions } = collections(ctx.db);
  const { decisionId } = entry.payload;

  if (entry.type === "decision_locked") {
    const doc: DecisionDoc = toDecisionDoc({
      decisionId,
      userId: entry.userId,
      title: entry.payload.title,
      situation: entry.payload.situation,
      expectedOutcome: entry.payload.expectedOutcome,
      confidence: entry.payload.confidence,
      domain: entry.payload.domain,
      tags: [...entry.payload.tags],
      reviewAt: entry.payload.reviewAt,
      reviewLocal: { ...entry.payload.reviewLocal },
      lockedAt: entry.at,
      lockedSeq: entry.seq,
      entryHash: entry.hash,
      rescheduleCount: 0,
      resolution: null,
    });
    try {
      await decisions.insertOne(doc, { session });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === DUPLICATE_KEY_CODE) {
        throw new DecisionAlreadyExistsError(decisionId);
      }
      throw error;
    }
    return;
  }

  if (entry.type === "decision_resolved") {
    const result = await decisions.updateOne(
      { _id: decisionId, userId: entry.userId, resolution: null },
      {
        $set: {
          resolution: {
            outcome: entry.payload.outcome,
            notes: entry.payload.notes,
            resolvedAt: entry.at,
            resolvedSeq: entry.seq,
          },
        },
      },
      { session },
    );
    if (result.matchedCount === 0) {
      await assertExists(ctx, decisionId, entry.userId, session);
      throw new DecisionAlreadyResolvedError(decisionId);
    }
    return;
  }

  const result = await decisions.updateOne(
    { _id: decisionId, userId: entry.userId, resolution: null },
    {
      $set: {
        reviewAt: entry.payload.reviewAt,
        reviewLocal: { ...entry.payload.reviewLocal },
      },
      $inc: { rescheduleCount: 1 },
    },
    { session },
  );
  if (result.matchedCount === 0) {
    await assertExists(ctx, decisionId, entry.userId, session);
    throw new DecisionAlreadyResolvedError(decisionId);
  }
}

async function assertExists(
  ctx: DbContext,
  decisionId: string,
  userId: string,
  session: ClientSession,
): Promise<void> {
  const { decisions } = collections(ctx.db);
  const exists = await decisions.findOne(
    { _id: decisionId, userId },
    { projection: { _id: 1 }, session },
  );
  if (!exists) throw new DecisionNotFoundError(decisionId);
}

/**
 * Append one event. Returns the sealed entry and the new chain head, so the
 * caller can show the user the fingerprint their record now carries.
 */
export async function appendEvent(
  ctx: DbContext,
  input: AppendInput,
): Promise<AppendResult> {
  const { ledger, chainHeads } = collections(ctx.db);

  // Mint the genesis anchor once, outside the transaction, so the read below
  // always finds a head to advance.
  await readChainHead(ctx, input.userId);

  for (let attempt = 0; attempt < MAX_APPEND_ATTEMPTS; attempt += 1) {
    const session = ctx.client.startSession();
    let sealed: LedgerEntry | undefined;

    try {
      await session.withTransaction(async () => {
        // Reading the head *inside* the transaction is what makes concurrent
        // appends safe: a racer that commits first turns the swap below into a
        // write conflict, and the driver reruns this whole callback against the
        // new head rather than against a stale copy of it.
        const head = await chainHeads.findOne({ _id: input.userId }, { session });
        if (!head) throw new Error(`Chain head for ${input.userId} is missing`);

        const entry = sealEntry({
          ...input,
          seq: head.seq + 1,
          prevHash: head.hash,
        } as UnsealedLedgerEntry);

        // Claim the position first. Every racer collides here, on a single
        // document, before any of them has written a ledger entry — so the
        // unique index on (userId, seq) never has to arbitrate a race it can
        // only report as a hard failure.
        const swap = await chainHeads.updateOne(
          { _id: input.userId, seq: head.seq, hash: head.hash },
          { $set: { seq: entry.seq, hash: entry.hash, updatedAt: new Date() } },
          { session },
        );
        if (swap.matchedCount === 0) throw new ChainContentionError();

        await ledger.insertOne(entry as LedgerDoc, { session });
        await project(ctx, entry, session);
        sealed = entry;
      });

      if (!sealed) throw new Error("Append committed without producing an entry");
      return { entry: sealed, head: { seq: sealed.seq, hash: sealed.hash } };
    } catch (error) {
      if (isRetryable(error) && attempt < MAX_APPEND_ATTEMPTS - 1) {
        await pause(attempt);
        continue;
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  throw new ChainContentionError();
}

/** Every entry in a user's chain, oldest first. Used by verification and export. */
export async function listChain(ctx: DbContext, userId: string): Promise<LedgerEntry[]> {
  const { ledger } = collections(ctx.db);
  return ledger.find({ userId }, { projection: { _id: 0 }, sort: { seq: 1 } }).toArray();
}

export async function countChain(ctx: DbContext, userId: string): Promise<number> {
  return collections(ctx.db).ledger.countDocuments({ userId });
}
