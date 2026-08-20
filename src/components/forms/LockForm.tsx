"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { type ActionState, lockDecision } from "@/lib/actions/decisions";
import { shortHash } from "@/lib/domain/chain";
import { DEFAULT_REVIEW_TIME, REVIEW_PRESETS, shiftLocalDate } from "@/lib/domain/timez";
import { DOMAINS, DOMAIN_LABELS, type Domain } from "@/lib/schemas/domain";
import styles from "@/components/ui/controls.module.css";
import panel from "./LockForm.module.css";

/**
 * Writing a decision down, and sealing it.
 *
 * The second step is not friction for its own sake. Locking is the only
 * irreversible act in the product, and showing someone exactly what is about to
 * become permanent — in the words they used — is the moment the immutability
 * stops being a claim in the marketing and becomes something they watched
 * happen.
 *
 * Without JavaScript the confirmation step is skipped and the form posts
 * straight through. The record is identical either way.
 */

const READINGS: Array<{ upTo: number; text: string }> = [
  { upTo: 15, text: "You would be surprised if this happened." },
  { upTo: 35, text: "You think this probably will not happen." },
  { upTo: 45, text: "Leaning against, but not by much." },
  { upTo: 55, text: "A coin flip. Recording it is still worth doing." },
  { upTo: 65, text: "Leaning towards, but not by much." },
  { upTo: 80, text: "You think this probably will happen." },
  {
    upTo: 92,
    text: "You are fairly sure. Roughly one in ten of these should still go the other way.",
  },
  {
    upTo: 99,
    text: "You are nearly certain. About one in fifty of these should still surprise you.",
  },
];

function readingFor(confidence: number): string {
  return READINGS.find((reading) => confidence <= reading.upTo)?.text ?? "";
}

function SubmitButton({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.primary} disabled={pending}>
      {pending ? "Sealing…" : children}
    </button>
  );
}

export type LockFormProps = {
  timeZone: string;
  today: string;
};

