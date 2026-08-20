import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { collections } from "@/lib/db/collections";
import { getDecision, listDecisions, listDue } from "@/lib/db/decisions";
import {
  type AppendInput,
  DecisionAlreadyExistsError,
  DecisionAlreadyResolvedError,
  DecisionNotFoundError,
  appendEvent,
  listChain,
  readChainHead,
} from "@/lib/db/ledger";
import { genesisPrevHash, verifyChain } from "@/lib/domain/chain";
import { rebuildDecisions } from "@/lib/domain/rebuild";
import { newDecisionId } from "@/lib/ids";
import { type Harness, clearJournal, createHarness } from "./harness";

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness("ledger");
});

afterAll(async () => {
  await harness.close();
});

afterEach(async () => {
  await clearJournal(harness);
});

const USER = "user_ledger_1";

function lockInput(overrides: Partial<{ decisionId: string; confidence: number }> = {}) {
  const decisionId = overrides.decisionId ?? newDecisionId();
  return {
    userId: USER,
    type: "decision_locked",
    at: Date.parse("2026-01-15T10:00:00Z"),
    payload: {
      decisionId,
      title: "Move the scheduler out of the app",
      situation: "The in-app cron keeps drifting.",
      expectedOutcome: "Notifications land within an hour of the due time",
      confidence: overrides.confidence ?? 75,
      domain: "technical",
      tags: ["infra"],
      reviewAt: Date.parse("2026-04-15T09:00:00Z"),
      reviewLocal: { date: "2026-04-15", time: "09:00", timeZone: "Europe/London" },
    },
  } satisfies AppendInput;
}

function resolveInput(decisionId: string, outcome: "happened" | "did_not_happen") {
  return {
    userId: USER,
    type: "decision_resolved",
    at: Date.parse("2026-04-15T12:00:00Z"),
    payload: { decisionId, outcome, notes: "Landed a week early." },
  } satisfies AppendInput;
}

describe("appendEvent", () => {
  it("mints a genesis head on first use", async () => {
    const head = await readChainHead(harness, USER);
    expect(head).toStrictEqual({ seq: 0, hash: genesisPrevHash(USER) });
  });

  it("seals an entry and advances the head", async () => {
    const input = lockInput();
    const { entry, head } = await appendEvent(harness, input);

    expect(entry.seq).toBe(1);
    expect(entry.prevHash).toBe(genesisPrevHash(USER));
    expect(head).toStrictEqual({ seq: 1, hash: entry.hash });
    expect(await readChainHead(harness, USER)).toStrictEqual(head);
  });

  it("writes a projection that matches the ledger", async () => {
    const input = lockInput();
    const { entry } = await appendEvent(harness, input);

    const decision = await getDecision(harness, USER, input.payload.decisionId);
    expect(decision).not.toBeNull();
    expect(decision?.confidence).toBe(75);
    expect(decision?.entryHash).toBe(entry.hash);
    expect(decision?.resolution).toBeNull();
    expect(decision?.rescheduleCount).toBe(0);
  });

  it("produces a chain that verifies end to end", async () => {
    const a = lockInput();
    const b = lockInput();
    await appendEvent(harness, a);
    await appendEvent(harness, b);
    await appendEvent(harness, resolveInput(a.payload.decisionId, "happened"));

    const chain = await listChain(harness, USER);
    expect(chain).toHaveLength(3);
    expect(verifyChain(USER, chain).valid).toBe(true);
  });

  it("records an outcome without disturbing the prediction", async () => {
    const input = lockInput({ confidence: 62 });
    await appendEvent(harness, input);
    await appendEvent(harness, resolveInput(input.payload.decisionId, "did_not_happen"));

    const decision = await getDecision(harness, USER, input.payload.decisionId);
    expect(decision?.confidence).toBe(62);
    expect(decision?.expectedOutcome).toBe(
      "Notifications land within an hour of the due time",
    );
    expect(decision?.resolution?.outcome).toBe("did_not_happen");
    expect(decision?.resolution?.resolvedSeq).toBe(2);
  });

  it("moves a review date and counts the move", async () => {
    const input = lockInput();
    await appendEvent(harness, input);
    await appendEvent(harness, {
      userId: USER,
      type: "review_rescheduled",
      at: Date.parse("2026-02-01T09:00:00Z"),
      payload: {
        decisionId: input.payload.decisionId,
        reviewAt: Date.parse("2026-10-15T09:00:00Z"),
        reviewLocal: { date: "2026-10-15", time: "09:00", timeZone: "Europe/London" },
      },
    });

    const decision = await getDecision(harness, USER, input.payload.decisionId);
    expect(decision?.reviewAt).toBe(Date.parse("2026-10-15T09:00:00Z"));
    expect(decision?.rescheduleCount).toBe(1);
  });
});

