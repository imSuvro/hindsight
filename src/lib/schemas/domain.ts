import { z } from "zod";

/**
 * The vocabulary of the product. Everything the user asserts is expressed in
 * these shapes, and every one of them is validated at the boundary before it
 * reaches the ledger — a malformed assertion must never become a permanent
 * record.
 */

/**
 * Calibration is only broken down along these five axes.
 *
 * Fixed rather than user-defined on purpose: a calibration curve computed from
 * three data points is noise dressed as insight, and free-form categories
 * fragment a small journal into slices too thin to score. Users get free-text
 * tags for their own organisation (see `tagsSchema`); tags never feed the maths.
 */
export const DOMAINS = [
  "career",
  "technical",
  "financial",
  "people",
  "personal",
] as const;

export const domainSchema = z.enum(DOMAINS);
export type Domain = z.infer<typeof domainSchema>;

export const DOMAIN_LABELS: Record<Domain, string> = {
  career: "Career",
  technical: "Technical",
  financial: "Financial",
  people: "People",
  personal: "Personal",
};

/**
 * What actually happened.
 *
 * `unresolvable` exists so that a decision whose outcome genuinely cannot be
 * determined can be closed honestly. It is excluded from every score and
 * reported as its own count — silently dropping it would flatter the user.
 */
export const OUTCOMES = ["happened", "did_not_happen", "unresolvable"] as const;
export const outcomeSchema = z.enum(OUTCOMES);
export type Outcome = z.infer<typeof outcomeSchema>;

/**
 * Stated probability that the expected outcome occurs, as a whole percent.
 *
 * Bounded 1–99 rather than 0–100 because absolute certainty is not a forecast,
 * and because a 0 or 100 that turns out wrong produces an unbounded penalty
 * under most scoring rules. Integers only: the canonical form that gets hashed
 * refuses floating point.
 */
export const CONFIDENCE_MIN = 1;
export const CONFIDENCE_MAX = 99;
export const confidenceSchema = z.number().int().min(CONFIDENCE_MIN).max(CONFIDENCE_MAX);

/**
 * Free text, normalised once here at the boundary so that what is stored and
 * what is hashed are byte-identical. Normalising later, inside the hash
 * function, would leave the stored payload and its own digest disagreeing about
 * which bytes they describe.
 */
const text = (max: number) =>
  z
    .string()
    .max(max * 4, `Must be ${max} characters or fewer`)
    .transform((s) => s.normalize("NFC").trim())
    .pipe(z.string().min(1, "Required").max(max, `Must be ${max} characters or fewer`));

const optionalText = (max: number) =>
  z
    .string()
    .max(max * 4)
    .transform((s) => s.normalize("NFC").trim())
    .pipe(z.string().max(max, `Must be ${max} characters or fewer`));

export const TITLE_MAX = 140;
export const SITUATION_MAX = 2000;
export const EXPECTED_OUTCOME_MAX = 500;
export const NOTES_MAX = 2000;
export const TAG_MAX = 32;
export const TAGS_MAX = 6;

export const titleSchema = text(TITLE_MAX);
export const situationSchema = optionalText(SITUATION_MAX);
export const expectedOutcomeSchema = text(EXPECTED_OUTCOME_MAX);
export const notesSchema = optionalText(NOTES_MAX);

export const tagsSchema = z
  .array(
    z
      .string()
      .max(TAG_MAX * 4)
      .transform((s) => s.normalize("NFC").trim().toLowerCase())
      .pipe(z.string().min(1).max(TAG_MAX)),
  )
  .max(TAGS_MAX)
  .transform((tags) => [...new Set(tags)].sort());

/** IANA zone identifier, checked against the runtime's own tz database. */
export const timeZoneSchema = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: "Unrecognised time zone" },
);

export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
export const localTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm");

/**
 * The review moment as the user expressed it. `reviewAt` (the UTC instant) is
 * authoritative; these fields record what they actually chose, in their own
 * zone, so the app can show it back to them unchanged even if tz rules move.
 */
export const reviewLocalSchema = z.object({
  date: localDateSchema,
  time: localTimeSchema,
  timeZone: timeZoneSchema,
});
export type ReviewLocal = z.infer<typeof reviewLocalSchema>;

