import { type PracticeAnswerDoc, collections, practiceAnswerId } from "./collections";
import type { DbContext } from "./ledger";
import type { PracticeAnswer } from "@/lib/domain/practice";

/**
 * Practice answers.
 *
 * Deliberately the simplest repository in the codebase, and deliberately not
 * the ledger. Nothing here is hash-chained, transactional or append-only,
 * because none of that is warranted: a guess about which country is larger is
 * training, not testimony. The record that has to be unfalsifiable is the one
 * about the reader's own life, and mixing this into it would dilute what that
 * record means.
 *
 * The one guarantee it does make is that a question can be answered once per
 * account. A second attempt at a pair you have already seen measures memory
 * rather than calibration, so the composite `_id` refuses it outright.
 */

/** MongoDB's duplicate-key error. */
const DUPLICATE_KEY_CODE = 11000;

export type RecordAnswerInput = {
  readonly userId: string;
  readonly questionId: string;
  readonly kind: string;
  readonly confidence: number;
  readonly correct: boolean;
  readonly at: Date;
};

/**
 * Store one answer. Returns false when this account has already answered this
 * question, which is not an error — it is the guarantee working.
 */
export async function recordPracticeAnswer(
  ctx: DbContext,
  input: RecordAnswerInput,
): Promise<boolean> {
  const { practiceAnswers } = collections(ctx.db);
  try {
    await practiceAnswers.insertOne({
      _id: practiceAnswerId(input.userId, input.questionId),
      userId: input.userId,
      questionId: input.questionId,
      kind: input.kind,
      confidence: input.confidence,
      correct: input.correct,
      answeredAt: input.at,
    });
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: number }).code === DUPLICATE_KEY_CODE
    ) {
      return false;
    }
    throw error;
  }
}

/** Every answer this account has given, newest first. */
export async function listPracticeAnswers(
  ctx: DbContext,
  userId: string,
): Promise<PracticeAnswerDoc[]> {
  const { practiceAnswers } = collections(ctx.db);
  return practiceAnswers.find({ userId }, { sort: { answeredAt: -1 } }).toArray();
}

/** Reduced to what the scoring core takes. */
export function toPracticeAnswers(docs: readonly PracticeAnswerDoc[]): PracticeAnswer[] {
  return docs.map((doc) => ({ confidence: doc.confidence, correct: doc.correct }));
}

/**
 * The question ids this account has already seen, so a new session can avoid
 * them. Projected rather than loaded whole: only the ids matter here.
 */
export async function seenQuestionIds(
  ctx: DbContext,
  userId: string,
): Promise<Set<string>> {
  const { practiceAnswers } = collections(ctx.db);
  const docs = await practiceAnswers
    .find({ userId }, { projection: { questionId: 1 } })
    .toArray();
  return new Set(docs.map((doc) => doc.questionId));
}
