import type { Metadata } from "next";
import Link from "next/link";
import { DecisionList } from "@/components/journal/DecisionList";
import { PageShell, SIGNED_IN_NAV } from "@/components/layout/PageShell";
import { EmptyState, RailPanel, RailRow } from "@/components/ui/Surfaces";
import { listDue, listUpcoming } from "@/lib/db/decisions";
import { journalContext } from "@/lib/journal-context";
import { relativeDays } from "@/lib/format";
import controls from "@/components/ui/controls.module.css";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Review" };

export default async function ReviewPage() {
  const journal = await journalContext();
  const [due, upcoming] = await Promise.all([
    listDue(journal.ctx, journal.userId, journal.now),
    listUpcoming(journal.ctx, journal.userId, journal.now, 10),
  ]);

  const next = upcoming[0];
  const nothingAtAll = due.length === 0 && upcoming.length === 0;

  return (
    <PageShell
      nav={SIGNED_IN_NAV}
      currentPath="/review"
      identity={{ name: journal.name, image: journal.image }}
      chainHead={journal.head.seq > 0 ? journal.head : null}
      title="Ready for review"
      lead="Decisions whose review date has arrived. Read what you thought before you knew, then record what happened."
      rail={
        <>
          <RailPanel
            label="The queue"
            note={
              due.length > 0
                ? "Answer these while the outcome is still fresh."
                : "Nothing needs you today."
            }
          >
            <RailRow label="Due now" value={due.length} />
            <RailRow label="Waiting" value={upcoming.length} />
          </RailPanel>

          {next && (
            <RailPanel label="Next one back">
              <p className={styles.railProse}>
                &ldquo;{next.title}&rdquo; returns{" "}
                {relativeDays(journal.now, next.reviewAt)}.
              </p>
            </RailPanel>
          )}
        </>
      }
    >
      <div className={styles.sections}>
        {/*
          An entirely empty queue gets one empty state, not two stacked on top
          of each other. The list's own "nothing is due" line only earns its
          place when something is genuinely waiting behind it.
        */}
        {!nothingAtAll && (
          <section className={styles.section} aria-labelledby="due-heading">
            <h2 id="due-heading" className="visually-hidden">
              Due now
            </h2>
            <DecisionList
              decisions={due}
              now={journal.now}
              timeZone={journal.timeZone}
              emptyMessage="Nothing is due today. Everything you have recorded is either answered or still ahead of its review date."
            />
          </section>
        )}

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

        {nothingAtAll && (
          <EmptyState
            title="Your review queue lives here"
            action={
              <Link href="/decisions/new" className={controls.primary}>
                Record a decision
              </Link>
            }
          >
            <p>
              Once you seal a decision it waits here until the date you chose, then comes
              back with your original words still on it.
            </p>
          </EmptyState>
        )}
      </div>
    </PageShell>
  );
}
