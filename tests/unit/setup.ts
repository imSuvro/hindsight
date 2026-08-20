import fc from "fast-check";

/**
 * Property suites run 300 cases locally for a fast edit loop and 1000 in CI,
 * where the extra minute is free and the wider search is the point.
 */
const numRuns = Number(process.env.FC_RUNS ?? (process.env.CI ? 1000 : 300));

fc.configureGlobal({
  numRuns,
  // A failing case should print the seed and path needed to replay it exactly.
  verbose: 1,
});