describe("the guards that keep the record honest", () => {
  it("refuses to lock the same decision twice, and records nothing", async () => {
    const input = lockInput();
    await appendEvent(harness, input);

    await expect(appendEvent(harness, input)).rejects.toThrow(DecisionAlreadyExistsError);

    // The rejected event must leave no trace: the transaction rolled it back.
    const chain = await listChain(harness, USER);
    expect(chain).toHaveLength(1);
    expect(await readChainHead(harness, USER)).toStrictEqual({
      seq: 1,
      hash: chain[0].hash,
    });
  });

  it("refuses a second outcome, and records nothing", async () => {
    const input = lockInput();
    await appendEvent(harness, input);
    await appendEvent(harness, resolveInput(input.payload.decisionId, "happened"));

    await expect(
      appendEvent(harness, resolveInput(input.payload.decisionId, "did_not_happen")),
    ).rejects.toThrow(DecisionAlreadyResolvedError);

    const decision = await getDecision(harness, USER, input.payload.decisionId);
    expect(decision?.resolution?.outcome).toBe("happened");
    expect(await listChain(harness, USER)).toHaveLength(2);
  });

  it("refuses an event for a decision that was never locked", async () => {
    await expect(
      appendEvent(harness, resolveInput(newDecisionId(), "happened")),
    ).rejects.toThrow(DecisionNotFoundError);
    expect(await listChain(harness, USER)).toHaveLength(0);
  });

  it("refuses to reschedule a decision that already has an outcome", async () => {
    const input = lockInput();
    await appendEvent(harness, input);
    await appendEvent(harness, resolveInput(input.payload.decisionId, "happened"));

    await expect(
      appendEvent(harness, {
        userId: USER,
        type: "review_rescheduled",
        at: Date.now(),
        payload: {
          decisionId: input.payload.decisionId,
          reviewAt: Date.parse("2027-01-01T09:00:00Z"),
          reviewLocal: { date: "2027-01-01", time: "09:00", timeZone: "UTC" },
        },
      }),
    ).rejects.toThrow(DecisionAlreadyResolvedError);
  });

  it("will not let one account touch another's decision", async () => {
    const input = lockInput();
    await appendEvent(harness, input);

    await expect(
      appendEvent(harness, {
        ...resolveInput(input.payload.decisionId, "happened"),
        userId: "user_ledger_intruder",
      }),
    ).rejects.toThrow(DecisionNotFoundError);

    expect(
      await getDecision(harness, "user_ledger_intruder", input.payload.decisionId),
    ).toBeNull();
  });
});

