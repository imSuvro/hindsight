"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { type ActionState, resolveDecision } from "@/lib/actions/decisions";
import styles from "@/components/ui/controls.module.css";

/**
 * Recording what actually happened.
 *
 * The three choices are deliberately blunt. "Could not be settled" exists so
 * that a decision which genuinely went murky can be closed honestly — it is
 * excluded from every score and reported as its own count, because quietly
 * folding the murky ones into the wins would flatter everybody.
 */

const CHOICES = [
  {
    value: "happened",
    label: "It happened",
    hint: "The outcome you predicted is what occurred.",
  },
  {
    value: "did_not_happen",
    label: "It did not happen",
    hint: "The outcome you predicted did not occur.",
  },
  {
    value: "unresolvable",
    label: "It could not be settled",
    hint: "Nothing here can honestly answer yes or no. Left out of every figure rather than guessed at.",
  },
] as const;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.primary} disabled={pending}>
      {pending ? "Recording…" : "Record the outcome"}
    </button>
  );
}

export function ResolveForm({
  decisionId,
  expectedOutcome,
}: {
  decisionId: string;
  expectedOutcome: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(resolveDecision, {});
  const [chosen, setChosen] = useState<string>("");
  const notesId = useId();
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="decisionId" value={decisionId} />

      {errors.form && (
        <p className={styles.formError} role="alert">
          {errors.form}
        </p>
      )}

      <fieldset className={styles.field}>
        <legend className={styles.label}>You expected: {expectedOutcome}</legend>
        <div className={styles.outcomeChoices}>
          {CHOICES.map((choice) => (
            <label key={choice.value} className={styles.outcomeChoice}>
              <input
                type="radio"
                name="outcome"
                value={choice.value}
                className={styles.outcomeRadio}
                checked={chosen === choice.value}
                onChange={() => setChosen(choice.value)}
                required
              />
              <span className={styles.outcomeText}>
                <span className={styles.outcomeLabel}>{choice.label}</span>
                <span className={styles.outcomeHint}>{choice.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {errors.outcome && <p className={styles.error}>{errors.outcome}</p>}
      </fieldset>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={notesId}>
          What happened? <span className={styles.hint}>Optional</span>
        </label>
        <p className={styles.hint}>
          The part worth writing is what you did not see coming.
        </p>
        <textarea
          id={notesId}
          name="notes"
          className={styles.textarea}
          maxLength={2000}
        />
      </div>

      <div className={styles.actions}>
        <SubmitButton />
      </div>
    </form>
  );
}
