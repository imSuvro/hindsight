import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_REVIEW_TIME,
  instantToLocal,
  isValidTimeZone,
  localToInstant,
  shiftLocalDate,
  zoneLabel,
} from "@/lib/domain/timez";

const ZONES = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Kathmandu",
  "Australia/Sydney",
  "Australia/Lord_Howe",
  "Pacific/Chatham",
];

describe("localToInstant / instantToLocal", () => {
  it("round-trips any ordinary morning in any zone", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ZONES),
        fc
          .date({
            min: new Date("2020-01-01T00:00:00Z"),
            max: new Date("2040-01-01T00:00:00Z"),
            noInvalidDate: true,
          })
          .map((d) => d.toISOString().slice(0, 10)),
        (timeZone, date) => {
          // 09:00 is the product default precisely because no real transition
          // lands there — transitions happen in the small hours.
          const local = { date, time: DEFAULT_REVIEW_TIME, timeZone };
          expect(instantToLocal(localToInstant(local), timeZone)).toStrictEqual({
            date,
            time: DEFAULT_REVIEW_TIME,
          });
        },
      ),
    );
  });

  it("normalises on the first pass and is stable thereafter", () => {
    // Times inside a spring-forward gap do not exist, so they cannot round-trip
    // unchanged. They must, however, settle immediately rather than drifting.
    fc.assert(
      fc.property(
        fc.constantFrom(...ZONES),
        fc
          .date({
            min: new Date("2020-01-01T00:00:00Z"),
            max: new Date("2040-01-01T00:00:00Z"),
            noInvalidDate: true,
          })
          .map((d) => d.toISOString().slice(0, 10)),
        fc.integer({ min: 0, max: 23 }),
        fc.constantFrom(0, 15, 30, 45),
        (timeZone, date, hour, minute) => {
          const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
          const once = instantToLocal(localToInstant({ date, time, timeZone }), timeZone);
          const twice = instantToLocal(localToInstant({ ...once, timeZone }), timeZone);
          expect(twice).toStrictEqual(once);
        },
      ),
    );
  });

  it("moves forward through a spring-forward gap", () => {
    // 2026-03-08 in New York: 02:00 becomes 03:00, so 02:30 never happens.
    const gap = localToInstant({
      date: "2026-03-08",
      time: "02:30",
      timeZone: "America/New_York",
    });
    const after = localToInstant({
      date: "2026-03-08",
      time: "03:30",
      timeZone: "America/New_York",
    });
    expect(gap).toBe(after);
    expect(new Date(gap).toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });

  it("resolves a repeated hour to its first occurrence", () => {
    // 2026-11-01 in New York: 02:00 falls back to 01:00, so 01:30 happens twice.
    // The earlier instant (still on daylight time) is the one chosen.
    const ambiguous = localToInstant({
      date: "2026-11-01",
      time: "01:30",
      timeZone: "America/New_York",
    });
    expect(new Date(ambiguous).toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });

  it("handles a southern-hemisphere transition", () => {
    const gap = localToInstant({
      date: "2026-10-04",
      time: "02:30",
      timeZone: "Australia/Sydney",
    });
    expect(new Date(gap).toISOString()).toBe("2026-10-03T16:30:00.000Z");
  });

  it("handles offsets that are not whole hours", () => {
    expect(
      new Date(
        localToInstant({ date: "2026-06-15", time: "09:00", timeZone: "Asia/Kathmandu" }),
      ).toISOString(),
    ).toBe("2026-06-15T03:15:00.000Z");

    expect(
      new Date(
        localToInstant({
          date: "2026-06-15",
          time: "09:00",
          timeZone: "Australia/Lord_Howe",
        }),
      ).toISOString(),
    ).toBe("2026-06-14T22:30:00.000Z");
  });

  it("puts the same wall clock at different instants in different zones", () => {
    const kolkata = localToInstant({
      date: "2026-05-01",
      time: "09:00",
      timeZone: "Asia/Kolkata",
    });
    const london = localToInstant({
      date: "2026-05-01",
      time: "09:00",
      timeZone: "Europe/London",
    });
    // India is +05:30, London is on BST (+01:00) in May: four and a half hours.
    expect(london - kolkata).toBe(4.5 * 60 * 60 * 1000);
  });
});

describe("zoneLabel", () => {
  it("names the offset a user would recognise", () => {
    const instant = Date.parse("2026-06-15T00:00:00Z");
    expect(zoneLabel(instant, "Asia/Kathmandu")).toBe("GMT+5:45");
    expect(zoneLabel(instant, "Asia/Kolkata")).toBe("GMT+5:30");
    expect(zoneLabel(instant, "UTC")).toBe("GMT+0");
  });
});

describe("isValidTimeZone", () => {
  it("accepts real zones and refuses invented ones", () => {
    for (const zone of ZONES) expect(isValidTimeZone(zone)).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("America/New York")).toBe(false);
  });
});

describe("shiftLocalDate", () => {
  it("clamps rather than overflowing into the next month", () => {
    expect(shiftLocalDate("2026-01-31", { months: 1 })).toBe("2026-02-28");
    expect(shiftLocalDate("2028-01-31", { months: 1 })).toBe("2028-02-29");
    expect(shiftLocalDate("2026-03-31", { months: 1 })).toBe("2026-04-30");
  });

  it("crosses year boundaries", () => {
    expect(shiftLocalDate("2026-12-15", { months: 1 })).toBe("2027-01-15");
    expect(shiftLocalDate("2026-11-20", { months: 3 })).toBe("2027-02-20");
    expect(shiftLocalDate("2026-02-29", { years: 1 })).toBe("2027-02-28");
  });

  it("adds days across month ends", () => {
    expect(shiftLocalDate("2026-01-28", { days: 7 })).toBe("2026-02-04");
    expect(shiftLocalDate("2026-12-31", { days: 1 })).toBe("2027-01-01");
  });

  it("always produces a well-formed, real calendar date", () => {
    fc.assert(
      fc.property(
        fc
          .date({
            min: new Date("2020-01-01T00:00:00Z"),
            max: new Date("2040-01-01T00:00:00Z"),
            noInvalidDate: true,
          })
          .map((d) => d.toISOString().slice(0, 10)),
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 0, max: 36 }),
        (date, days, months) => {
          const shifted = shiftLocalDate(date, { days, months });
          expect(shifted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(new Date(`${shifted}T00:00:00Z`).toISOString().slice(0, 10)).toBe(
            shifted,
          );
          expect(Date.parse(`${shifted}T00:00:00Z`)).toBeGreaterThanOrEqual(
            Date.parse(`${date}T00:00:00Z`),
          );
        },
      ),
    );
  });

  it("is a no-op when nothing is shifted", () => {
    expect(shiftLocalDate("2026-07-04", {})).toBe("2026-07-04");
  });
});
