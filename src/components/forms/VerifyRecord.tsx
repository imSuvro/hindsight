"use client";

import { useState } from "react";
import styles from "@/components/ui/controls.module.css";
import panel from "./VerifyRecord.module.css";

/**
 * "Check my record" as something a person can actually press.
 *
 * The result is deliberately specific about what was and was not proved.
 * Claiming more than the check establishes would undermine the one thing this
 * feature exists to build.
 */

type Problem = { kind: string; detail: string };

type Result = {
  intact: boolean;
  entries: number;
  decisions: number;
  head: { seq: number; hash: string } | null;
  checkedAt: string;
  problems: Problem[];
};

export function VerifyRecord({ entries }: { entries: number }) {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function check(): Promise<void> {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/ledger/verify", { cache: "no-store" });
      setResult((await response.json()) as Result);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={panel.wrapper}>
      <button
        type="button"
        className={styles.secondary}
        disabled={busy || entries === 0}
        onClick={() => {
          void check();
        }}
      >
        {busy ? "Checking…" : "Check my record"}
      </button>

      {entries === 0 && (
        <p className={panel.note}>
          There is nothing to check yet. Record a decision and this will replay it.
        </p>
      )}

      {failed && (
        <p className={panel.bad} role="alert">
          The check could not be run. That is a problem with the request, not with your
          record — try again.
        </p>
      )}

      {result && (
        <div
          className={result.intact ? panel.good : panel.bad}
          role="status"
          aria-live="polite"
        >
          <p className={panel.verdict}>
            {result.intact
              ? `All ${result.entries} entries verify.`
              : "This record does not verify."}
          </p>
          {result.intact ? (
            <>
              <p className={panel.detail}>
                Every entry was rehashed and matched its stored fingerprint, and each one
                links to the entry before it. Changing any past entry would have broken
                every entry after it.
              </p>
              {result.head && <p className={panel.hash}>Head: {result.head.hash}</p>}
              <p className={panel.caveat}>
                One thing this cannot prove on its own: that nothing was removed from the{" "}
                <em>end</em> of the record, since any prefix of a valid chain is itself
                valid. Compare the fingerprint above against one you already hold — every
                review email and every export carries it.
              </p>
            </>
          ) : (
            <ul className={panel.problems}>
              {result.problems.map((problem) => (
                <li key={problem.detail}>{problem.detail}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
