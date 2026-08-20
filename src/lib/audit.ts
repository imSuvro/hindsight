import { listDecisions } from "@/lib/db/decisions";
import { type DbContext, listChain } from "@/lib/db/ledger";
import { CHAIN_FAILURE_MESSAGES, type ChainHead, verifyChain } from "@/lib/domain/chain";
import { ANOMALY_MESSAGES, rebuildDecisions } from "@/lib/domain/rebuild";
import type { DecisionView, LedgerEntry } from "@/lib/schemas/domain";

/**
 * Checking a record against itself.
 *
 * Two independent questions, and the product answers both because they catch
 * different things:
 *
 * 1. **Is the chain intact?** Recompute every digest and every link. This
 *    catches an edited entry, a reordered one, a missing one, an entry moved
 *    between accounts.
 * 2. **Does what you are being shown match the record?** Fold the ledger and
 *    compare it with the projection the interface reads. This catches the case
 *    where the chain is fine but the view has drifted — a bug, or a write that
 *    went round the ledger.
 *
 * The honest limitation, stated in the result rather than buried: a chain that
 * has had its most recent entries removed still verifies, because any prefix of
 * a valid chain is valid. What defeats that is the head fingerprint, which the
 * app shows, emails and exports — so a copy exists outside this database.
 */

export type AuditProblem = { kind: "chain" | "projection"; detail: string };

export type AuditResult = {
  intact: boolean;
  entries: number;
  decisions: number;
  head: ChainHead | null;
  checkedAt: string;
  problems: AuditProblem[];
};

export type AuditBundle = AuditResult & {
  chain: LedgerEntry[];
  rebuilt: DecisionView[];
};

function differences(stored: DecisionView[], rebuilt: DecisionView[]): string[] {
  const problems: string[] = [];
  const byId = new Map(rebuilt.map((decision) => [decision.decisionId, decision]));

  for (const decision of stored) {
    const derived = byId.get(decision.decisionId);
    if (!derived) {
      problems.push(
        `A decision in your journal ("${decision.title}") has no matching entry in the record.`,
      );
      continue;
    }
    byId.delete(decision.decisionId);
    if (
      derived.confidence !== decision.confidence ||
      derived.expectedOutcome !== decision.expectedOutcome ||
      derived.title !== decision.title ||
      derived.reviewAt !== decision.reviewAt ||
      derived.resolution?.outcome !== decision.resolution?.outcome
    ) {
      problems.push(
        `What is shown for "${decision.title}" does not match what the record says.`,
      );
    }
  }

  for (const orphan of byId.values()) {
    problems.push(
      `The record contains a decision ("${orphan.title}") that your journal is not showing.`,
    );
  }

  return problems;
}

export async function auditRecord(ctx: DbContext, userId: string): Promise<AuditBundle> {
  const [chain, stored] = await Promise.all([
    listChain(ctx, userId),
    listDecisions(ctx, userId),
  ]);

  const problems: AuditProblem[] = [];
  const verification = verifyChain(userId, chain);

  if (!verification.valid) {
    problems.push({
      kind: "chain",
      detail: `${CHAIN_FAILURE_MESSAGES[verification.failure.reason]} (entry ${verification.failure.seq})`,
    });
  }

  const { decisions: rebuilt, anomalies } = rebuildDecisions(userId, chain);
  for (const anomaly of anomalies) {
    problems.push({
      kind: "chain",
      detail: `${ANOMALY_MESSAGES[anomaly.reason]} (entry ${anomaly.seq})`,
    });
  }
  for (const detail of differences(stored, rebuilt)) {
    problems.push({ kind: "projection", detail });
  }

  return {
    intact: problems.length === 0,
    entries: chain.length,
    decisions: stored.length,
    head: verification.valid ? verification.head : null,
    checkedAt: new Date().toISOString(),
    problems,
    chain,
    rebuilt,
  };
}
