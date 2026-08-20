import { CANONICAL_VERSION } from "@/lib/domain/canonical";
import { CHAIN_VERSION, genesisPrevHash } from "@/lib/domain/chain";
import type { AuditBundle } from "@/lib/audit";
import type { DecisionView } from "@/lib/schemas/domain";

/**
 * Taking your record with you.
 *
 * The JSON export is not a convenience feature, it is part of the tamper-
 * evidence story: it contains the full ledger with every digest, plus the
 * genesis anchor and the version of the hashing scheme, so
 * `scripts/verify-export.mjs` can re-check the whole chain without this
 * application being involved at all. Verification you can only perform inside
 * the thing being verified is not worth much.
 *
 * The CSV is the opposite: a flat, lossy table for spreadsheets.
 */

export type ExportBundle = {
  format: "hindsight-journal";
  version: number;
  exportedAt: string;
  chainVersion: number;
  canonicalVersion: number;
  account: { id: string; genesisPrevHash: string };
  head: { seq: number; hash: string } | null;
  verification: { intact: boolean; problems: AuditBundle["problems"] };
  ledger: AuditBundle["chain"];
  decisions: DecisionView[];
  howToVerify: string;
};

export function buildExport(userId: string, audit: AuditBundle): ExportBundle {
  return {
    format: "hindsight-journal",
    version: 1,
    exportedAt: audit.checkedAt,
    chainVersion: CHAIN_VERSION,
    canonicalVersion: CANONICAL_VERSION,
    account: { id: userId, genesisPrevHash: genesisPrevHash(userId) },
    head: audit.head,
    verification: { intact: audit.intact, problems: audit.problems },
    ledger: audit.chain,
    decisions: audit.rebuilt,
    howToVerify:
      "Run `node verify-export.mjs <this file>` from the Hindsight repository (scripts/verify-export.mjs). It recomputes every fingerprint without using the application.",
  };
}

/**
 * Spreadsheets execute cells that begin with =, +, - or @. A decision titled
 * "=cmd|..." is not a realistic attack on yourself, but this export can be
 * shared, and a formula-injection guard costs one line.
 */
function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

const CSV_COLUMNS = [
  "decision_id",
  "locked_at",
  "title",
  "situation",
  "expected_outcome",
  "confidence_percent",
  "domain",
  "tags",
  "review_at",
  "review_local_date",
  "review_local_time",
  "review_time_zone",
  "reschedule_count",
  "outcome",
  "resolved_at",
  "notes",
  "entry_hash",
] as const;

export function buildCsv(decisions: readonly DecisionView[]): string {
  const rows = decisions.map((decision) =>
    [
      decision.decisionId,
      new Date(decision.lockedAt).toISOString(),
      decision.title,
      decision.situation,
      decision.expectedOutcome,
      decision.confidence,
      decision.domain,
      decision.tags.join(" "),
      new Date(decision.reviewAt).toISOString(),
      decision.reviewLocal.date,
      decision.reviewLocal.time,
      decision.reviewLocal.timeZone,
      decision.rescheduleCount,
      decision.resolution?.outcome ?? "",
      decision.resolution ? new Date(decision.resolution.resolvedAt).toISOString() : "",
      decision.resolution?.notes ?? "",
      decision.entryHash,
    ]
      .map(csvCell)
      .join(","),
  );

  // A BOM so spreadsheets open non-ASCII text as UTF-8 rather than guessing.
  return `﻿${CSV_COLUMNS.join(",")}\n${rows.join("\n")}\n`;
}
