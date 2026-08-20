"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { type AccountActionState, savePreferences } from "@/lib/actions/account";
import styles from "@/components/ui/controls.module.css";
import { useBrowserTimeZone } from "./use-browser-time-zone";

/** A short, curated list plus whatever the browser reports, so the common case
 * is one click and the uncommon case is still possible. */
const COMMON_ZONES = [
  "UTC",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Athens",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Kathmandu",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.primary} disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

export function PreferencesForm({
  timeZone,
  emailOptIn,
}: {
  timeZone: string;
  emailOptIn: boolean;
}) {
  const [state, formAction] = useActionState<AccountActionState, FormData>(
    savePreferences,
    {},
  );
  const [zone, setZone] = useState(timeZone);
  const detected = useBrowserTimeZone();
  const zoneId = useId();
  const emailId = useId();

  const options = [...new Set([zone, detected, ...COMMON_ZONES].filter(Boolean))];

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={zoneId}>
          Your time zone
        </label>
        <p className={styles.hint}>
          Decides when a review actually arrives. Decisions already locked keep the exact
          moment they were sealed with — that value is part of the sealed record and does
          not move.
        </p>
        <select
          id={zoneId}
          name="timeZone"
          className={styles.select}
          value={zone}
          onChange={(event) => setZone(event.target.value)}
        >
          {options.map((option) => (
            <option key={option} value={option as string}>
              {option}
              {option === detected ? " (your browser)" : ""}
            </option>
          ))}
        </select>
        {state.errors?.timeZone && (
          <p className={styles.error}>{state.errors.timeZone}</p>
        )}
      </div>

      <div className={styles.field}>
        <label className={styles.outcomeChoice} htmlFor={emailId}>
          <input
            id={emailId}
            type="checkbox"
            name="emailOptIn"
            defaultChecked={emailOptIn}
            className={styles.outcomeRadio}
          />
          <span className={styles.outcomeText}>
            <span className={styles.outcomeLabel}>Email me when a decision is due</span>
            <span className={styles.outcomeHint}>
              One message per decision, on the date you chose. Nothing else is ever sent —
              no digests, no marketing. The message carries your record&rsquo;s
              fingerprint, which is worth keeping.
            </span>
          </span>
        </label>
      </div>

      <div className={styles.actions}>
        <SaveButton />
        {state.saved && (
          <span className={styles.hint} role="status">
            Saved.
          </span>
        )}
      </div>
    </form>
  );
}
