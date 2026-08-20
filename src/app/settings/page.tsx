import type { Metadata } from "next";
import { DeleteAccount } from "@/components/forms/DeleteAccount";
import { PreferencesForm } from "@/components/forms/PreferencesForm";
import { VerifyRecord } from "@/components/forms/VerifyRecord";
import { PageShell, SIGNED_IN_NAV } from "@/components/layout/PageShell";
import { countDecisions } from "@/lib/db/decisions";
import { countChain } from "@/lib/db/ledger";
import { journalContext } from "@/lib/journal-context";
import controls from "@/components/ui/controls.module.css";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const journal = await journalContext();
  const [decisions, entries] = await Promise.all([
    countDecisions(journal.ctx, journal.userId),
    countChain(journal.ctx, journal.userId),
  ]);

  return (
    <PageShell
      nav={SIGNED_IN_NAV}
      currentPath="/settings"
      identity={{ name: journal.name, image: journal.image }}
      chainHead={journal.head.seq > 0 ? journal.head : null}
      title="Settings"
    >
      <div className={styles.sections}>
        <section className={styles.section} aria-labelledby="reviews-heading">
          <div className={styles.head}>
            <h2 id="reviews-heading" className={styles.title}>
              Reviews
            </h2>
            <p className={styles.lead}>
              When decisions come back, and whether we tell you.
            </p>
          </div>
          <PreferencesForm timeZone={journal.timeZone} emailOptIn={journal.emailOptIn} />
        </section>

        <section className={styles.section} id="record" aria-labelledby="record-heading">
          <div className={styles.head}>
            <h2 id="record-heading" className={styles.title}>
              Your record
            </h2>
            <p className={styles.lead}>
              Every entry carries the fingerprint of the one before it, so altering
              anything in your past would break everything after it. You do not have to
              take that on trust.
            </p>
          </div>
          <VerifyRecord entries={entries} />
        </section>

        <section className={styles.section} aria-labelledby="export-heading">
          <div className={styles.head}>
            <h2 id="export-heading" className={styles.title}>
              Take it with you
            </h2>
            <p className={styles.lead}>
              The JSON file contains the complete record with every fingerprint, so it can
              be verified without this app running at all — there is a twenty-line script
              in the repository that does exactly that. The CSV is a flat table for
              spreadsheets.
            </p>
          </div>
          <div className={controls.actions}>
            <a className={controls.secondary} href="/api/export?format=json" download>
              Download JSON
            </a>
            <a className={controls.secondary} href="/api/export?format=csv" download>
              Download CSV
            </a>
          </div>
        </section>

        <section className={styles.sectionDanger} aria-labelledby="delete-heading">
          <div className={styles.head}>
            <h2 id="delete-heading" className={styles.title}>
              Delete your account
            </h2>
            <p className={styles.lead}>
              Deleting your own journal is not tampering with it — those are different
              acts, and only one of them is a threat to you. So this is complete,
              immediate and permanent.
            </p>
          </div>
          <DeleteAccount counts={{ decisions, entries }} />
        </section>
      </div>
    </PageShell>
  );
}
