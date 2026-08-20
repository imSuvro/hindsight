import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RescheduleForm } from "@/components/forms/RescheduleForm";
import { ResolveForm } from "@/components/forms/ResolveForm";
import { PageShell, SIGNED_IN_NAV } from "@/components/layout/PageShell";
import { getDecision } from "@/lib/db/decisions";
import { shortHash } from "@/lib/domain/chain";
import { probabilityOf } from "@/lib/domain/scoring";
import { formatDate, formatDateTime, relativeDays } from "@/lib/format";
import { journalContext, todayIn } from "@/lib/journal-context";
import { DOMAIN_LABELS, decisionStatus } from "@/lib/schemas/domain";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Decision" };

const OUTCOME_TEXT = {
  happened: "It happened",
  did_not_happen: "It did not happen",
  unresolvable: "It could not be settled either way",
} as const;

/**
 * One decision, and the case for trusting it.
 *
 * The prediction is presented as a sealed object — the words, the number, the
 * fingerprint, the position in the record — before anything about the outcome.
 * That ordering is the argument: what is being examined here is what you
 * thought, not what happened.
 */
export default async function DecisionPage(props: PageProps<"/decisions/[id]">) {
  const { id } = await props.params;
  const journal = await journalContext();
  const decision = await getDecision(journal.ctx, journal.userId, id);
  if (!decision) notFound();

  const status = decisionStatus(decision, journal.now);
  const resolution = decision.resolution;
  const squaredError =
    resolution && resolution.outcome !== "unresolvable"
      ? (probabilityOf(decision.confidence) -
          (resolution.outcome === "happened" ? 1 : 0)) **
        2
      : null;

  return (
    <PageShell
      nav={SIGNED_IN_NAV}
      currentPath="/decisions"
      identity={{ name: journal.name, image: journal.image }}
      chainHead={journal.head.seq > 0 ? journal.head : null}
    >
      <article className={styles.layout}>
        <div className={styles.record}>
          <p className={styles.meta}>
            <span>{DOMAIN_LABELS[decision.domain]}</span>
            <span>Locked {formatDateTime(decision.lockedAt, journal.timeZone)}</span>
            <span>Entry {decision.lockedSeq}</span>
          </p>

          <h1 className={styles.title}>{decision.title}</h1>

          {decision.situation && (
            <div className={styles.block}>
              <h2 className={styles.blockLabel}>What you knew at the time</h2>
              <p className={styles.situation}>{decision.situation}</p>
            </div>
          )}

          <div className={styles.prediction}>
            <div className={styles.predictionText}>
              <h2 className={styles.blockLabel}>You expected</h2>
              <p className={styles.expected}>{decision.expectedOutcome}</p>
            </div>
            <div className={styles.predictionFigure}>
              <span className={styles.confidence}>{decision.confidence}%</span>
              <span className={styles.confidenceLabel}>confident</span>
            </div>
          </div>

          {decision.tags.length > 0 && (
            <ul className={styles.tags}>
              {decision.tags.map((tag) => (
                <li key={tag} className={styles.tag}>
                  {tag}
                </li>
              ))}
            </ul>
          )}

          <p className={styles.seal}>
            <span className={styles.sealDot} aria-hidden="true" />
            Sealed as {shortHash(decision.entryHash)}. The wording and the number above
            cannot be changed by anyone, including us — see{" "}
            <Link href="/settings#record">verify your record</Link>.
          </p>
        </div>

        <div className={styles.outcomePanel}>
          {resolution ? (
            <>
              <h2 className={styles.outcomeHeading}>
                {OUTCOME_TEXT[resolution.outcome]}
              </h2>
              <p className={styles.outcomeMeta}>
                Recorded {formatDate(resolution.resolvedAt, journal.timeZone)} · entry{" "}
                {resolution.resolvedSeq}
              </p>
              {resolution.notes && (
                <p className={styles.outcomeNotes}>{resolution.notes}</p>
              )}
              {squaredError !== null ? (
                <p className={styles.contribution}>
                  This one contributes{" "}
                  <span className={styles.contributionNumber}>
                    {squaredError.toFixed(3)}
                  </span>{" "}
                  to your Brier score. Zero would be perfect;{" "}
                  {squaredError < 0.09
                    ? "this was a good call."
                    : squaredError < 0.25
                      ? "this was roughly a coin flip's worth of error."
                      : "this is the kind of miss that moves the number."}
                </p>
              ) : (
                <p className={styles.contribution}>
                  Left out of every figure. Guessing at an outcome nobody can settle would
                  flatter the score rather than measure it.
                </p>
              )}
            </>
          ) : status === "due" ? (
            <>
              <h2 className={styles.outcomeHeading}>What actually happened?</h2>
              <p className={styles.outcomeMeta}>
                This came up for review {relativeDays(journal.now, decision.reviewAt)}.
              </p>
              <ResolveForm
                decisionId={decision.decisionId}
                expectedOutcome={decision.expectedOutcome}
              />
            </>
          ) : (
            <>
              <h2 className={styles.outcomeHeading}>
                Comes back {relativeDays(journal.now, decision.reviewAt)}
              </h2>
              <p className={styles.outcomeMeta}>
                {formatDateTime(decision.reviewAt, journal.timeZone)} ·{" "}
                {decision.reviewLocal.timeZone}
                {decision.rescheduleCount > 0 &&
                  ` · moved ${decision.rescheduleCount} ${decision.rescheduleCount === 1 ? "time" : "times"}`}
              </p>
              <RescheduleForm
                decisionId={decision.decisionId}
                timeZone={journal.timeZone}
                today={todayIn(journal.timeZone, journal.now)}
                currentDate={decision.reviewLocal.date}
                currentTime={decision.reviewLocal.time}
              />
            </>
          )}
        </div>
      </article>
    </PageShell>
  );
}
