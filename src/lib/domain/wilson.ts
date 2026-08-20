/**
 * Wilson score interval for a binomial proportion.
 *
 * The reliability diagram lives or dies on this. A point that reads "when you
 * said 80%, it happened 60% of the time" means something very different from
 * six observations than from six hundred, and the normal approximation everyone
 * reaches for first (p ± z·√(p(1-p)/n)) is actively wrong at exactly the sample
 * sizes a personal journal produces: it produces zero-width intervals at p = 0
 * or 1, and bounds outside [0, 1] near the edges.
 *
 * The Wilson interval is obtained by inverting the score test instead, which
 * keeps coverage close to nominal for small n and always stays inside [0, 1].
 *
 * Reference: Wilson (1927); Brown, Cai & DasGupta (2001), "Interval Estimation
 * for a Binomial Proportion".
 */

/** Two-sided 95% normal quantile. */
export const Z_95 = 1.959963984540054;

export type ProportionInterval = {
  /** Point estimate, successes / trials. */
  estimate: number;
  lower: number;
  upper: number;
};

export class InvalidSampleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSampleError";
  }
}

export function wilsonInterval(
  successes: number,
  trials: number,
  z: number = Z_95,
): ProportionInterval {
  if (!Number.isInteger(successes) || !Number.isInteger(trials)) {
    throw new InvalidSampleError("Successes and trials must be integers");
  }
  if (trials < 1) throw new InvalidSampleError("Needs at least one trial");
  if (successes < 0 || successes > trials) {
    throw new InvalidSampleError("Successes must lie between 0 and trials");
  }
  if (!(z > 0) || !Number.isFinite(z)) {
    throw new InvalidSampleError("z must be a positive, finite quantile");
  }

  const n = trials;
  const estimate = successes / n;
  const zSquared = z * z;
  const denominator = 1 + zSquared / n;
  const centre = (estimate + zSquared / (2 * n)) / denominator;
  const margin =
    (z / denominator) *
    Math.sqrt((estimate * (1 - estimate)) / n + zSquared / (4 * n * n));

  // The maths already confines these to [0, 1]; the clamp only absorbs the last
  // bit of floating-point drift so downstream chart geometry can trust them.
  return {
    estimate,
    lower: Math.min(Math.max(centre - margin, 0), 1),
    upper: Math.min(Math.max(centre + margin, 0), 1),
  };
}
