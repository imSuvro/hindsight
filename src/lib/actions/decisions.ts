"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { dbContext } from "@/lib/db/client";
import {
  DecisionAlreadyResolvedError,
  DecisionNotFoundError,
  appendEvent,
} from "@/lib/db/ledger";
import { localToInstant } from "@/lib/domain/timez";
import { newDecisionId } from "@/lib/ids";
import {
  type FieldErrors,
  fieldErrors,
  formValues,
  lockDecisionSchema,
  rescheduleSchema,
  resolveDecisionSchema,
} from "@/lib/schemas/api";

/**
 * Every write a person can make.
 *
 * These are server actions rather than fetch calls so the forms work with
 * JavaScript switched off, and so Next's own origin check covers them. Each one
 * establishes the session for itself — the proxy's cookie check is a redirect,
 * not an authorisation (ADR-0006).
 *
 * Nothing here updates anything. Each action appends one event to the ledger
 * and lets the projection follow, so there is no way to change a journal that
 * does not also leave a record of the change.
 *
 * Every export from a `"use server"` module becomes a callable endpoint, so
 * this file exports only the three writes and nothing else. Reads happen
 * directly in the server components that need them.
 */

export type ActionState = {
  errors?: FieldErrors;
  /** Set when the write succeeded, so the interface can show the seal. */
  sealed?: { decisionId: string; hash: string; seq: number };
};

const GENERIC_FAILURE =
  "Something went wrong writing that down. Nothing was recorded — please try again.";

export async function lockDecision(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const parsed = lockDecisionSchema.safeParse(formValues(form));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const input = parsed.data;
  const reviewLocal = {
    date: input.reviewDate,
    time: input.reviewTime,
    timeZone: input.timeZone,
  };

  let reviewAt: number;
  try {
    reviewAt = localToInstant(reviewLocal);
  } catch {
    return { errors: { reviewDate: "That is not a date this calendar has." } };
  }

  if (reviewAt <= Date.now()) {
    return {
      errors: {
        reviewDate:
          "Pick a date in the future — a review you can do today is not a forecast.",
      },
    };
  }

  const decisionId = newDecisionId();
  try {
    const { entry } = await appendEvent(dbContext(), {
      userId: session.user.id,
      type: "decision_locked",
      at: Date.now(),
      payload: {
        decisionId,
        title: input.title,
        situation: input.situation,
        expectedOutcome: input.expectedOutcome,
        confidence: input.confidence,
        domain: input.domain,
        tags: input.tags,
        reviewAt,
        reviewLocal,
      },
    });
    revalidatePath("/dashboard");
    revalidatePath("/decisions");
    return { sealed: { decisionId, hash: entry.hash, seq: entry.seq } };
  } catch (error) {
    console.error("lockDecision failed", error);
    return { errors: { form: GENERIC_FAILURE } };
  }
}

export async function resolveDecision(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const parsed = resolveDecisionSchema.safeParse(formValues(form));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const input = parsed.data;
  try {
    await appendEvent(dbContext(), {
      userId: session.user.id,
      type: "decision_resolved",
      at: Date.now(),
      payload: {
        decisionId: input.decisionId,
        outcome: input.outcome,
        notes: input.notes,
      },
    });
  } catch (error) {
    if (error instanceof DecisionNotFoundError) {
      return { errors: { form: "That decision is not in your journal." } };
    }
    if (error instanceof DecisionAlreadyResolvedError) {
      return {
        errors: {
          form: "That decision already has an outcome. Outcomes are recorded once.",
        },
      };
    }
    console.error("resolveDecision failed", error);
    return { errors: { form: GENERIC_FAILURE } };
  }

  revalidatePath("/dashboard");
  revalidatePath("/review");
  revalidatePath("/decisions");
  redirect(`/decisions/${input.decisionId}`);
}

export async function rescheduleReview(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const parsed = rescheduleSchema.safeParse(formValues(form));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const input = parsed.data;
  const reviewLocal = {
    date: input.reviewDate,
    time: input.reviewTime,
    timeZone: input.timeZone,
  };

  let reviewAt: number;
  try {
    reviewAt = localToInstant(reviewLocal);
  } catch {
    return { errors: { reviewDate: "That is not a date this calendar has." } };
  }
  if (reviewAt <= Date.now()) {
    return { errors: { reviewDate: "Pick a date in the future." } };
  }

  try {
    await appendEvent(dbContext(), {
      userId: session.user.id,
      type: "review_rescheduled",
      at: Date.now(),
      payload: { decisionId: input.decisionId, reviewAt, reviewLocal },
    });
  } catch (error) {
    if (error instanceof DecisionNotFoundError) {
      return { errors: { form: "That decision is not in your journal." } };
    }
    if (error instanceof DecisionAlreadyResolvedError) {
      return { errors: { form: "That decision already has an outcome." } };
    }
    console.error("rescheduleReview failed", error);
    return { errors: { form: GENERIC_FAILURE } };
  }

  revalidatePath("/review");
  revalidatePath("/decisions");
  redirect(`/decisions/${input.decisionId}`);
}
