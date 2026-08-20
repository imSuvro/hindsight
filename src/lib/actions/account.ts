"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth/auth";
import { deleteAccount } from "@/lib/auth/account";
import { requireSession } from "@/lib/auth/session";
import { dbContext, getDb } from "@/lib/db/client";
import {
  type FieldErrors,
  deleteAccountSchema,
  fieldErrors,
  formValues,
  preferencesSchema,
} from "@/lib/schemas/api";

export type AccountActionState = { errors?: FieldErrors; saved?: boolean };

/**
 * Time zone and email preferences.
 *
 * The time zone is the one setting that changes what the product does rather
 * than how it looks: it decides which instant "next Tuesday at 9am" resolves
 * to. Decisions already locked keep the instant they were sealed with — that
 * value is inside a hashed payload and does not move (ADR-0002).
 */
export async function savePreferences(
  _previous: AccountActionState,
  form: FormData,
): Promise<AccountActionState> {
  const session = await requireSession();
  const parsed = preferencesSchema.safeParse(formValues(form));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  await getDb()
    .collection("user")
    .updateOne(
      { _id: new ObjectId(session.user.id) },
      {
        $set: {
          timeZone: parsed.data.timeZone,
          emailOptIn: parsed.data.emailOptIn,
          updatedAt: new Date(),
        },
      },
    );

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { saved: true };
}

/** Records that onboarding has been seen, so it is not shown again. */
export async function completeOnboarding(timeZone: string): Promise<void> {
  const session = await requireSession();
  await getDb()
    .collection("user")
    .updateOne(
      { _id: new ObjectId(session.user.id) },
      { $set: { timeZone, onboardedAt: new Date(), updatedAt: new Date() } },
    );
  revalidatePath("/dashboard");
}

/**
 * Delete everything, immediately.
 *
 * Destroying your own record and falsifying one are different acts, and only
 * the second is a threat to you — so this is deliberately complete and
 * deliberately not recoverable. The confirmation phrase exists so it cannot be
 * done by a misplaced click.
 */
export async function deleteMyAccount(
  _previous: AccountActionState,
  form: FormData,
): Promise<AccountActionState> {
  const session = await requireSession();
  const parsed = deleteAccountSchema.safeParse(formValues(form));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  await deleteAccount(dbContext(), session.user.id);

  // The session rows are already gone; this clears the cookie too, so the
  // browser is not left holding a token for an account that no longer exists.
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // The session it wanted to revoke has been deleted already. Nothing to do.
  }

  redirect("/?deleted=1");
}
