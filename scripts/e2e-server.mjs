#!/usr/bin/env node
/**
 * The application, ready for Playwright, with a database of its own.
 *
 * Playwright starts `webServer` *before* `globalSetup`, so there is no hook in
 * which to boot a database and hand its address to the server. This wrapper is
 * the answer: it starts an in-memory replica set, applies the indexes and
 * validators, then execs `next start` with the connection string already in the
 * environment.
 *
 * A replica set rather than a standalone server because the ledger append is a
 * transaction, and testing that path against something that cannot do
 * transactions would be testing nothing.
 *
 * Email runs on the logging transport, so a test run can never reach a real
 * inbox or spend a day's sending quota.
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const PORT = process.env.E2E_PORT ?? "3100";

const replicaSet = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: "wiredTiger" },
});
// getUri() already carries the replicaSet query string, so the database name
// has to be passed in rather than appended.
const uri = replicaSet.getUri("hindsight_e2e");

/*
 * Publish the address so a spec can seed a state the interface cannot reach.
 * The only one that matters is a decision whose review date has passed: review
 * dates are forward-only in the form, so without this the second half of the
 * core loop — reading a due decision and recording what happened — can only be
 * tested at the repository layer, never through the interface a user touches.
 */
mkdirSync(".e2e", { recursive: true });
writeFileSync(".e2e/mongo-uri", uri);

const environment = {
  ...process.env,
  MONGODB_URI: uri,
  BETTER_AUTH_URL: `http://localhost:${PORT}`,
  BETTER_AUTH_SECRET: "end-to-end-test-secret-value-thirty-two-plus",
  CRON_SECRET: "end-to-end-test-cron-secret-value-here",
  EMAIL_MODE: "log",
  EMAIL_FROM: "no-reply@hindsight.invalid",
  // Enables the email sign-in path the specs use. Never reaches production:
  // the gate also requires VERCEL_ENV to not be "production".
  AUTH_TEST_MODE: "1",
  NODE_ENV: "production",
};

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: environment,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

console.log(`[e2e] mongodb replica set at ${uri}`);
await run("pnpm", ["exec", "tsx", "scripts/db-setup.ts"]);

const server = spawn("pnpm", ["exec", "next", "start", "-p", PORT], {
  env: environment,
  stdio: "inherit",
  shell: process.platform === "win32",
});

async function shutdown(code) {
  server.kill();
  await replicaSet.stop().catch(() => undefined);
  process.exit(code);
}

process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));
server.on("exit", (code) => void shutdown(code ?? 0));
