import type { Metadata } from "next";
import Link from "next/link";
import { CalibrationPanel } from "@/components/journal/CalibrationPanel";
import { DecisionList } from "@/components/journal/DecisionList";
import { PageShell } from "@/components/layout/PageShell";
import { DEMO_NOW, demoDecisions, demoHead } from "@/fixtures/demo";
import { buildCalibrationReport } from "@/lib/domain/calibration";
import { decisionStatus } from "@/lib/schemas/domain";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Sample journal",
  description:
    "A worked example of a Hindsight journal: twenty-eight decisions, their sealed predictions, and the calibration they add up to.",
};

const DEMO_ZONE = "Europe/London";

/**
 * Somewhere to look before committing anything real.
 *
 * The sample is built from actual sealed ledger entries and folded by the same
 * function the live journal uses, so what a visitor sees here is genuinely how
 * the product behaves — not a mock-up of it.
 */
export default function DemoPage() {
  const decisions = demoDecisions();
  const report = buildCalibrationReport(decisions, DEMO_NOW);
  const head = demoHead();

  const open = decisions.filter(
    (decision) => decisionStatus(decision, DEMO_NOW) !== "resolved",
  );
  const resolved = decisions.filter((decision) => decision.resolution !== null);

  return (
    <PageShell
      sample
      chainHead={head}
      title="A sample journal, four years in"
      lead="Twenty-eight decisions belonging to nobody, so you can see what the arithmetic looks like before you have any of your own."
      actions={
        <Link href="/sign-in" className={styles.startAction}>
          Start a journal
        </Link>
      }
    >
      <div className={styles.sections}>
        <CalibrationPanel report={report} />

        <section className={styles.section} aria-labelledby="open-heading">
          <div className={styles.sectionHead}>
            <h2 id="open-heading" className={styles.sectionTitle}>
              Still open
            </h2>
            <p className={styles.sectionNote}>
              Sealed, waiting for the world to answer. Two of these have reached their
              review date.
            </p>
          </div>
          <DecisionList
            decisions={open}
            now={DEMO_NOW}
            timeZone={DEMO_ZONE}
            interactive={false}
          />
        </section>

        <section className={styles.section} aria-labelledby="resolved-heading">
          <div className={styles.sectionHead}>
            <h2 id="resolved-heading" className={styles.sectionTitle}>
              Answered
            </h2>
            <p className={styles.sectionNote}>
              The prediction on each of these is exactly as it was written, before the
              outcome was known. That is the whole trick.
            </p>
          </div>
          <DecisionList
            decisions={resolved}
            now={DEMO_NOW}
            timeZone={DEMO_ZONE}
            interactive={false}
            showNotes
          />
        </section>
      </div>
    </PageShell>
  );
}
