import type { Metadata } from "next";
import Link from "next/link";
import { DecisionList } from "@/components/journal/DecisionList";
import { PageShell, SIGNED_IN_NAV } from "@/components/layout/PageShell";
import { listDue, listUpcoming } from "@/lib/db/decisions";
import { journalContext } from "@/lib/journal-context";
import controls from "@/components/ui/controls.module.css";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Review" };

export default async function ReviewPage() {
  const journal = await journalContext();
  const [due, upcoming] = await Promise.all([
    listDue(journal.ctx, journal.userId, journal.now),
    listUpcoming(journal.ctx, journal.userId, journal.now, 10),
  ]);

  return (
    <PageShell
      nav={SIGNED_IN_NAV}
      currentPath="/review"
      identity={{ name: journal.name, image: journal.image }}
      chainHead={journal.head.seq > 0 ? journal.head : null}
      title="Ready for review"
      lead="Decisions whose review date has arrived. Read what you thought before you knew, then record what happened."
    >
      <div className={styles.sections}>
        <section className={styles.section} aria-labelledby="due-heading">
          <h2 id="due-heading" className="visually-hidden">
            Due now
          </h2>
          <DecisionList
            decisions={due}
            now={journal.now}
            timeZone={journal.timeZone}
            emptyMessage="Nothing is due. Everything you have recorded is either answered or still ahead of its review date."
          />
        </section>

        {upcoming.length > 0 && (
          <section className={styles.section} aria-labelledby="upcoming-heading">
            <div>
              <h2 id="upcoming-heading" className={styles.sectionTitle}>
                Coming up
              </h2>
              <p className={styles.sectionNote}>
                Sealed and waiting. There is nothing to do with these yet.
              </p>
            </div>
            <DecisionList
              decisions={upcoming}
              now={journal.now}
              timeZone={journal.timeZone}
            />
          </section>
        )}

        {due.length === 0 && upcoming.length === 0 && (
          <Link href="/decisions/new" className={controls.primary}>
            Record a decision
          </Link>
        )}
      </div>
    </PageShell>
  );
}
