"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { type PracticeResult, answerPracticeQuestion } from "@/lib/actions/practice";
import type { PracticeQuestion } from "@/lib/domain/practice";
import controls from "@/components/ui/controls.module.css";
import styles from "./PracticeRun.module.css";

/**
 * One run through a session.
 *
 * The answer is never in this component's props — `PracticeQuestion` has no
 * field for it — so it cannot be read out of the page. Each answer is posted,
 * scored on the server, and the result comes back with both figures attached so
 * the reader can see what the answer rested on.
 *
 * The confidence control starts at 50 rather than in the middle of the range.
 * Starting at 75 would put a number in the reader's mouth, and the whole
 * exercise is finding out what number they would have chosen.
 */

const EMPTY: PracticeResult = { ok: false };

export function PracticeRun({
  questions,
  prompts,
}: {
  questions: readonly PracticeQuestion[];
  prompts: Readonly<Record<string, string>>;
}) {
  const [index, setIndex] = useState(0);
  const [confidence, setConfidence] = useState(50);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [tally, setTally] = useState({ answered: 0, correct: 0 });
  const [result, submit, pending] = useActionState(answerPracticeQuestion, EMPTY);

  const question = questions[index];
  const answered = result.ok && result.answerId !== undefined;

  if (!question) {
    return (
      <div className={styles.done}>
        <p className={styles.doneTitle}>That is the set.</p>
        <p className={styles.doneBody}>
          {tally.correct} of {tally.answered} right. Your reading is below, and it moves
          every time you come back.
        </p>
        <Link href="/practice" className={controls.primary}>
          Another set
        </Link>
      </div>
    );
  }

  const next = () => {
    setIndex((current) => current + 1);
    setConfidence(50);
    setChosenId(null);
  };

  return (
    <div className={styles.run}>
      <div className={styles.progress}>
        <span className={styles.progressCount}>
          {index + 1}/{questions.length}
        </span>
        <span className={styles.progressLabel}>
          {tally.answered > 0 ? `${tally.correct} right so far` : "Nothing scored yet"}
        </span>
      </div>

      <form
        action={(formData) => {
          // The tally is the client's own running count for encouragement; the
          // record that gets scored is the one the server writes.
          submit(formData);
        }}
        onSubmit={() => {
          setTally((current) => ({ ...current, answered: current.answered + 1 }));
        }}
      >
        <input type="hidden" name="questionId" value={question.id} />
        <input type="hidden" name="chosenId" value={chosenId ?? ""} />
        <input type="hidden" name="confidence" value={confidence} />

        <fieldset className={styles.fieldset} disabled={answered || pending}>
          <legend className={styles.prompt}>
            {prompts[question.kind] ?? "Which is larger?"}
          </legend>

          <div className={styles.options}>
            {question.options.map((option) => {
              const isChosen = chosenId === option.id;
              const isAnswer = answered && result.answerId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={[
                    styles.option,
                    isChosen ? styles.optionChosen : "",
                    isAnswer ? styles.optionAnswer : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-pressed={isChosen}
                  onClick={() => setChosenId(option.id)}
                >
                  <span className={styles.optionLabel}>{option.label}</span>
                  {answered && (
                    <span className={styles.optionDetail}>
                      {result.detail?.[option.id]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className={styles.confidence}>
            <label className={styles.confidenceLabel} htmlFor="practice-confidence">
              How sure are you?
            </label>
            <div className={styles.confidenceRow}>
              <input
                id="practice-confidence"
                type="range"
                min={50}
                max={99}
                step={1}
                value={confidence}
                className={styles.slider}
                onChange={(event) => setConfidence(Number(event.target.value))}
              />
              <output className={styles.confidenceValue}>{confidence}%</output>
            </div>
            <p className={styles.confidenceHint}>
              {confidence === 50
                ? "A coin flip. Nothing to lose by saying so."
                : confidence < 65
                  ? "A lean, not a conviction."
                  : confidence < 85
                    ? "You think you know this one."
                    : "Close to certain. Worth being right about."}
            </p>
          </div>
        </fieldset>

        {!answered && (
          <button
            type="submit"
            className={controls.primary}
            disabled={!chosenId || pending}
            aria-describedby={chosenId ? undefined : "practice-blocked"}
          >
            {pending ? "Scoring…" : "Lock it in"}
          </button>
        )}
        {!chosenId && !answered && (
          <p id="practice-blocked" className={styles.blocked} role="status">
            Pick one of the two, and this unlocks.
          </p>
        )}
        {result.error && (
          <p className={styles.error} role="alert">
            {result.error}
          </p>
        )}
      </form>

      {answered && (
        <div className={styles.verdict} role="status">
          <p className={result.correct ? styles.verdictRight : styles.verdictWrong}>
            {result.correct
              ? `Right, and you said ${confidence}%.`
              : `Wrong, and you said ${confidence}%.`}
          </p>
          <button
            type="button"
            className={controls.primary}
            onClick={() => {
              if (result.correct) {
                setTally((current) => ({ ...current, correct: current.correct + 1 }));
              }
              next();
            }}
          >
            {index + 1 === questions.length ? "See the reading" : "Next question"}
          </button>
        </div>
      )}
    </div>
  );
}
