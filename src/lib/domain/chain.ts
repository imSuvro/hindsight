import { createHash } from "node:crypto";
import type { LedgerEntry, UnsealedLedgerEntry } from "@/lib/schemas/domain";
import { CANONICAL_VERSION, canonicalize } from "./canonical";

/**
 * Per-user hash chain.
 *
 * Each ledger entry carries the digest of the one before it, so changing any
 * byte of any past entry invalidates every entry after it. That is the whole
 * mechanism: it does not *prevent* a change — anyone holding the database can
 * rewrite rows and recompute the whole chain — it makes a change *detectable*,
 * and it makes silent partial edits impossible.
 *
 * Detection becomes meaningful once a head digest has left the database. The
 * application publishes the current head in the UI, in the footer of every
 * review email, and inside every export. A head the user already received is a
 * witness the operator cannot reach, so a wholesale rewrite still fails to
 * reconcile against it.
 *
 * See docs/architecture.md for the threat model this does and does not cover.
 */

export const CHAIN_VERSION = 1;

const HEX64 = /^[0-9a-f]{64}$/;

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * The anchor a user's chain starts from. Derived from the user id rather than a
 * constant so two users' chains can never share a prefix, and so an entry cannot
 * be replayed from one journal into another.
 */
export function genesisPrevHash(userId: string): string {
  return sha256Hex(`hindsight/v${CHAIN_VERSION}/genesis/${userId}`);
}

/**
 * What the digest actually covers. `_id` is absent on purpose: it is storage
 * metadata assigned by the database, not something the user asserted.
 */
function chainEnvelope(entry: UnsealedLedgerEntry): Record<string, unknown> {
  return {
    at: entry.at,
    canonicalVersion: CANONICAL_VERSION,
    chainVersion: CHAIN_VERSION,
    payload: entry.payload,
    prevHash: entry.prevHash,
    seq: entry.seq,
    type: entry.type,
    userId: entry.userId,
  };
}

export function entryHash(entry: UnsealedLedgerEntry): string {
  return sha256Hex(canonicalize(chainEnvelope(entry)));
}

/** Attach the digest that seals an entry. */
export function sealEntry(entry: UnsealedLedgerEntry): LedgerEntry {
  return { ...entry, hash: entryHash(entry) } as LedgerEntry;
}

export type ChainFailureReason =
  | "user_mismatch"
  | "sequence_start"
  | "sequence_gap"
  | "genesis_mismatch"
  | "prev_hash_mismatch"
  | "hash_malformed"
  | "hash_mismatch";

export const CHAIN_FAILURE_MESSAGES: Record<ChainFailureReason, string> = {
  user_mismatch: "An entry belongs to a different account.",
  sequence_start: "The record does not begin at the first entry.",
  sequence_gap: "An entry is missing or duplicated in the sequence.",
  genesis_mismatch: "The first entry is not anchored to this account.",
  prev_hash_mismatch: "An entry does not follow the one before it.",
  hash_malformed: "An entry's fingerprint is not a valid digest.",
  hash_mismatch: "An entry's contents do not match its fingerprint.",
};

export type ChainHead = { seq: number; hash: string };

export type ChainVerification =
  | { valid: true; entries: number; head: ChainHead | null }
  | {
      valid: false;
      entries: number;
      failure: { index: number; seq: number; reason: ChainFailureReason };
    };

/**
 * Replay a user's chain from the beginning and report the first place it stops
 * adding up. Entries must be supplied in ascending `seq`.
 */
export function verifyChain(
  userId: string,
  entries: readonly LedgerEntry[],
): ChainVerification {
  const genesis = genesisPrevHash(userId);
  let expectedPrev = genesis;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const fail = (reason: ChainFailureReason): ChainVerification => ({
      valid: false,
      entries: entries.length,
      failure: { index, seq: entry.seq, reason },
    });

    if (entry.userId !== userId) return fail("user_mismatch");
    if (index === 0 && entry.seq !== 1) return fail("sequence_start");
    if (index > 0 && entry.seq !== entries[index - 1].seq + 1) {
      return fail("sequence_gap");
    }
    if (index === 0 && entry.prevHash !== genesis) return fail("genesis_mismatch");
    if (entry.prevHash !== expectedPrev) return fail("prev_hash_mismatch");
    if (!HEX64.test(entry.hash)) return fail("hash_malformed");
    if (entryHash(entry) !== entry.hash) return fail("hash_mismatch");

    expectedPrev = entry.hash;
  }

  const last = entries[entries.length - 1];
  return {
    valid: true,
    entries: entries.length,
    head: last ? { seq: last.seq, hash: last.hash } : null,
  };
}

/**
 * The short form shown in the interface and printed in email footers. Long
 * enough that forging a match is not a spare-afternoon exercise, short enough
 * that a person will actually compare it.
 */
export function shortHash(hash: string): string {
  return `${hash.slice(0, 8)} · ${hash.slice(-8)}`;
}
