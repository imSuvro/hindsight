import { requireSession } from "@/lib/auth/session";
import { dbContext } from "@/lib/db/client";
import { readChainHead } from "@/lib/db/ledger";
import type { ChainHead } from "@/lib/domain/chain";
import type { DbContext } from "@/lib/db/ledger";
import { FALLBACK_TIME_ZONE } from "@/lib/domain/timez";

export { FALLBACK_TIME_ZONE };

/**
 * Who is asking, what calendar they live in, and what their record currently
 * fingerprints to. Assembled once per page rather than rebuilt in each
 * component.
 */

export type JournalContext = {
  ctx: DbContext;
  userId: string;
  name: string;
  image: string | null;
  timeZone: string;
  emailOptIn: boolean;
  onboarded: boolean;
  head: ChainHead;
  now: number;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function journalContext(): Promise<JournalContext> {
  const session = await requireSession();
  const ctx = dbContext();
  const user = session.user as typeof session.user & {
    timeZone?: string | null;
    emailOptIn?: boolean | null;
    onboardedAt?: Date | string | null;
  };

  const head = await readChainHead(ctx, session.user.id);

  return {
    ctx,
    userId: session.user.id,
    name: session.user.name || session.user.email || "you",
    image: readString(session.user.image),
    timeZone: readString(user.timeZone) ?? FALLBACK_TIME_ZONE,
    emailOptIn: user.emailOptIn !== false,
    onboarded: Boolean(user.onboardedAt),
    head,
    now: Date.now(),
  };
}

/** Today, as the user's own calendar has it — the floor for review dates. */
export function todayIn(timeZone: string, now: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** First name if we have one, so the greeting reads like a person wrote it. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/**
 * Greet by the clock the user is actually looking at, not the server's. Getting
 * this wrong is small, but it is the kind of small that reads as carelessness.
 */
export function greeting(timeZone: string, now: number): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date(now)),
  );
  if (hour < 5) return "Still up";
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}
