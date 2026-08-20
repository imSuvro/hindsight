import { MongoMemoryReplSet } from "mongodb-memory-server";
import type { TestProject } from "vitest/node";

/**
 * One MongoDB for the whole integration run.
 *
 * A replica set rather than a standalone server, because the ledger append is a
 * transaction and standalone `mongod` does not support them — testing that path
 * against a server that cannot do transactions would test nothing. A single
 * node keeps startup to a couple of seconds.
 *
 * The mongod version is pinned in package.json so a Windows laptop and an
 * Ubuntu runner exercise the same server.
 */
let replicaSet: MongoMemoryReplSet | undefined;

export default async function setup({ provide }: TestProject) {
  replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  provide("mongoUri", replicaSet.getUri());

  return async () => {
    await replicaSet?.stop();
  };
}

declare module "vitest" {
  interface ProvidedContext {
    mongoUri: string;
  }
}
