import type { Metadata } from "next";
import { ReliabilityDiagram } from "@/components/charts/ReliabilityDiagram";
import { PracticeRun } from "@/components/forms/PracticeRun";
import { PageShell, SIGNED_IN_NAV } from "@/components/layout/PageShell";
import { Card, RailPanel, RailRow, SectionHead } from "@/components/ui/Surfaces";
import {
  listPracticeAnswers,
  seenQuestionIds,
  toPracticeAnswers,
} from "@/lib/db/practice";
import { buildPracticeReport, buildSession } from "@/lib/domain/practice";
import { journalContext } from "@/lib/journal-context";
import { PRACTICE_POOLS, PRACTICE_PROMPTS, PRACTICE_SOURCE } from "@/lib/practice-pools";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Practice" };

/**
 * The calibration trainer.
 *
 * The journal is silent until ten decisions have come back, which takes months.
 * This is where the same skill can be exercised now, on questions that already
 * have an answer, so a reader can see a real reliability diagram in one sitting
 * and learn what their own 70% is worth.
 *
 * Scored entirely separately from the journal, and said so on the page. Knowing
 * which country is larger is not knowing how your own decisions turn out, and a
 * product that let the easy number flatter the hard one would be worth nothing.
 */
export default async function PracticePage() {
  const journal = await journalContext();

  const [answers, seen] = await Promise.all([
    listPracticeAnswers(journal.ctx, journal.userId),
    seenQuestionIds(journal.ctx, journal.userId),
  ]);

  const report = buildPracticeReport(toPracticeAnswers(answers));

  // Seeded from what the account has already done, so a reload gives the same
  // set and finishing one genuinely produces a different one.
  const session = buildSession(PRACTICE_POOLS, {
    seed: `${journal.userId}:${answers.length}`,
    exclude: seen,
  });

  const percent = (value: number) => `${Math.round(value * 100)}%`;

  return (
    <PageShell
      nav={SIGNED_IN_NAV}
      currentPath="/practice"
      identity={{ name: journal.name, image: journal.image }}
      chainHead={journal.head.seq > 0 ? journal.head : null}
      title="Practice"
      lead="Questions that already have an answer, so you can find out what your own 70% is worth without waiting for the year to turn."
      rail={
        <>
          <RailPanel
            label="Your practice"
            note={
              report.brier === null
                ? `${report.remainingForHeadline} more and this starts reading.`
                : "Separate from your journal, and always will be."
            }
          >
            <RailRow label="Answered" value={report.counts.answered} />
            <RailRow label="Right" value={report.counts.correct} />
            {report.hitRate !== null && (
              <RailRow label="Hit rate" value={percent(report.hitRate)} />
            )}
            {report.brier !== null && (
              <RailRow label="Brier" value={report.brier.toFixed(3)} />
            )}
          </RailPanel>

          <RailPanel label="Where the facts come from">
            <p className={styles.sourceNote}>
              {PRACTICE_SOURCE.name}. {PRACTICE_SOURCE.note} Every question is computed
              from the figures, so there is no answer key to get wrong.
            </p>
          </RailPanel>
        </>
      }
    >
      <div className={styles.sections}>
        <Card>
          <PracticeRun questions={session} prompts={PRACTICE_PROMPTS} />
        </Card>

        <section aria-labelledby="practice-reading">
          <SectionHead
            id="practice-reading"
            title="What your practice says"
            note="Scored with the same arithmetic as your journal, and kept entirely apart from it."
          />

          {report.brier === null ? (
            <Card>
              <div className={styles.notYet}>
                <div>
                  <p className={styles.notYetCount}>
                    {report.counts.answered}/{report.thresholds.headline}
                  </p>
                  <p className={styles.notYetBody}>
                    A curve drawn from a handful of answers is not a weak signal, it is an
                    invented one — the same rule your journal keeps, on its own count.{" "}
                    {report.remainingForHeadline} more and this fills in.
                  </p>
                </div>
                <div className={styles.notYetFrame}>
                  <ReliabilityDiagram
                    bins={[]}
                    scoredCount={report.counts.answered}
                    variant="frame"
                  />
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <div className={styles.reading}>
                <p className={styles.verdict}>
                  {report.direction === "calibrated"
                    ? "Your confidence tracks how often you are right."
                    : report.direction === "overconfident"
                      ? `Your confidence runs ${Math.round(Math.abs(report.gap ?? 0) * 100)} points hot.`
                      : `Your confidence runs ${Math.round(Math.abs(report.gap ?? 0) * 100)} points cold.`}
                </p>
                <p className={styles.verdictBody}>
                  Across {report.counts.answered} answers you have said{" "}
                  {percent(report.meanConfidence ?? 0)} on average and been right{" "}
                  {percent(report.hitRate ?? 0)} of the time.
                  {report.edgeOverGuessing !== null && (
                    <>
                      {" "}
                      That is{" "}
                      {report.edgeOverGuessing < 0
                        ? "worse than answering 50 to everything would have been — the confidence is pointing the wrong way"
                        : report.edgeOverGuessing === 0
                          ? "exactly what answering 50 to everything would have scored"
                          : `${Math.round(report.edgeOverGuessing * 100)}% of the way from a shrug to perfect`}
                      .
                    </>
                  )}
                </p>
                <ReliabilityDiagram
                  bins={report.bins}
                  insight={report.insight}
                  scoredCount={report.counts.answered}
                  noun="answers"
                />
              </div>
            </Card>
          )}
        </section>
      </div>
    </PageShell>
  );
}