describe("concurrent appends", () => {
  /**
   * The property the compare-and-swap exists for. Without it, simultaneous
   * appends would read the same head and produce two entries claiming the same
   * predecessor — a forked chain that verification would reject forever after.
   */
  it("serialises into one unbroken chain", async () => {
    const inputs = Array.from({ length: 12 }, () => lockInput());
    const results = await Promise.all(inputs.map((input) => appendEvent(harness, input)));

    const chain = await listChain(harness, USER);
    expect(chain).toHaveLength(12);
    expect(chain.map((entry) => entry.seq)).toStrictEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
    expect(verifyChain(USER, chain).valid).toBe(true);

    // Every append got a distinct position, and the head is the last of them.
    const sequences = new Set(results.map((result) => result.entry.seq));
    expect(sequences.size).toBe(12);
    expect(await readChainHead(harness, USER)).toStrictEqual({
      seq: 12,
      hash: chain[11].hash,
    });
  });

  it("keeps separate accounts on separate chains", async () => {
    const other = "user_ledger_2";
    await Promise.all([
      appendEvent(harness, lockInput()),
      appendEvent(harness, { ...lockInput(), userId: other }),
      appendEvent(harness, lockInput()),
      appendEvent(harness, { ...lockInput(), userId: other }),
    ]);

    const mine = await listChain(harness, USER);
    const theirs = await listChain(harness, other);
    expect(mine).toHaveLength(2);
    expect(theirs).toHaveLength(2);
    expect(verifyChain(USER, mine).valid).toBe(true);
    expect(verifyChain(other, theirs).valid).toBe(true);
    expect(mine[0].prevHash).not.toBe(theirs[0].prevHash);
  });

  it("lets only one of two simultaneous outcomes through", async () => {
    const input = lockInput();
    await appendEvent(harness, input);

    const attempts = await Promise.allSettled([
      appendEvent(harness, resolveInput(input.payload.decisionId, "happened")),
      appendEvent(harness, resolveInput(input.payload.decisionId, "did_not_happen")),
    ]);

    const settled = attempts.filter((a) => a.status === "fulfilled");
    expect(settled).toHaveLength(1);
    expect(await listChain(harness, USER)).toHaveLength(2);
  });
});

describe("the projection is derived, not authoritative", () => {
  /**
   * If these ever disagree, the projection is wrong and the ledger is right.
   * Asserting equality here is what makes it safe to say the view can be thrown
   * away and rebuilt.
   */
  it("matches a fold of the ledger exactly", async () => {
    const first = lockInput({ confidence: 30 });
    const second = lockInput({ confidence: 90 });
    await appendEvent(harness, first);
    await appendEvent(harness, second);
    await appendEvent(harness, {
      userId: USER,
      type: "review_rescheduled",
      at: Date.parse("2026-02-01T09:00:00Z"),
      payload: {
        decisionId: first.payload.decisionId,
        reviewAt: Date.parse("2026-09-01T09:00:00Z"),
        reviewLocal: { date: "2026-09-01", time: "09:00", timeZone: "Europe/London" },
      },
    });
    await appendEvent(harness, resolveInput(second.payload.decisionId, "happened"));

    const chain = await listChain(harness, USER);
    const { decisions: folded, anomalies } = rebuildDecisions(USER, chain);
    const stored = await listDecisions(harness, USER);

    expect(anomalies).toStrictEqual([]);
    const byId = (list: typeof stored) =>
      [...list].sort((a, b) => a.decisionId.localeCompare(b.decisionId));
    expect(byId(stored)).toStrictEqual(byId(folded));
  });

  it("finds what is due without scanning the collection", async () => {
    const soon = lockInput();
    soon.payload.reviewAt = Date.parse("2026-01-20T09:00:00Z");
    const later = lockInput();
    later.payload.reviewAt = Date.parse("2027-01-20T09:00:00Z");
    await appendEvent(harness, soon);
    await appendEvent(harness, later);

    const due = await listDue(harness, USER, Date.parse("2026-02-01T00:00:00Z"));
    expect(due.map((d) => d.decisionId)).toStrictEqual([soon.payload.decisionId]);

    const plan = await collections(harness.db)
      .decisions.find(
        { userId: USER, resolution: null, reviewAt: { $lte: Date.now() } },
        { sort: { reviewAt: 1 } },
      )
      .explain("queryPlanner");
    expect(JSON.stringify(plan)).toContain("IXSCAN");
  });
});