/** Epoch milliseconds. Integer-only, because the canonical form rejects floats. */
export const instantSchema = z.number().int().finite();

export const decisionIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{16}$/, "Malformed decision id");
export const userIdSchema = z.string().min(1).max(128);

// ---------------------------------------------------------------------------
// Ledger events
// ---------------------------------------------------------------------------

export const LEDGER_EVENT_TYPES = [
  "decision_locked",
  "decision_resolved",
  "review_rescheduled",
] as const;
export const ledgerEventTypeSchema = z.enum(LEDGER_EVENT_TYPES);
export type LedgerEventType = z.infer<typeof ledgerEventTypeSchema>;

export const decisionLockedPayloadSchema = z.object({
  decisionId: decisionIdSchema,
  title: titleSchema,
  situation: situationSchema,
  expectedOutcome: expectedOutcomeSchema,
  confidence: confidenceSchema,
  domain: domainSchema,
  tags: tagsSchema,
  reviewAt: instantSchema,
  reviewLocal: reviewLocalSchema,
});
export type DecisionLockedPayload = z.infer<typeof decisionLockedPayloadSchema>;

export const decisionResolvedPayloadSchema = z.object({
  decisionId: decisionIdSchema,
  outcome: outcomeSchema,
  notes: notesSchema,
});
export type DecisionResolvedPayload = z.infer<typeof decisionResolvedPayloadSchema>;

export const reviewRescheduledPayloadSchema = z.object({
  decisionId: decisionIdSchema,
  reviewAt: instantSchema,
  reviewLocal: reviewLocalSchema,
});
export type ReviewRescheduledPayload = z.infer<typeof reviewRescheduledPayloadSchema>;

/**
 * A single link in a user's chain. `hash` covers everything above it plus the
 * previous link's hash; `_id` is storage metadata and deliberately excluded.
 */
export const ledgerEntrySchema = z.discriminatedUnion("type", [
  z.object({
    userId: userIdSchema,
    seq: z.number().int().positive(),
    type: z.literal("decision_locked"),
    at: instantSchema,
    payload: decisionLockedPayloadSchema,
    prevHash: z.string().regex(/^[0-9a-f]{64}$/),
    hash: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  z.object({
    userId: userIdSchema,
    seq: z.number().int().positive(),
    type: z.literal("decision_resolved"),
    at: instantSchema,
    payload: decisionResolvedPayloadSchema,
    prevHash: z.string().regex(/^[0-9a-f]{64}$/),
    hash: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  z.object({
    userId: userIdSchema,
    seq: z.number().int().positive(),
    type: z.literal("review_rescheduled"),
    at: instantSchema,
    payload: reviewRescheduledPayloadSchema,
    prevHash: z.string().regex(/^[0-9a-f]{64}$/),
    hash: z.string().regex(/^[0-9a-f]{64}$/),
  }),
]);
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

/** A ledger entry before its own hash is computed. */
export type UnsealedLedgerEntry = Omit<LedgerEntry, "hash">;

/** The payload union, keyed by event type. */
export type LedgerPayloadFor<T extends LedgerEventType> = Extract<
  LedgerEntry,
  { type: T }
>["payload"];

// ---------------------------------------------------------------------------
// The materialised decision view
// ---------------------------------------------------------------------------

export type DecisionResolution = {
  outcome: Outcome;
  notes: string;
  resolvedAt: number;
  resolvedSeq: number;
};

export type DecisionView = {
  decisionId: string;
  userId: string;
  title: string;
  situation: string;
  expectedOutcome: string;
  confidence: number;
  domain: Domain;
  tags: string[];
  reviewAt: number;
  reviewLocal: ReviewLocal;
  lockedAt: number;
  lockedSeq: number;
  /** Hash of the locking entry — the fingerprint of the original belief. */
  entryHash: string;
  rescheduleCount: number;
  resolution: DecisionResolution | null;
};

export type DecisionStatus = "pending" | "due" | "resolved";

export function decisionStatus(decision: DecisionView, now: number): DecisionStatus {
  if (decision.resolution) return "resolved";
  return decision.reviewAt <= now ? "due" : "pending";
}
