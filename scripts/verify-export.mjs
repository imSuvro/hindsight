#!/usr/bin/env node
/**
 * Verify a Hindsight export without Hindsight.
 *
 *   node scripts/verify-export.mjs hindsight-2026-08-21.json
 *
 * This is the point of the whole design. The hash chain is only worth something
 * if you can check it somewhere the operator of the service does not control,
 * so this script depends on nothing but Node's own crypto, and it is short
 * enough to read in full before you run it.
 *
 * It re-derives every fingerprint from the entry's contents and checks that
 * each entry names the one before it. If a single character of any past entry
 * had been altered, every entry after it would fail here.
 *
 * One thing it cannot check: whether entries were removed from the *end*, since
 * any prefix of a valid chain is itself valid. Compare the head printed below
 * against a copy you already hold — the footer of any review email, or an older
 * export.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

/** The canonical form: sorted keys, integers only, no floating point. */
function canonicalize(value, path = "") {
  if (value === null) return "null";
  const type = typeof value;
  if (type === "string") return JSON.stringify(value);
  if (type === "boolean") return value ? "true" : "false";
  if (type === "number") {
    if (!Number.isFinite(value)) throw new Error(`Non-finite number at ${path}`);
    if (!Number.isInteger(value)) throw new Error(`Non-integer number at ${path}`);
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item, i) => canonicalize(item, `${path}[${i}]`)).join(",")}]`;
  }
  if (type === "object") {
    const keys = Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const body = keys
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalize(value[key], `${path}.${key}`)}`,
      )
      .join(",");
    return `{${body}}`;
  }
  throw new Error(`${type} has no canonical form (at ${path})`);
}

const sha256 = (input) => createHash("sha256").update(input, "utf8").digest("hex");

function entryHash(entry, chainVersion, canonicalVersion) {
  return sha256(
    canonicalize({
      at: entry.at,
      canonicalVersion,
      chainVersion,
      payload: entry.payload,
      prevHash: entry.prevHash,
      seq: entry.seq,
      type: entry.type,
      userId: entry.userId,
    }),
  );
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/verify-export.mjs <export.json>");
  process.exit(2);
}

const bundle = JSON.parse(await readFile(file, "utf8"));
if (bundle.format !== "hindsight-journal") {
  console.error("That does not look like a Hindsight export.");
  process.exit(2);
}

const { chainVersion, canonicalVersion, account, ledger } = bundle;
const expectedGenesis = sha256(`hindsight/v${chainVersion}/genesis/${account.id}`);

if (account.genesisPrevHash !== expectedGenesis) {
  console.error("FAIL: the export's genesis anchor does not match its account id.");
  process.exit(1);
}

let previous = expectedGenesis;
for (let index = 0; index < ledger.length; index += 1) {
  const entry = ledger[index];
  const position = `entry ${index + 1} (seq ${entry.seq})`;

  if (entry.seq !== index + 1) {
    console.error(
      `FAIL: ${position} is out of sequence — an entry is missing or duplicated.`,
    );
    process.exit(1);
  }
  if (entry.userId !== account.id) {
    console.error(`FAIL: ${position} belongs to a different account.`);
    process.exit(1);
  }
  if (entry.prevHash !== previous) {
    console.error(`FAIL: ${position} does not follow the entry before it.`);
    process.exit(1);
  }
  const recomputed = entryHash(entry, chainVersion, canonicalVersion);
  if (recomputed !== entry.hash) {
    console.error(
      `FAIL: ${position} has been altered — its contents no longer match its fingerprint.`,
    );
    console.error(`      stored:     ${entry.hash}`);
    console.error(`      recomputed: ${recomputed}`);
    process.exit(1);
  }
  previous = entry.hash;
}

const head = ledger.length > 0 ? ledger[ledger.length - 1] : null;

console.log(`OK: all ${ledger.length} entries verify.`);
console.log(`    Exported:  ${bundle.exportedAt}`);
console.log(`    Decisions: ${bundle.decisions.length}`);
if (head) console.log(`    Head:      ${head.hash}`);
console.log("");
console.log("This proves nothing in the record was altered or reordered.");
console.log("It cannot prove nothing was removed from the end — for that,");
console.log("compare the head above against one you already have (the footer");
console.log("of any review email carries it).");