export function LockForm({ timeZone, today }: LockFormProps) {
  const [state, formAction] = useActionState<ActionState, FormData>(lockDecision, {});
  const [confidence, setConfidence] = useState(70);
  const [title, setTitle] = useState("");
  const [situation, setSituation] = useState("");
  const [expected, setExpected] = useState("");
  const [domain, setDomain] = useState<Domain>("career");
  const [reviewDate, setReviewDate] = useState(() =>
    shiftLocalDate(today, { months: 3 }),
  );
  const [reviewTime, setReviewTime] = useState(DEFAULT_REVIEW_TIME);
  const [tags, setTags] = useState("");
  const [confirming, setConfirming] = useState(false);

  const ids = {
    title: useId(),
    situation: useId(),
    expected: useId(),
    confidence: useId(),
    domain: useId(),
    date: useId(),
    time: useId(),
    tags: useId(),
  };

  const errors = state.errors ?? {};
  const ready = title.trim().length > 0 && expected.trim().length > 0;

  if (state.sealed) {
    return (
      <div className={panel.sealed}>
        <p className={panel.sealedTag}>Locked</p>
        <h2 className={panel.sealedTitle}>{title || "Your decision"}</h2>
        <p className={panel.sealedBody}>
          This is entry {state.sealed.seq} in your record. Its fingerprint is{" "}
          <span className={panel.sealedHash}>{shortHash(state.sealed.hash)}</span>.
          Nothing can change what you just wrote — not you, and not us. It comes back on{" "}
          {reviewDate}.
        </p>
        <div className={styles.actions}>
          <Link
            href={`/decisions/${state.sealed.decisionId}`}
            className={styles.secondary}
          >
            See it
          </Link>
          <Link href="/decisions/new" className={styles.secondary}>
            Write another
          </Link>
          <Link href="/dashboard" className={styles.primary}>
            Back to the dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className={styles.form}>
      {errors.form && (
        <p className={styles.formError} role="alert">
          {errors.form}
        </p>
      )}

      <div className={styles.field} hidden={confirming}>
        <label className={styles.label} htmlFor={ids.title}>
          What are you deciding?
        </label>
        <input
          id={ids.title}
          name="title"
          className={styles.input}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={140}
          required
          aria-describedby={errors.title ? `${ids.title}-error` : undefined}
        />
        {errors.title && (
          <p id={`${ids.title}-error`} className={styles.error}>
            {errors.title}
          </p>
        )}
      </div>

      <div className={styles.field} hidden={confirming}>
        <label className={styles.label} htmlFor={ids.situation}>
          What is the situation? <span className={styles.hint}>Optional</span>
        </label>
        <p className={styles.hint}>
          What you know now, and what you are unsure about. Your future self will not
          remember this part, and it is usually the most interesting thing to reread.
        </p>
        <textarea
          id={ids.situation}
          name="situation"
          className={styles.textarea}
          value={situation}
          onChange={(event) => setSituation(event.target.value)}
          maxLength={2000}
        />
      </div>

      <div className={styles.field} hidden={confirming}>
        <label className={styles.label} htmlFor={ids.expected}>
          What do you expect to happen?
        </label>
        <p className={styles.hint}>
          Write it so that a year from now you could answer yes or no without arguing with
          yourself.
        </p>
        <input
          id={ids.expected}
          name="expectedOutcome"
          className={styles.input}
          value={expected}
          onChange={(event) => setExpected(event.target.value)}
          maxLength={500}
          required
          aria-describedby={errors.expectedOutcome ? `${ids.expected}-error` : undefined}
        />
        {errors.expectedOutcome && (
          <p id={`${ids.expected}-error`} className={styles.error}>
            {errors.expectedOutcome}
          </p>
        )}
      </div>

      <div className={styles.confidenceField} hidden={confirming}>
        <div className={styles.confidenceHead}>
          <label className={styles.label} htmlFor={ids.confidence}>
            How likely is that?
          </label>
          <output className={styles.confidenceValue} htmlFor={ids.confidence}>
            {confidence}%
          </output>
        </div>
        <input
          id={ids.confidence}
          name="confidence"
          type="range"
          className={styles.slider}
          min={1}
          max={99}
          step={1}
          value={confidence}
          onChange={(event) => setConfidence(Number(event.target.value))}
        />
        <div className={styles.anchors} aria-hidden="true">
          <span>1% Almost certainly not</span>
          <span>50%</span>
          <span>Almost certainly 99%</span>
        </div>
        <p className={styles.reading} aria-live="polite">
          {readingFor(confidence)}
        </p>
      </div>

      <div className={styles.row} hidden={confirming}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={ids.date}>
            When should this come back?
          </label>
          <input
            id={ids.date}
            name="reviewDate"
            type="date"
            className={styles.input}
            value={reviewDate}
            min={shiftLocalDate(today, { days: 1 })}
            onChange={(event) => setReviewDate(event.target.value)}
            required
            aria-describedby={errors.reviewDate ? `${ids.date}-error` : undefined}
          />
          {errors.reviewDate && (
            <p id={`${ids.date}-error`} className={styles.error}>
              {errors.reviewDate}
            </p>
          )}
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={ids.time}>
            At
          </label>
          <input
            id={ids.time}
            name="reviewTime"
            type="time"
            className={styles.input}
            value={reviewTime}
            onChange={(event) => setReviewTime(event.target.value)}
            required
          />
        </div>
      </div>

      <div className={panel.presets} hidden={confirming}>
        {REVIEW_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={panel.preset}
            onClick={() => setReviewDate(shiftLocalDate(today, preset.shift))}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className={styles.row} hidden={confirming}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={ids.domain}>
            Which part of your life?
          </label>
          <select
            id={ids.domain}
            name="domain"
            className={styles.select}
            value={domain}
            onChange={(event) => setDomain(event.target.value as Domain)}
          >
            {DOMAINS.map((option) => (
              <option key={option} value={option}>
                {DOMAIN_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={ids.tags}>
            Tags <span className={styles.hint}>Optional</span>
          </label>
          <input
            id={ids.tags}
            name="tags"
            className={styles.input}
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="hiring, q3"
          />
        </div>
      </div>

      <input type="hidden" name="timeZone" value={timeZone} />

      {confirming ? (
        <>
          <div className={styles.confirm}>
            <h2 className={styles.confirmTitle}>This is what gets sealed</h2>
            <ul className={styles.confirmList}>
              <li className={styles.confirmRow}>
                <span className={styles.confirmLabel}>Decision</span>
                <span className={styles.confirmValue}>{title}</span>
              </li>
              <li className={styles.confirmRow}>
                <span className={styles.confirmLabel}>You expect</span>
                <span className={styles.confirmValue}>{expected}</span>
              </li>
              <li className={styles.confirmRow}>
                <span className={styles.confirmLabel}>Confidence</span>
                <span className={styles.confirmValue}>{confidence}%</span>
              </li>
              <li className={styles.confirmRow}>
                <span className={styles.confirmLabel}>Comes back</span>
                <span className={styles.confirmValue}>
                  {reviewDate} at {reviewTime} ({timeZone})
                </span>
              </li>
              <li className={styles.confirmRow}>
                <span className={styles.confirmLabel}>Domain</span>
                <span className={styles.confirmValue}>{DOMAIN_LABELS[domain]}</span>
              </li>
            </ul>
            <p className={styles.confirmNote}>
              Once this is locked the wording and the number are permanent. You can move
              the review date later, and that move is recorded too — but what you believed
              today stays exactly as you have written it.
            </p>
          </div>
          <div className={styles.actions}>
            <SubmitButton>Lock it</SubmitButton>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setConfirming(false)}
            >
              Go back and edit
            </button>
          </div>
        </>
      ) : (
        <div className={styles.actions}>
          {/*
            Without JavaScript this is a plain submit and the record is the
            same; with it, the confirmation step runs first.
          */}
          <button
            type="submit"
            className={styles.primary}
            disabled={!ready}
            onClick={(event) => {
              event.preventDefault();
              setConfirming(true);
            }}
          >
            Review before locking
          </button>
          <Link href="/dashboard" className={styles.quiet}>
            Cancel
          </Link>
        </div>
      )}
    </form>
  );
}
