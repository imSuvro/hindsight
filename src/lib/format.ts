/**
 * Presentation helpers. Everything here formats in an explicit time zone
 * rather than the server's, so what a user reads is the calendar they live in.
 */

export function formatDate(instant: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(instant));
}

export function formatDateTime(instant: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(instant));
}

const DAY = 86_400_000;

/**
 * "in 3 months", "2 weeks ago". Rounded to whatever unit reads naturally,
 * because a review date six months out does not need to be exact to be useful.
 */
export function relativeDays(from: number, to: number): string {
  const days = Math.round((to - from) / DAY);
  const formatter = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
  const magnitude = Math.abs(days);

  if (magnitude === 0) return "today";
  if (magnitude < 14) return formatter.format(days, "day");
  if (magnitude < 60) return formatter.format(Math.round(days / 7), "week");
  if (magnitude < 730) return formatter.format(Math.round(days / 30.44), "month");
  return formatter.format(Math.round(days / 365.25), "year");
}

/** Whole percent, for confidence and observed frequencies. */
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
