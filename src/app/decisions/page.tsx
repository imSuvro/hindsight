import type { Metadata } from "next";
import Link from "next/link";
import { DecisionList } from "@/components/journal/DecisionList";
import { PageShell, SIGNED_IN_NAV } from "@/components/layout/PageShell";
import { listDecisions } from "@/lib/db/decisions";
import { journalContext } from "@/lib/journal-context";
import { decisionStatus } from "@/lib/schemas/domain";
import controls from "@/components/ui/controls.module.css";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Journal" };

export default async function JournalPage() {
  const journal = await journalContext();
  const decisions = await listDecisions(journal.ctx, journal.userId);

  const open = decisions.filter(
    (decision) => decisionStatus(decision, journal.now) !== "resolved",
  );
  const answered = decisions.filter((decision) => decision.resolution !== null);

  return (
    <PageShell
      nav={SIGNED_IN_NAV}
      currentPath="/decisions"
      identity={{ name: journal.name, image: journal.image }}
      chainHead={journal.head.seq > 0 ? journal.head : null}
      title="Your journal"
      lead="Everything you have written down, in the words you used at the time."
      actions={
        <Link href="/decisions/new" className={controls.primary}>
          Record a decision
        </Link>
      }
    >
      <div className={styles.sections}>
        <section className={styles.section} aria-labelledby="open-heading">
          <h2 id="open-heading" className={styles.sectionTitle}>
            Open{open.length > 0 ? ` · ${open.length}` : ""}
          </h2>
          <DecisionList
            decisions={open}
            now={journal.now}
            timeZone={journal.timeZone}
            emptyMessage="Nothing waiting. Every decision you have recorded has an outcome against it."
          />
        </section>

        <section className={styles.section} aria-labelledby="answered-heading">
          <h2 id="answered-heading" className={styles.sectionTitle}>
            Answered{answered.length > 0 ? ` · ${answered.length}` : ""}
          </h2>
          <DecisionList
            decisions={answered}
            now={journal.now}
            timeZone={journal.timeZone}
            showNotes
            emptyMessage="Nothing answered yet. Decisions move here once their review date comes round and you say what happened."
          />
        </section>
      </div>
    </PageShell>
  );
}
