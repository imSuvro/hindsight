"use server";

import { requireSession } from "@/lib/auth/session";
import { dbContext } from "@/lib/db/client";
import { recordPracticeAnswer } from "@/lib/db/practice";
import { resolveQuestion } from "@/lib/domain/practice";
import { PRACTICE_POOLS } from "@/lib/practice-pools";
import { practiceAnswerSchema } from "@/lib/schemas/api";

/**
 * Answering one practice question.
 *
 * The client posts a question id, which option it picked, and how sure it was.
 * It never posts, and is never told in advance, which answer was right — the
 * server recomputes that from the id against the bundled dataset. A trainer
 * whose answers can be read out of the page, or asserted by the client, is not
 * measuring anything.
 *
 * A forged, edited or stale id resolves to nothing and is refused rather than
 * scored. So is a pair inside the correctness floor, which has no defensible
 * answer even if it were somehow asked.
 *
 * Every export from a `"use server"` module is a callable endpoint, so this
 * file exports one action and nothing else.
 */

export type PracticeResult = {
  readonly ok: boolean;
  readonly correct?: boolean;
  /**
   * Whether this answer was actually stored. False when the account had
   * already answered this pair, which the database refuses.
   *
   * The client counts its running tally from this rather than from what it
   * submitted, so the figure on screen cannot drift from the reading below it.
   */
  readonly recorded?: boolean;
  readonly answerId?: string;
  /** Both figures, so the reader can see what the answer rested on. */
  readonly detail?: Readonly<Record<string, string>>;
  readonly error?: string;
};

export async function answerPracticeQuestion(
  _previous: PracticeResult,
  formData: FormData,
): Promise<PracticeResult> {
  const session = await requireSession();

  const parsed = practiceAnswerSchema.safeParse({
    questionId: formData.get("questionId"),
    chosenId: formData.get("chosenId"),
    confidence: formData.get("confidence"),
  });
  if (!parsed.success) {
    return { ok: false, error: "That answer was not in a form we could read." };
  }

  const question = resolveQuestion(PRACTICE_POOLS, parsed.data.questionId);
  if (!question) {
    return { ok: false, error: "That question is no longer one we can score." };
  }

  const chosen = question.options.find((option) => option.id === parsed.data.chosenId);
  if (!chosen) {
    return { ok: false, error: "That answer does not belong to that question." };
  }

  const correct = chosen.id === question.answerId;

  // A repeat returns false rather than throwing. The reader still sees the
  // outcome — refusing to say whether they were right would be worse than
  // declining to score it twice — but the caller is told, so its tally counts
  // what was stored rather than what was sent.
  const recorded = await recordPracticeAnswer(dbContext(), {
    userId: session.user.id,
    questionId: question.id,
    kind: question.kind,
    confidence: parsed.data.confidence,
    correct,
    at: new Date(),
  });

  /*
   * Deliberately no `revalidatePath` here.
   *
   * Revalidating re-runs the page, which rebuilds the session — and the seed
   * includes how many answers the account has given, so answering question one
   * silently replaced every remaining question and stranded the reader on a
   * verdict about a pair no longer on screen. The reading below the run is
   * meant to be read after the set, and it refreshes on the next navigation.
   */
  return {
    ok: true,
    correct,
    recorded,
    answerId: question.answerId,
    detail: Object.fromEntries(
      question.options.map((option) => [option.id, option.detail ?? ""]),
    ),
  };
}
