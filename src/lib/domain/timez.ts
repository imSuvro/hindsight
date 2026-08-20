import { TZDate } from "@date-fns/tz";
import type { ReviewLocal } from "@/lib/schemas/domain";

/**
 * Turning "next Tuesday at 9am, where I live" into a fixed point on the
 * timeline, and back again for display.
 *
 * The stored UTC instant is authoritative once a decision is locked. If a
 * country changes its clocks between the moment you lock a decision and the
 * moment it comes back, the instant does not move — it is part of the sealed
 * record, and the local time shown alongside it is what you actually chose.
 * Recomputing the instant later would mean editing a locked entry, which is the
 * one thing this system will not do.
 *
 * The default review time of 09:00 is not arbitrary: real daylight-saving
 * transitions happen in the small hours, so a default in the morning never
 * lands in a gap or a repeated hour.
 */

export const DEFAULT_REVIEW_TIME = "09:00";

/**
 * Used until a browser has told us where the user is. Onboarding asks them to
 * confirm rather than leaving them silently on this, because a reminder that
 * lands on the wrong day is exactly the sort of small failure that stops people
 * trusting a tool.
 */
export const FALLBACK_TIME_ZONE = "UTC";

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function parseLocalDate(date: string): [number, number, number] {
  const [year, month, day] = date.split("-").map(Number);
  return [year, month, day];
}

function parseLocalTime(time: string): [number, number] {
  const [hours, minutes] = time.split(":").map(Number);
  return [hours, minutes];
}

/**
 * Resolve a wall-clock moment in a zone to epoch milliseconds.
 *
 * Two dates a year have no single right answer. On the spring-forward morning
 * the chosen wall time may not exist; on the autumn morning it may exist twice.
 * The behaviour in both cases is pinned by tests in
 * `tests/unit/timez.test.ts` rather than left to whatever the library does this
 * release, so a change upstream shows up as a failing test instead of as
 * reminders arriving an hour late.
 */
export function localToInstant(local: ReviewLocal): number {
  const [year, month, day] = parseLocalDate(local.date);
  const [hours, minutes] = parseLocalTime(local.time);
  const zoned = new TZDate(year, month - 1, day, hours, minutes, 0, 0, local.timeZone);
  const instant = zoned.getTime();
  if (!Number.isFinite(instant)) {
    throw new RangeError(
      `Cannot resolve ${local.date} ${local.time} in ${local.timeZone}`,
    );
  }
  return instant;
}

type LocalParts = { date: string; time: string };

const partsCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    partsCache.set(timeZone, formatter);
  }
  return formatter;
}

/** Render an instant as the wall-clock date and time seen in a zone. */
export function instantToLocal(instant: number, timeZone: string): LocalParts {
  const parts = partsFormatter(timeZone).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

/** Short zone label for display, e.g. "GMT+5:45". */
export function zoneLabel(instant: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(new Date(instant));
  return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone;
}

/**
 * Calendar arithmetic on a plain `YYYY-MM-DD`, with no zone involved. Used to
 * build the review-date presets; the result is fed back through
 * `localToInstant` with the user's zone to get the real instant.
 *
 * Month arithmetic clamps rather than overflowing: one month after 31 January
 * is 28 or 29 February, not 2 or 3 March.
 */
export function shiftLocalDate(
  date: string,
  shift: { days?: number; months?: number; years?: number },
): string {
  const [year, month, day] = parseLocalDate(date);
  const targetMonthIndex = month - 1 + (shift.months ?? 0);
  const targetYear = year + (shift.years ?? 0) + Math.floor(targetMonthIndex / 12);
  const normalisedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const daysInTargetMonth = new Date(
    Date.UTC(targetYear, normalisedMonth + 1, 0),
  ).getUTCDate();
  const clampedDay = Math.min(day, daysInTargetMonth);

  const shifted = new Date(Date.UTC(targetYear, normalisedMonth, clampedDay));
  shifted.setUTCDate(shifted.getUTCDate() + (shift.days ?? 0));

  const yyyy = String(shifted.getUTCFullYear()).padStart(4, "0");
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export type ReviewPreset = {
  id: string;
  label: string;
  shift: { days?: number; months?: number; years?: number };
};

/**
 * Horizons offered when locking a decision. Deliberately no "tomorrow": a
 * prediction you can check tomorrow is rarely a judgement worth recording, and
 * a short horizon lets you remember what you thought, which defeats the point.
 */
export const REVIEW_PRESETS: readonly ReviewPreset[] = [
  { id: "1w", label: "In a week", shift: { days: 7 } },
  { id: "1m", label: "In a month", shift: { months: 1 } },
  { id: "3m", label: "In three months", shift: { months: 3 } },
  { id: "6m", label: "In six months", shift: { months: 6 } },
  { id: "1y", label: "In a year", shift: { years: 1 } },
];
