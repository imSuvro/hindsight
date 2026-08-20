import { ObjectId } from "mongodb";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { collections } from "@/lib/db/collections";
import { type AppendInput, appendEvent, readChainHead } from "@/lib/db/ledger";
import type { EmailMessage, EmailTransport } from "@/lib/email/transport";
import { newDecisionId } from "@/lib/ids";
import { runResurface } from "@/lib/jobs/resurface";
import { type Harness, clearJournal, createHarness } from "./harness";

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness("resurface");
});

afterAll(async () => {
  await harness.close();
});

afterEach(async () => {
  await clearJournal(harness);
  await harness.db.collection("user").deleteMany({});
});

const NOW = Date.parse("2026-08-01T09:00:00Z");
const BASE_URL = "https://hindsight.example";

class RecordingTransport implements EmailTransport {
  readonly name = "log" as const;
  readonly sent: EmailMessage[] = [];

  send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}

class FailingTransport implements EmailTransport {
  readonly name = "log" as const;
  attempts = 0;

  send(): Promise<void> {
    this.attempts += 1;
    return Promise.reject(new Error("the provider said no"));
  }
}

async function seedUser(options: { optIn?: boolean; email?: string } = {}) {
  const objectId = new ObjectId();
  const userId = objectId.toHexString();
  await harness.db.collection("user").insertOne({
    _id: objectId,
    name: "Rowan Fisk",
    email: options.email ?? `${userId}@example.test`,
    emailVerified: true,
    emailOptIn: options.optIn ?? true,
    timeZone: "Europe/London",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return userId;
}

async function seedDecision(
  userId: string,
  reviewAt: number,
  title = "Move the scheduler out of the app",
) {
  const decisionId = newDecisionId();
  const input = {
    userId,
    type: "decision_locked",
    at: NOW - 30 * 86_400_000,
    payload: {
      decisionId,
      title,
      situation: "",
      expectedOutcome: "Notifications land within an hour",
      confidence: 75,
      domain: "technical",
      tags: [],
      reviewAt,
      reviewLocal: { date: "2026-08-01", time: "09:00", timeZone: "Europe/London" },
    },
  } satisfies AppendInput;
  await appendEvent(harness, input);
  return decisionId;
}

describe("runResurface", () => {
  it("sends one message per due decision", async () => {
    const userId = await seedUser();
    await seedDecision(userId, NOW - 1000, "First");
    await seedDecision(userId, NOW - 2000, "Second");

    const transport = new RecordingTransport();
    const summary = await runResurface(harness, {
      now: NOW,
      baseUrl: BASE_URL,
      transport,
    });

    expect(summary.scanned).toBe(2);
    expect(summary.sent).toBe(2);
    expect(summary.failed).toBe(0);
    expect(transport.sent).toHaveLength(2);
    expect(transport.sent[0].subject).toContain("Ready for review");
  });

  /**
   * The property the whole scheduling design leans on. GitHub's scheduler can
   * fire twice, and two runs can overlap; neither may produce a second email.
   */
  it("sends nothing on a second run", async () => {
    const userId = await seedUser();
    await seedDecision(userId, NOW - 1000);

    const first = new RecordingTransport();
    await runResurface(harness, { now: NOW, baseUrl: BASE_URL, transport: first });

    const second = new RecordingTransport();
    const summary = await runResurface(harness, {
      now: NOW + 3_600_000,
      baseUrl: BASE_URL,
      transport: second,
    });

    expect(first.sent).toHaveLength(1);
    expect(second.sent).toHaveLength(0);
    expect(summary.skippedAlreadySent).toBe(1);
  });

  it("sends once when two runs overlap", async () => {
    const userId = await seedUser();
    await seedDecision(userId, NOW - 1000);

    const a = new RecordingTransport();
    const b = new RecordingTransport();
    await Promise.all([
      runResurface(harness, { now: NOW, baseUrl: BASE_URL, transport: a }),
      runResurface(harness, { now: NOW, baseUrl: BASE_URL, transport: b }),
    ]);

    expect(a.sent.length + b.sent.length).toBe(1);
  });

  it("catches up on a backlog rather than only the last hour", async () => {
    const userId = await seedUser();
    // Due eight months ago: a scheduler that was disabled for a while must not
    // silently drop these.
    await seedDecision(userId, NOW - 240 * 86_400_000, "Long overdue");
    await seedDecision(userId, NOW - 1000, "Just due");

    const transport = new RecordingTransport();
    const summary = await runResurface(harness, {
      now: NOW,
      baseUrl: BASE_URL,
      transport,
    });

    expect(summary.sent).toBe(2);
    // Oldest first, so a backlog is worked through in the order it accumulated.
    expect(transport.sent[0].subject).toContain("Long overdue");
  });

  it("leaves decisions that are not due yet alone", async () => {
    const userId = await seedUser();
    await seedDecision(userId, NOW + 86_400_000);

    const transport = new RecordingTransport();
    const summary = await runResurface(harness, {
      now: NOW,
      baseUrl: BASE_URL,
      transport,
    });

    expect(summary.scanned).toBe(0);
    expect(transport.sent).toHaveLength(0);
  });

  it("leaves resolved decisions alone", async () => {
    const userId = await seedUser();
    const decisionId = await seedDecision(userId, NOW - 1000);
    await appendEvent(harness, {
      userId,
      type: "decision_resolved",
      at: NOW - 500,
      payload: { decisionId, outcome: "happened", notes: "" },
    });

    const transport = new RecordingTransport();
    const summary = await runResurface(harness, {
      now: NOW,
      baseUrl: BASE_URL,
      transport,
    });

    expect(summary.scanned).toBe(0);
    expect(transport.sent).toHaveLength(0);
  });

  it("respects an opt-out without consuming the notification", async () => {
    const userId = await seedUser({ optIn: false });
    const decisionId = await seedDecision(userId, NOW - 1000);

    const transport = new RecordingTransport();
    const summary = await runResurface(harness, {
      now: NOW,
      baseUrl: BASE_URL,
      transport,
    });

    expect(summary.skippedOptedOut).toBe(1);
    expect(transport.sent).toHaveLength(0);

    // No claim was taken, so opting back in still gets the reminder.
    const claims = await collections(harness.db).notifications.countDocuments({
      decisionId,
    });
    expect(claims).toBe(0);
  });

  /**
   * Claiming before sending means a failed send must give the claim back, or
   * that decision would be silently marked as notified forever.
   */
  it("gives the claim back when the send fails, so a later run retries", async () => {
    const userId = await seedUser();
    await seedDecision(userId, NOW - 1000);

    const failing = new FailingTransport();
    const first = await runResurface(harness, {
      now: NOW,
      baseUrl: BASE_URL,
      transport: failing,
    });
    expect(first.failed).toBe(1);
    expect(first.sent).toBe(0);
    expect(await collections(harness.db).notifications.countDocuments({})).toBe(0);

    const working = new RecordingTransport();
    const second = await runResurface(harness, {
      now: NOW + 3_600_000,
      baseUrl: BASE_URL,
      transport: working,
    });
    expect(second.sent).toBe(1);
    expect(working.sent).toHaveLength(1);
  });

  it("carries the record fingerprint out of the database", async () => {
    const userId = await seedUser();
    await seedDecision(userId, NOW - 1000);
    const head = await readChainHead(harness, userId);

    const transport = new RecordingTransport();
    await runResurface(harness, { now: NOW, baseUrl: BASE_URL, transport });

    // The full digest is in the message, which is the copy the operator cannot
    // reach — the thing that makes tamper-evidence more than an assertion.
    expect(transport.sent[0].text).toContain(head.hash);
    expect(transport.sent[0].html).toContain(head.hash);
    expect(transport.sent[0].text).toContain(`${BASE_URL}/decisions/`);
  });

  it("skips a journal whose owner no longer exists", async () => {
    await seedDecision(new ObjectId().toHexString(), NOW - 1000);

    const transport = new RecordingTransport();
    const summary = await runResurface(harness, {
      now: NOW,
      baseUrl: BASE_URL,
      transport,
    });

    expect(summary.skippedNoEmail).toBe(1);
    expect(transport.sent).toHaveLength(0);
  });
});
