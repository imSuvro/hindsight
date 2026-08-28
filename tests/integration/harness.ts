import { MongoClient } from "mongodb";
import { inject } from "vitest";
import { setupDatabase } from "@/lib/db/setup";
import type { DbContext } from "@/lib/db/ledger";

/**
 * A database per test file, so suites cannot see each other's writes and can be
 * read in isolation when one of them fails.
 */
export type Harness = DbContext & { close: () => Promise<void> };

let counter = 0;

export async function createHarness(label: string): Promise<Harness> {
  counter += 1;
  const client = new MongoClient(inject("mongoUri"));
  await client.connect();
  const db = client.db(`hindsight_test_${label}_${counter}`);
  // Indexes and stored validators are part of what is under test: the unique
  // chain-position index is a correctness guarantee, not an optimisation.
  await setupDatabase(db);

  return {
    client,
    db,
    close: async () => {
      await db.dropDatabase();
      await client.close();
    },
  };
}

export async function clearJournal(ctx: DbContext): Promise<void> {
  await Promise.all([
    ctx.db.collection("ledger").deleteMany({}),
    ctx.db.collection("chain_heads").deleteMany({}),
    ctx.db.collection("decisions").deleteMany({}),
    ctx.db.collection("notifications").deleteMany({}),
    ctx.db.collection("practice_answers").deleteMany({}),
  ]);
}
