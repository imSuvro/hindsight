"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { type ActionState, rescheduleReview } from "@/lib/actions/decisions";
import { REVIEW_PRESETS, shiftLocalDate } from "@/lib/domain/timez";
import styles from "@/components/ui/controls.module.css";
import panel from "./LockForm.module.css";

/**
 * Moving a review date.
 *
 * This is the one thing about a locked decision that can change, and it is
 * recorded as its own ledger event so the change is visible rather than
 * silent. Moving *when you look* is honest; editing *what you believed* is not,
 * and there is no code path for the second.
 */

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.secondary} disabled={pending}>
      {pending ? "Moving…" : "Move the review date"}
    </button>
  );
}

export function RescheduleForm({
  decisionId,
  timeZone,
  today,
  currentDate,
  currentTime,
}: {
  decisionId: string;
  timeZone: string;
  today: string;
  currentDate: string;
  currentTime: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(rescheduleReview, {});
  const [date, setDate] = useState(currentDate);
  const [open, setOpen] = useState(false);
  const dateId = useId();
  const errors = state.errors ?? {};

  if (!open) {
    return (
      <button
        type="button"
        className={styles.quiet}
        onClick={() => setOpen(true)}
        style={{ alignSelf: "flex-start", paddingInline: 0 }}
      >
        Not ready yet — move this review
      </button>
    );
  }

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="decisionId" value={decisionId} />
      <input type="hidden" name="timeZone" value={timeZone} />
      <input type="hidden" name="reviewTime" value={currentTime} />

      {errors.form && (
        <p className={styles.formError} role="alert">
          {errors.form}
        </p>
      )}

      <div className={styles.field}>
        <label className={styles.label} htmlFor={dateId}>
          Come back on
        </label>
        <input
          id={dateId}
          name="reviewDate"
          type="date"
          className={styles.input}
          value={date}
          min={shiftLocalDate(today, { days: 1 })}
          onChange={(event) => setDate(event.target.value)}
          required
        />
        {errors.reviewDate && <p className={styles.error}>{errors.reviewDate}</p>}
      </div>

      <div className={panel.presets} style={{ marginTop: 0 }}>
        {REVIEW_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={panel.preset}
            onClick={() => setDate(shiftLocalDate(today, preset.shift))}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <p className={styles.hint}>
        Moving the date is recorded in your journal as its own entry. What you predicted
        stays exactly as it is.
      </p>

      <div className={styles.actions}>
        <SubmitButton />
        <button type="button" className={styles.quiet} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
