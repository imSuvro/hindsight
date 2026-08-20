import type { Metadata } from "next";
import { LockForm } from "@/components/forms/LockForm";
import { PageShell, SIGNED_IN_NAV } from "@/components/layout/PageShell";
import { journalContext, todayIn } from "@/lib/journal-context";

export const metadata: Metadata = { title: "Record a decision" };

export default async function NewDecisionPage() {
  const journal = await journalContext();

  return (
    <PageShell
      nav={SIGNED_IN_NAV}
      currentPath="/decisions"
      identity={{ name: journal.name, image: journal.image }}
      chainHead={journal.head.seq > 0 ? journal.head : null}
      title="Record a decision"
      lead="Write it while you still do not know how it turns out. That is the only moment this is worth doing."
    >
      <LockForm
        timeZone={journal.timeZone}
        today={todayIn(journal.timeZone, journal.now)}
      />
    </PageShell>
  );
}
