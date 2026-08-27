#!/usr/bin/env node
/**
 * Rebuild the practice reference data from the World Bank.
 *
 *   node scripts/build-reference-data.mjs
 *
 * Practice questions are *computed* from this data, never authored. That is the
 * whole point: a calibration trainer whose answer key is wrong is worse than no
 * trainer at all, so no fact in it is written by hand. Every figure here came
 * from an authoritative API, and the generated file records which indicator,
 * which year, and when it was retrieved.
 *
 * The World Bank was chosen over the alternatives because it needs no API key,
 * publishes stable indicator codes, and is citable — the file it writes names
 * its source so a user who doubts a question can go and check it.
 *
 * Regional aggregates ("Africa Eastern and Southern") are filtered out: they
 * are in the same response as countries and would make nonsense questions.
 */

import { writeFileSync } from "node:fs";

const YEAR_POPULATION = "2023";
const YEAR_AREA = "2022";
const SOURCE = "https://data.worldbank.org";

async function wb(path) {
  const url = `https://api.worldbank.org/v2/${path}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body) || !Array.isArray(body[1])) {
    throw new Error(`${url} -> unexpected shape`);
  }
  return body[1];
}

console.warn("Fetching country list…");
const countries = await wb("country?format=json&per_page=400");

console.warn("Fetching population…");
const population = await wb(
  `country/all/indicator/SP.POP.TOTL?format=json&per_page=400&date=${YEAR_POPULATION}`,
);

console.warn("Fetching land area…");
const area = await wb(
  `country/all/indicator/AG.LND.TOTL.K2?format=json&per_page=400&date=${YEAR_AREA}`,
);

// `region.id === "NA"` marks an aggregate rather than a country.
const real = new Map(
  countries
    .filter((c) => c.region && c.region.id !== "NA")
    .map((c) => [c.id, { name: c.name.trim(), region: c.region.value.trim() }]),
);

const byIso = new Map();
for (const row of population) {
  const country = real.get(row.countryiso3code);
  if (!country || !row.value) continue;
  byIso.set(row.countryiso3code, { ...country, population: row.value });
}
for (const row of area) {
  const entry = byIso.get(row.countryiso3code);
  if (!entry || !row.value) continue;
  entry.area = Math.round(row.value);
}

const rows = [...byIso.entries()]
  .filter(([, c]) => c.population && c.area)
  .map(([iso, c]) => ({
    iso,
    name: c.name,
    region: c.region,
    population: c.population,
    area: c.area,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

if (rows.length < 150) {
  throw new Error(`only ${rows.length} complete rows — refusing to write a thin dataset`);
}

const file = `/*
 * GENERATED FILE — do not edit by hand.
 * Rebuild with: node scripts/build-reference-data.mjs
 *
 * Reference facts for the calibration trainer. Practice questions are computed
 * from these figures rather than written, so the answer key cannot be wrong
 * unless the source is — and the source is named here so it can be checked.
 *
 * Source:      The World Bank Open Data (${SOURCE}), CC BY 4.0
 * Indicators:  SP.POP.TOTL (population, ${YEAR_POPULATION});
 *              AG.LND.TOTL.K2 (land area in sq. km, ${YEAR_AREA})
 * Retrieved:   ${new Date().toISOString().slice(0, 10)}
 * Countries:   ${rows.length}
 */

export type ReferenceCountry = {
  readonly iso: string;
  readonly name: string;
  readonly region: string;
  /** Total population. World Bank SP.POP.TOTL, ${YEAR_POPULATION}. */
  readonly population: number;
  /** Land area in square kilometres. World Bank AG.LND.TOTL.K2, ${YEAR_AREA}. */
  readonly area: number;
};

export const REFERENCE_SOURCE = {
  name: "The World Bank Open Data",
  url: "${SOURCE}",
  licence: "CC BY 4.0",
  populationYear: "${YEAR_POPULATION}",
  areaYear: "${YEAR_AREA}",
  retrieved: "${new Date().toISOString().slice(0, 10)}",
} as const;

export const REFERENCE_COUNTRIES: readonly ReferenceCountry[] = ${JSON.stringify(rows, null, 2)};
`;

writeFileSync("src/fixtures/reference-data.ts", file);
console.warn(`Wrote src/fixtures/reference-data.ts with ${rows.length} countries.`);
