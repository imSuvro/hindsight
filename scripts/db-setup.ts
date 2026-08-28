import { config } from "dotenv";
import { MongoClient } from "mongodb";
import { setupDatabase } from "../src/lib/db/setup";

/**
 * Apply indexes and stored validators to a database.
 *
 *   pnpm db:setup                    # uses MONGODB_URI from .env.local
 *   MONGODB_URI="mongodb+srv://…" pnpm db:setup
 *
 * Run this once against a new cluster and again after any change to the index
 * or validator definitions. It is idempotent, so running it twice costs
 * nothing.
 *
 * It is deliberately not called from application code: serverless invocations
 * are short and numerous, and issuing `createIndex` on a request path would
 * repeat the same command thousands of times a day to no purpose.
 */
async function main(): Promise<void> {
  config({ path: ".env.local", quiet: true });
  config({ quiet: true });

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(
      "MONGODB_URI is not set. Put it in .env.local or pass it on the command line.",
    );
    process.exit(1);
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    console.log(`Applying indexes and validators to "${db.databaseName}"…`);
    await setupDatabase(db);

    for (const name of [
      "ledger",
      "chain_heads",
      "decisions",
      "notifications",
      "practice_answers",
    ]) {
      const indexes = await db.collection(name).indexes();
      console.log(`  ${name}: ${indexes.map((index) => index.name).join(", ")}`);
    }
    console.log("Done.");
  } finally {
    await client.close();
  }
}

// Wrapped rather than written with top-level await: this file is loaded as
// CommonJS by tsx, which does not support it.
main().catch((error: unknown) => {
  console.error("Setup failed:", error);
  process.exit(1);
});
