import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteAccount } from "@/lib/auth/account";
import { collections } from "@/lib/db/collections";
import { type AppendInput, appendEvent, listChain } from "@/lib/db/ledger";
import { claimNotification } from "@/lib/db/notifications";
import { newDecisionId } from "@/lib/ids";
import { type Harness, createHarness } from "./harness";

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness("account");
});

afterAll(async () => {
  await harness.close();
});

/** Stand in for the documents Better Auth writes when someone signs in. */
async function seedIdentity(userId: string): Promise<void> {
  const objectId = new ObjectId(userId);
  await harness.db.collection("user").insertOne({
    _id: objectId,
    name: "Someone",
    email: `${userId}@example.test`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await harness.db.collection("session").insertOne({
    userId: objectId,
    token: `token-${userId}`,
    expiresAt: new Date(Date.now() + 86_400_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await harness.db.collection("account").insertOne({
    userId: objectId,
    accountId: `google-${userId}`,
    providerId: "google",
    issuer: "https://accounts.google.com",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function seedJournal(userId: string, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const decisionId = newDecisionId();
    ids.push(decisionId);
    const input = {
      userId,
      type: "decision_locked",
      at: Date.parse("2026-01-01T09:00:00Z") + index,
      payload: {
        decisionId,
        title: `Decision ${index}`,
        situation: "",
        expectedOutcome: "It works out",
        confidence: 60,
        domain: "personal",
        tags: [],
        reviewAt: Date.parse("2026-06-01T09:00:00Z"),
        reviewLocal: { date: "2026-06-01", time: "09:00", timeZone: "UTC" },
      },
    } satisfies AppendInput;
    await appendEvent(harness, input);
    await claimNotification(harness, {
      userId,
      decisionId,
      kind: "review_due",
      at: new Date(),
    });
  }
  return ids;
}

describe("deleteAccount", () => {
  it("removes every trace of one account and nothing of anyone else's", async () => {
    const mine = new ObjectId().toHexString();
    const theirs = new ObjectId().toHexString();

    await seedIdentity(mine);
    await seedIdentity(theirs);
    await seedJournal(mine, 3);
    await seedJournal(theirs, 2);

    const receipt = await deleteAccount(harness, mine);

    expect(receipt).toStrictEqual({
      ledgerEntries: 3,
      decisions: 3,
      notifications: 3,
      sessions: 1,
      linkedAccounts: 1,
    });

    const own = collections(harness.db);
    expect(await own.ledger.countDocuments({ userId: mine })).toBe(0);
    expect(await own.decisions.countDocuments({ userId: mine })).toBe(0);
    expect(await own.notifications.countDocuments({ userId: mine })).toBe(0);
    expect(await own.chainHeads.findOne({ _id: mine })).toBeNull();
    expect(
      await harness.db.collection("user").findOne({ _id: new ObjectId(mine) }),
    ).toBeNull();
    expect(
      await harness.db.collection("session").countDocuments({
        userId: new ObjectId(mine),
      }),
    ).toBe(0);
    expect(
      await harness.db.collection("account").countDocuments({
        userId: new ObjectId(mine),
      }),
    ).toBe(0);

    // The other journal is untouched.
    expect(await listChain(harness, theirs)).toHaveLength(2);
    expect(await own.decisions.countDocuments({ userId: theirs })).toBe(2);
    expect(await own.chainHeads.findOne({ _id: theirs })).not.toBeNull();
    expect(
      await harness.db.collection("user").findOne({ _id: new ObjectId(theirs) }),
    ).not.toBeNull();
  });

  it("is safe to run twice", async () => {
    const userId = new ObjectId().toHexString();
    await seedIdentity(userId);
    await seedJournal(userId, 1);

    await deleteAccount(harness, userId);
    const second = await deleteAccount(harness, userId);

    expect(second).toStrictEqual({
      ledgerEntries: 0,
      decisions: 0,
      notifications: 0,
      sessions: 0,
      linkedAccounts: 0,
    });
  });

  it("refuses an id that could not have come from an account", async () => {
    await expect(deleteAccount(harness, "not-an-object-id")).rejects.toThrow(
      /not a usable account id/i,
    );
  });

  it("lets a deleted user start a fresh journal from genesis", async () => {
    const userId = new ObjectId().toHexString();
    await seedIdentity(userId);
    await seedJournal(userId, 2);
    await deleteAccount(harness, userId);

    await seedJournal(userId, 1);
    const chain = await listChain(harness, userId);
    expect(chain).toHaveLength(1);
    expect(chain[0].seq).toBe(1);
  });
});
