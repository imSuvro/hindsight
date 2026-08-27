import { REFERENCE_COUNTRIES, REFERENCE_SOURCE } from "@/fixtures/reference-data";
import { type PracticePool, isUsableId } from "@/lib/domain/practice";

/**
 * The reference data, shaped into pools the trainer can draw from.
 *
 * This lives outside `src/lib/domain` because that layer may not reach for a
 * fixture — the question logic takes its dataset as an argument precisely so it
 * stays pure and testable against synthetic pools. This file is the one place
 * that knows the questions are about countries.
 */

/**
 * Only the most populous subjects are asked about.
 *
 * Tuvalu against Nauru is not a hard question, it is a coin flip with no
 * signal, and a session of those measures nothing — calibration requires the
 * reader to have *some* prior to be calibrated about. Population rank is a
 * computable proxy for "somewhere a person plausibly has a prior", so the pool
 * is narrowed by data rather than by anyone's taste. At 120 the floor is
 * Ireland, which is about where recognition starts to thin out.
 */
const SALIENCE_POOL_SIZE = 120;

const salient = [...REFERENCE_COUNTRIES]
  .filter((country) => isUsableId(country.iso))
  .sort((a, b) => b.population - a.population)
  .slice(0, SALIENCE_POOL_SIZE);

const compact = new Intl.NumberFormat("en-GB", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const exact = new Intl.NumberFormat("en-GB");

export const PRACTICE_POOLS: readonly PracticePool[] = [
  {
    kind: "population",
    subjects: salient.map((country) => ({
      id: country.iso,
      label: country.name,
      value: country.population,
      detail: `${exact.format(country.population)} people`,
    })),
  },
  {
    kind: "area",
    subjects: salient.map((country) => ({
      id: country.iso,
      label: country.name,
      value: country.area,
      detail: `${exact.format(country.area)} km²`,
    })),
  },
];

/** What the question asks, per pool. */
export const PRACTICE_PROMPTS: Record<string, string> = {
  population: "Which has more people?",
  area: "Which covers more land?",
};

export function promptFor(kind: string): string {
  return PRACTICE_PROMPTS[kind] ?? "Which is larger?";
}

/** Shown wherever a figure is, so a reader who doubts one can go and check. */
export const PRACTICE_SOURCE = {
  ...REFERENCE_SOURCE,
  note: `Population ${REFERENCE_SOURCE.populationYear}, land area ${REFERENCE_SOURCE.areaYear}.`,
};

export { compact as compactNumber };
