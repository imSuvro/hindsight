"use client";

import Link from "next/link";
import { useTransition } from "react";
import { completeOnboarding } from "@/lib/actions/account";
import { useBrowserTimeZone } from "./use-browser-time-zone";
import styles from "./Onboarding.module.css";

/**
 * The first thirty seconds.
 *
 * Two jobs: explain the loop in three lines to somebody who has never kept a
 * decision journal, and confirm the time zone — which is the one setting that
 * changes what the product does, because it decides when a review actually
 * lands.
 *
 * The zone is read from the browser and shown for confirmation rather than
 * saved silently. A reminder arriving on the wrong day is exactly the kind of
 * small betrayal that makes people stop trusting a tool.
 *
 * The panel stays until it is dismissed, which means it can outlive the first
 * decision. It therefore has to know whether any exist: the audit found it
 * reading "Write my first decision" directly beneath a heading that said "3
 * decisions recorded", which is the fastest way to look unfinished.
 */
export function Onboarding({
  storedTimeZone,
  hasDecisions = false,
}: {
  storedTimeZone: string;
  hasDecisions?: boolean;
}) {
  const detected = useBrowserTimeZone();
  const [pending, startTransition] = useTransition();

  const zone = detected ?? storedTimeZone;
  const mismatch = detected !== null && detected !== storedTimeZone;

  return (
    <section className={styles.panel} aria-labelledby="onboarding-heading">
      <p className={styles.tag}>{hasDecisions ? "The loop" : "Start here"}</p>
      <h2 id="onboarding-heading" className={styles.title}>
        {hasDecisions ? "How the rest of it works" : "Three steps, then arithmetic"}
      </h2>

      <ol className={styles.steps}>
        <li>
          <strong>Write down a decision you are about to make</strong>, what you expect to
          happen, and how likely you think that is.
        </li>
        <li>
          <strong>It gets sealed.</strong> Nothing can edit the wording or the number
          afterwards — not you, not us.
        </li>
        <li>
          <strong>It comes back on the date you chose</strong> and asks what actually
          happened. After ten of those, the scoring starts.
        </li>
      </ol>

      <div className={styles.zone}>
        <p className={styles.zoneLabel}>Reviews will arrive on your clock</p>
        <p className={styles.zoneValue}>{zone}</p>
        {mismatch && (
          <p className={styles.zoneNote}>
            Your browser is set to {detected}. Confirm to use that instead — you can
            change it any time in Settings.
          </p>
        )}
      </div>

      <div className={styles.actions}>
        <Link
          href="/decisions/new"
          className={styles.primary}
          onClick={() => {
            startTransition(async () => {
              await completeOnboarding(zone);
            });
          }}
        >
          {hasDecisions ? "Record another" : "Record a decision"}
        </Link>
        <button
          type="button"
          className={styles.secondary}
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              await completeOnboarding(zone);
            });
          }}
        >
          {pending ? "Saving…" : hasDecisions ? "Hide this" : "Got it — hide this"}
        </button>
        {!hasDecisions && (
          <Link href="/demo" className={styles.quiet}>
            See a finished journal first
          </Link>
        )}
      </div>
    </section>
  );
}
