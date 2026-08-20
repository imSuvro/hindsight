"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { type AccountActionState, deleteMyAccount } from "@/lib/actions/account";
import styles from "@/components/ui/controls.module.css";
import panel from "./DeleteAccount.module.css";

const PHRASE = "delete my journal";

function DeleteButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.destructive} disabled={pending || !enabled}>
      {pending ? "Deleting…" : "Delete everything"}
    </button>
  );
}

/**
 * Destroying your own record is not tampering, and the product treats it that
 * way: complete, immediate, no cooling-off period, no retention. The typed
 * phrase is the only friction, and it is there so this cannot happen by
 * accident rather than to talk anyone out of it.
 */
export function DeleteAccount({
  counts,
}: {
  counts: { decisions: number; entries: number };
}) {
  const [state, formAction] = useActionState<AccountActionState, FormData>(
    deleteMyAccount,
    {},
  );
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState(false);
  const inputId = useId();

  if (!open) {
    return (
      <button type="button" className={styles.destructive} onClick={() => setOpen(true)}>
        Delete my account
      </button>
    );
  }

  return (
    <form action={formAction} className={panel.form}>
      <p className={panel.warning}>
        This removes {counts.decisions}{" "}
        {counts.decisions === 1 ? "decision" : "decisions"}, all {counts.entries} record{" "}
        {counts.entries === 1 ? "entry" : "entries"}, your sign-in and everything linked
        to it. It happens immediately and there is no way back — no backup you can ask us
        for, no grace period.
      </p>

      {state.errors?.confirmation && (
        <p className={styles.error} role="alert">
          {state.errors.confirmation}
        </p>
      )}

      <div className={styles.field}>
        <label className={styles.label} htmlFor={inputId}>
          Type <span className={panel.phrase}>{PHRASE}</span> to confirm
        </label>
        <input
          id={inputId}
          name="confirmation"
          className={styles.input}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className={styles.actions}>
        <DeleteButton enabled={typed === PHRASE} />
        <button
          type="button"
          className={styles.quiet}
          onClick={() => {
            setOpen(false);
            setTyped("");
          }}
        >
          Keep my journal
        </button>
      </div>
    </form>
  );
}
