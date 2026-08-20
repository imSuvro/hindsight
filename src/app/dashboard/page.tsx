import type { Metadata } from "next";
import Link from "next/link";
import { Onboarding } from "@/components/forms/Onboarding";
import { CalibrationPanel } from "@/components/journal/CalibrationPanel";
import { DecisionList } from "@/components/journal/DecisionList";
import { PageShell, SIGNED_IN_NAV } from "@/components/layout/PageShell";
import { listDecisions } from "@/lib/db/decisions";
import { buildCalibrationReport } from "@/lib/domain/calibration";
import { firstName, greeting, journalContext } from "@/lib/journal-context";
import { decisionStatus } from "@/lib/schemas/domain";
import controls from "@/components/ui/controls.module.css";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Where a signed-in person lands.
 *
 * The order is deliberate: anything waiting on them first, then what their
 * record says about them, then the journal itself. A dashboard that leads with
 * statistics for a journal with four entries would be showing off rather than
 * being useful.
 */
export default async function DashboardPage() {
  const journal = await journalContext();
  const decisions = await listDecisions(journal.ctx, journal.userId);
  const report = buildCalibrationReport(decisions, journal.now);

  const due = decisions.filter(
    (decision) => decisionStatus(decision, journal.now) === "due",
  );
  const recent = decisions.slice(0, 5);
  const showOnboarding = !journal.onboarded || decisions.length === 0;

  return (
    <PageShell
      nav={SIGNED_IN_NAV}
      currentPath="/dashboard"
      identity={{ name: journal.name, image: journal.image }}
      chainHead={journal.head.seq > 0 ? journal.head : null}
      title={`${greeting(journal.timeZone, journal.now)}, ${firstName(journal.name)}`}
      lead={
        decisions.length === 0
          ? "Nothing recorded yet. The first one takes about a minute."
          : `${decisions.length} ${decisions.length === 1 ? "decision" : "decisions"} recorded, ${report.counts.resolved} answered.`
      }
      actions={
        <Link href="/decisions/new" className={controls.primary}>
          Record a decision
        </Link>
      }
    >
      <div className={styles.sections}>
        {showOnboarding && <Onboarding storedTimeZone={journal.timeZone} />}

        {due.length > 0 && (
          <section className={styles.section} aria-labelledby="due-heading">
            <div className={styles.dueHead}>
              <h2 id="due-heading" className={styles.sectionTitle}>
                {due.length === 1
                  ? "One decision is ready for review"
                  : `${due.length} decisions are ready for review`}
              </h2>
              <p className={styles.sectionNote}>
                You wrote these before you knew. Read what you thought, then say what
                happened.
              </p>
            </div>
            <DecisionList
              decisions={due.slice(0, 3)}
              now={journal.now}
              timeZone={journal.timeZone}
            />
            {due.length > 3 && (
              <Link href="/review" className={controls.secondary}>
                See all {due.length}
              </Link>
            )}
          </section>
        )}

        {decisions.length > 0 && (
          <section className={styles.section} aria-labelledby="calibration-heading">
            <h2 id="calibration-heading" className="visually-hidden">
              Your calibration
            </h2>
            <CalibrationPanel report={report} />
          </section>
        )}

        {recent.length > 0 && (
          <section className={styles.section} aria-labelledby="recent-heading">
            <div className={styles.dueHead}>
              <h2 id="recent-heading" className={styles.sectionTitle}>
                Recently recorded
              </h2>
            </div>
            <DecisionList
              decisions={recent}
              now={journal.now}
              timeZone={journal.timeZone}
            />
            {decisions.length > recent.length && (
              <Link href="/decisions" className={controls.secondary}>
                See the whole journal
              </Link>
            )}
          </section>
        )}
      </div>
    </PageShell>
  );
}
