import { type Db, MongoClient } from "mongodb";
import { env } from "@/lib/schemas/env";
import type { DbContext } from "./ledger";

/**
 * One MongoClient per server instance, created at module scope.
 *
 * Serverless invocations reuse a warm instance, so a client created per request
 * would open a new connection pool per request and walk straight into Atlas
 * M0's 500-connection ceiling. The pool is kept deliberately small for the same
 * reason: several warm instances multiply it.
 *
 * In development the client is stashed on `globalThis` because Next re-evaluates
 * modules on hot reload, and without it every save would leak a pool.
 */

const globalForMongo = globalThis as typeof globalThis & {
  __hindsightMongoClient?: MongoClient;
};

function createClient(): MongoClient {
  return new MongoClient(env().MONGODB_URI, {
    maxPoolSize: 8,
    minPoolSize: 0,
    maxIdleTimeMS: 60_000,
    serverSelectionTimeoutMS: 10_000,
    // The ledger append relies on transactions; both Atlas M0 and the
    // in-memory replica set used by the tests support them.
    retryWrites: true,
  });
}

export function getMongoClient(): MongoClient {
  if (!globalForMongo.__hindsightMongoClient) {
    globalForMongo.__hindsightMongoClient = createClient();
  }
  return globalForMongo.__hindsightMongoClient;
}

/**
 * The database named in the connection string. Resolving this does not connect;
 * the driver opens the pool lazily on the first operation.
 */
export function getDb(): Db {
  return getMongoClient().db();
}

export function dbContext(): DbContext {
  const client = getMongoClient();
  return { client, db: client.db() };
}
