import { z } from "zod";
import { PRACTICE_CONFIDENCE_MAX, PRACTICE_CONFIDENCE_MIN } from "@/lib/domain/practice";
import {
  confidenceSchema,
  decisionIdSchema,
  domainSchema,
  expectedOutcomeSchema,
  localDateSchema,
  localTimeSchema,
  notesSchema,
  outcomeSchema,
  situationSchema,
  tagsSchema,
  timeZoneSchema,
  titleSchema,
} from "./domain";

/**
 * What the outside world is allowed to send.
 *
 * Forms post strings; these schemas are what turns strings into the domain's
 * vocabulary, and they run before anything reaches the ledger. An assertion
 * that fails here never becomes a permanent record — which matters more than
 * usual in a system that cannot go back and edit one.
 */

/** `FormData` gives strings; tags arrive as one comma-separated field. */
const tagsFromField = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  )
  .pipe(tagsSchema);

const coerceConfidence = z
  .union([z.string(), z.number()])
  .transform((value) => (typeof value === "string" ? Number(value) : value))
  .pipe(confidenceSchema);

export const lockDecisionSchema = z.object({
  title: titleSchema,
  situation: situationSchema,
  expectedOutcome: expectedOutcomeSchema,
  confidence: coerceConfidence,
  domain: domainSchema,
  tags: tagsFromField,
  reviewDate: localDateSchema,
  reviewTime: localTimeSchema,
  timeZone: timeZoneSchema,
});
export type LockDecisionInput = z.infer<typeof lockDecisionSchema>;

export const resolveDecisionSchema = z.object({
  decisionId: decisionIdSchema,
  outcome: outcomeSchema,
  notes: notesSchema,
});
export type ResolveDecisionInput = z.infer<typeof resolveDecisionSchema>;

export const rescheduleSchema = z.object({
  decisionId: decisionIdSchema,
  reviewDate: localDateSchema,
  reviewTime: localTimeSchema,
  timeZone: timeZoneSchema,
});
export type RescheduleInput = z.infer<typeof rescheduleSchema>;

export const preferencesSchema = z.object({
  timeZone: timeZoneSchema,
  emailOptIn: z
    .union([z.string(), z.boolean()])
    .transform((value) => value === true || value === "on" || value === "true"),
});
export type PreferencesInput = z.infer<typeof preferencesSchema>;

export const exportFormatSchema = z.enum(["json", "csv"]).default("json");

/** Deleting a journal is irreversible, so it takes a deliberate confirmation. */
export const deleteAccountSchema = z.object({
  confirmation: z.literal("delete my journal", {
    message: 'Type "delete my journal" exactly to confirm',
  }),
});

/**
 * Turn a `FormData` into a plain object the schemas can read. Repeated fields
 * collapse to the last value, which is what checkboxes and radios need.
 */
export function formValues(form: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

export type FieldErrors = Record<string, string>;

/** Flatten a Zod failure into one message per field, for rendering beside inputs. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    errors[key] ??= issue.message;
  }
  return errors;
}

/**
 * One answered practice question.
 *
 * The client sends only the question id, which option it picked and how sure it
 * was — never which answer was right. The server recomputes that from the id
 * against the bundled dataset, so a forged or edited payload cannot score.
 */
export const practiceAnswerSchema = z.object({
  questionId: z.string().min(1).max(128),
  chosenId: z.string().min(1).max(32),
  confidence: z.coerce
    .number()
    .int()
    .min(PRACTICE_CONFIDENCE_MIN)
    .max(PRACTICE_CONFIDENCE_MAX),
});

export type PracticeAnswerInput = z.infer<typeof practiceAnswerSchema>;
