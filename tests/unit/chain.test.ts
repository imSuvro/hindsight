import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  entryHash,
  genesisPrevHash,
  sealEntry,
  shortHash,
  verifyChain,
} from "@/lib/domain/chain";
import type { LedgerEntry } from "@/lib/schemas/domain";
import { chainArb, userIdArb } from "./arbitraries";

/**
 * The tamper-evidence claim, stated as tests: an honest record always verifies,
 * and no single-field edit survives verification.
 */
describe("hash chain", () => {
  it("accepts every chain the product could have produced", () => {
    fc.assert(
      fc.property(chainArb, ({ userId, entries }) => {
        const result = verifyChain(userId, entries);
        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.entries).toBe(entries.length);
          expect(result.head?.hash).toBe(entries[entries.length - 1].hash);
          expect(result.head?.seq).toBe(entries.length);
        }
      }),
    );
  });

  it("anchors each account to its own genesis", () => {
    fc.assert(
      fc.property(userIdArb, userIdArb, (a, b) => {
        fc.pre(a !== b);
        expect(genesisPrevHash(a)).not.toBe(genesisPrevHash(b));
      }),
    );
  });

  it("rejects a record replayed into another account", () => {
    fc.assert(
      fc.property(chainArb, userIdArb, ({ userId, entries }, otherUserId) => {
        fc.pre(userId !== otherUserId);
        const result = verifyChain(otherUserId, entries);
        expect(result.valid).toBe(false);
      }),
    );
  });

  /**
   * The load-bearing property. Change one field of one entry, anywhere in the
   * chain, and verification must notice.
   */
  it("rejects any single-field edit", () => {
    const mutationArb = fc.oneof(
      fc.record({ kind: fc.constant("userId" as const) }),
      fc.record({ kind: fc.constant("seq" as const) }),
      fc.record({ kind: fc.constant("at" as const) }),
      fc.record({ kind: fc.constant("prevHash" as const) }),
      fc.record({ kind: fc.constant("hash" as const) }),
      fc.record({ kind: fc.constant("payloadDecisionId" as const) }),
      fc.record({ kind: fc.constant("payloadContents" as const) }),
    );

    fc.assert(
      fc.property(
        chainArb,
        fc.nat(),
        mutationArb,
        ({ userId, entries }, pick, mutation) => {
          const index = pick % entries.length;
          const target = entries[index];
          const mutated: LedgerEntry[] = entries.map((entry) => ({
            ...entry,
            payload: { ...entry.payload },
          })) as LedgerEntry[];
          const victim = mutated[index];

          switch (mutation.kind) {
            case "userId":
              victim.userId = `${victim.userId}!`;
              break;
            case "seq":
              victim.seq = victim.seq + 1;
              break;
            case "at":
              victim.at = victim.at + 1;
              break;
            case "prevHash":
              victim.prevHash = genesisPrevHash(`${userId}-forged`);
              break;
            case "hash":
              victim.hash = genesisPrevHash(`${userId}-forged`);
              break;
            case "payloadDecisionId":
              victim.payload = {
                ...victim.payload,
                decisionId:
                  victim.payload.decisionId === "A".repeat(16)
                    ? "B".repeat(16)
                    : "A".repeat(16),
              };
              break;
            case "payloadContents":
              if (victim.type === "decision_locked") {
                victim.payload = {
                  ...victim.payload,
                  confidence: victim.payload.confidence === 50 ? 51 : 50,
                };
              } else if (victim.type === "decision_resolved") {
                victim.payload = {
                  ...victim.payload,
                  outcome:
                    victim.payload.outcome === "happened" ? "did_not_happen" : "happened",
                };
              } else {
                victim.payload = {
                  ...victim.payload,
                  reviewAt: victim.payload.reviewAt + 1,
                };
              }
              break;
          }

          // Guard against a "mutation" that happened to be a no-op.
          fc.pre(JSON.stringify(mutated[index]) !== JSON.stringify(target));

          const result = verifyChain(userId, mutated);
          expect(result.valid).toBe(false);
        },
      ),
    );
  });

  it("rejects a removed entry", () => {
    fc.assert(
      fc.property(chainArb, fc.nat(), ({ userId, entries }, pick) => {
        fc.pre(entries.length >= 2);
        // Anything but the tail: removing it leaves a hole the sequence exposes.
        const index = pick % (entries.length - 1);
        const withHole = entries.filter((_, position) => position !== index);
        expect(verifyChain(userId, withHole).valid).toBe(false);
      }),
    );
  });

  it("rejects reordered entries", () => {
    fc.assert(
      fc.property(chainArb, ({ userId, entries }) => {
        fc.pre(entries.length >= 2);
        const swapped = [...entries];
        [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
        expect(verifyChain(userId, swapped).valid).toBe(false);
      }),
    );
  });

  /**
   * Truncation is the one edit a self-contained chain cannot detect: any prefix
   * of a valid chain is itself a valid chain. This is exactly why the head is
   * published outside the database — in the interface, in every review email,
   * and in every export. The test documents the limitation rather than hiding
   * it, and pins the property that makes the published head work.
   */
  it("cannot detect truncation on its own, which is why the head is published", () => {
    fc.assert(
      fc.property(chainArb, ({ userId, entries }) => {
        fc.pre(entries.length >= 2);
        const truncated = entries.slice(0, -1);
        const shortened = verifyChain(userId, truncated);
        const full = verifyChain(userId, entries);

        expect(shortened.valid).toBe(true);
        // ...but the head no longer matches any head the user was ever shown.
        expect(shortened.valid && full.valid && shortened.head?.hash).not.toBe(
          full.valid ? full.head?.hash : null,
        );
      }),
    );
  });

  it("verifies an empty record as valid with no head", () => {
    const result = verifyChain("someone", []);
    expect(result).toStrictEqual({ valid: true, entries: 0, head: null });
  });

  it("rejects a record that does not start at the first entry", () => {
    fc.assert(
      fc.property(chainArb, ({ userId, entries }) => {
        fc.pre(entries.length >= 2);
        const result = verifyChain(userId, entries.slice(1));
        expect(result.valid).toBe(false);
        if (!result.valid) expect(result.failure.reason).toBe("sequence_start");
      }),
    );
  });

  it("computes a stable digest for the same entry", () => {
    fc.assert(
      fc.property(chainArb, ({ entries }) => {
        for (const entry of entries) {
          expect(entryHash(entry)).toBe(entry.hash);
          expect(sealEntry(entry).hash).toBe(entry.hash);
        }
      }),
    );
  });

  it("abbreviates a digest without losing both ends", () => {
    const hash = "a".repeat(32) + "b".repeat(32);
    const short = shortHash(hash);
    expect(short.startsWith("aaaaaaaa")).toBe(true);
    expect(short.endsWith("bbbbbbbb")).toBe(true);
    expect(short.length).toBeLessThan(hash.length);
  });
});
