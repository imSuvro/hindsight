import Link from "next/link";
import { formatDate, relativeDays } from "@/lib/format";
import {
  DOMAIN_LABELS,
  type DecisionView,
  type Outcome,
  decisionStatus,
} from "@/lib/schemas/domain";
import styles from "./DecisionList.module.css";

/**
 * The journal itself.
 *
 * Every card leads with what was predicted rather than with the outcome,
 * because the prediction is the thing being examined. The confidence figure is
 * always in the belief colour and the outcome mark always in the reality
 * colour, so the two never get confused for each other at a glance.
 */

const OUTCOME_LABELS: Record<Outcome, string> = {
  happened: "It happened",
  did_not_happen: "It did not happen",
  unresolvable: "Could not be settled",
};

const OUTCOME_MARKS: Record<Outcome, string> = {
  happened: styles.outcomeHappened,
  did_not_happen: styles.outcomeDidNot,
  unresolvable: styles.outcomeUnresolvable,
};

export type DecisionListProps = {
  decisions: readonly DecisionView[];
  now: number;
  timeZone: string;
  /** Sample journals are read-only, so their cards do not link anywhere. */
  interactive?: boolean;
  showNotes?: boolean;
  emptyMessage?: string;
};

function statusLabel(decision: DecisionView, now: number): string {
  const status = decisionStatus(decision, now);
  if (status === "resolved") {
    return `Reviewed ${relativeDays(now, decision.resolution?.resolvedAt ?? decision.reviewAt)}`;
  }
  if (status === "due") return "Ready for review";
  return `Comes back ${relativeDays(now, decision.reviewAt)}`;
}

function DecisionBody({
  decision,
  now,
  timeZone,
  showNotes,
}: {
  decision: DecisionView;
  now: number;
  timeZone: string;
  showNotes: boolean;
}) {
  const status = decisionStatus(decision, now);
  const resolution = decision.resolution;

  return (
    <>
      <p className={styles.meta}>
        <span>{DOMAIN_LABELS[decision.domain]}</span>
        <span>Locked {formatDate(decision.lockedAt, timeZone)}</span>
        <span
          className={
            status === "due"
              ? styles.statusDue
              : status === "resolved"
                ? styles.statusResolved
                : undefined
          }
        >
          {statusLabel(decision, now)}
        </span>
        {decision.rescheduleCount > 0 && (
          <span>
            Moved {decision.rescheduleCount}{" "}
            {decision.rescheduleCount === 1 ? "time" : "times"}
          </span>
        )}
      </p>

      <h3 className={styles.title}>{decision.title}</h3>

      <p className={styles.expected}>{decision.expectedOutcome}</p>

      <div className={styles.figure}>
        <span className={styles.confidence}>{decision.confidence}%</span>
        <span
          className={styles.confidenceTrack}
          role="img"
          aria-label={`Stated confidence ${decision.confidence} percent`}
        >
          <span
            className={styles.confidenceFill}
            style={{ width: `${decision.confidence}%` }}
          />
        </span>
        {resolution && (
          <span className={styles.outcome}>
            <span
              className={`${styles.outcomeMark} ${OUTCOME_MARKS[resolution.outcome]}`}
              aria-hidden="true"
            />
            {OUTCOME_LABELS[resolution.outcome]}
          </span>
        )}
      </div>

      {showNotes && resolution && resolution.notes.length > 0 && (
        <p className={styles.notes}>{resolution.notes}</p>
      )}
    </>
  );
}

export function DecisionList({
  decisions,
  now,
  timeZone,
  interactive = true,
  showNotes = false,
  emptyMessage,
}: DecisionListProps) {
  if (decisions.length === 0) {
    return <p className={styles.empty}>{emptyMessage ?? "Nothing here yet."}</p>;
  }

  return (
    <ul className={styles.list}>
      {decisions.map((decision) => (
        <li key={decision.decisionId} className={styles.item}>
          {interactive ? (
            <Link href={`/decisions/${decision.decisionId}`} className={styles.link}>
              <DecisionBody
                decision={decision}
                now={now}
                timeZone={timeZone}
                showNotes={showNotes}
              />
            </Link>
          ) : (
            <div className={styles.static}>
              <DecisionBody
                decision={decision}
                now={now}
                timeZone={timeZone}
                showNotes={showNotes}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
