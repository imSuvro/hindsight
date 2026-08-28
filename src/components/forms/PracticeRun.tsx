"use client";

import { useRouter } from "next/navigation";
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
 * Split into two components on purpose. `useActionState` keeps its result until
 * the component unmounts, and a single component reading that result to decide
 * whether the current question had been answered stayed stuck on the first
 * one — every later question rendered already locked, with the previous
 * verdict still on screen, and exactly one answer per page load reached the
 * database. Keying the card by question id makes React remount it, which is
 * what actually resets the action state.
 */

const EMPTY: PracticeResult = { ok: false };

export function PracticeRun({
  questions,
  prompts,
}: {
  questions: readonly PracticeQuestion[];
  prompts: Readonly<Record<string, string>>;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  /**
   * Counted from what the server said it stored, never from what the client
   * submitted. A repeat is refused at the database and a rejected answer is
   * never written, so counting submissions would report a tally the reading
   * underneath then contradicts.
   */
  const [tally, setTally] = useState({ recorded: 0, correct: 0 });

  const question = questions[index];

  if (!question) {
    return (
      <div className={styles.done}>
        <p className={styles.doneTitle}>That is the set.</p>
        <p className={styles.doneBody}>
          {tally.correct} of {tally.recorded} right. Your reading is below, and it moves
          every time you come back.
        </p>
        <button
          type="button"
          className={controls.primary}
          onClick={() => {
            // `<Link href="/practice">` did nothing here: it is the route we are
            // already on, so nothing remounted and the finished screen stayed
            // up looking broken. Refetching the server component is what
            // actually produces a new set.
            setIndex(0);
            setTally({ recorded: 0, correct: 0 });
            router.refresh();
          }}
        >
          Another set
        </button>
      </div>
    );
  }

  return (
    <div className={styles.run}>
      <div className={styles.progress}>
        <span className={styles.progressCount}>
          {index + 1}/{questions.length}
        </span>
        <span className={styles.progressLabel}>
          {tally.recorded > 0
            ? `${tally.correct} of ${tally.recorded} right so far`
            : "Nothing scored yet"}
        </span>
      </div>

      <PracticeCard
        key={question.id}
        question={question}
        prompt={prompts[question.kind] ?? "Which is larger?"}
        isLast={index + 1 === questions.length}
        onRecorded={(correct) =>
          setTally((current) => ({
            recorded: current.recorded + 1,
            correct: current.correct + (correct ? 1 : 0),
          }))
        }
        onNext={() => setIndex((current) => current + 1)}
      />
    </div>
  );
}

/**
 * One question. Remounted per question by its key, which is what resets both
 * the action state and the controls.
 */
function PracticeCard({
  question,
  prompt,
  isLast,
  onRecorded,
  onNext,
}: {
  question: PracticeQuestion;
  prompt: string;
  isLast: boolean;
  onRecorded: (correct: boolean) => void;
  onNext: () => void;
}) {
  const [confidence, setConfidence] = useState(50);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [counted, setCounted] = useState(false);
  const [result, submit, pending] = useActionState(answerPracticeQuestion, EMPTY);

  const answered = result.ok && result.answerId !== undefined;

  // The tally moves only on a stored answer, and only once even if React
  // re-renders. `recorded` is false when the account had already answered this
  // pair, which the database refuses rather than scoring twice.
  if (answered && !counted) {
    setCounted(true);
    if (result.recorded) onRecorded(result.correct === true);
  }

  return (
    <form action={submit}>
      <input type="hidden" name="questionId" value={question.id} />
      <input type="hidden" name="chosenId" value={chosenId ?? ""} />
      <input type="hidden" name="confidence" value={confidence} />

      <fieldset className={styles.fieldset} disabled={answered || pending}>
        <legend className={styles.prompt}>{prompt}</legend>

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

      {answered && (
        <div className={styles.verdict} role="status">
          <p className={result.correct ? styles.verdictRight : styles.verdictWrong}>
            {result.correct
              ? `Right, and you said ${confidence}%.`
              : `Wrong, and you said ${confidence}%.`}
          </p>
          {result.recorded === false && (
            <p className={styles.doneBody}>
              You have answered this pair before, so it does not score again.
            </p>
          )}
          <button type="button" className={controls.primary} onClick={onNext}>
            {isLast ? "See the reading" : "Next question"}
          </button>
        </div>
      )}
    </form>
  );
}
