import { type CalibrationBin, binForecasts } from "./binning";
import type { CalibrationInsight } from "./calibration";
import {
  type MurphyDecomposition,
  type ResolvedForecast,
  baseRate,
  brierScore,
  brierSkillScore,
  murphyDecomposition,
} from "./scoring";

/**
 * The calibration trainer.
 *
 * The journal cannot say anything about your judgement until ten decisions have
 * come back and been answered, which honestly takes months. That is the right
 * rule for decisions about your own life — but it leaves a new journal silent
 * for a season, and a silent instrument teaches nothing.
 *
 * This is the other half: questions with a knowable answer, asked now and
 * scored now. You pick one of two options and say how sure you are, and the
 * same Brier machinery that scores the journal scores this. A real reliability
 * diagram appears inside one sitting.
 *
 * Four things it is careful about.
 *
 * **It is a different skill, kept in a different bucket.** Knowing which of two
 * countries is larger is not knowing how your own decisions turn out. Practice
 * is scored here, on its own, and never enters the journal's figures or its
 * ledger. Merging them would let easy questions flatter the number the product
 * exists to keep honest.
 *
 * **Questions are computed, never authored.** The dataset is passed in rather
 * than imported — this layer may not reach for a fixture — and every answer is
 * derived from it by comparison. There is no answer key to get wrong.
 *
 * **The answer never reaches the browser** — and that means the figures, not
 * just a field called `answerId`. A question carries two ids and two labels and
 * nothing else, because shipping the populations alongside them would let
 * anyone read the answer out of the page source and would not even look like a
 * leak. The values come back with the result, once the answer is committed.
 *
 * **Confidence runs 50–99, and is never rescaled.** Below 50 you would simply
 * have picked the other option, so it is not a coherent thing to say. That
 * range is a subset of the journal's 1–99, so every scoring primitive takes it
 * unchanged — and rescaling it onto the full range would make the reported
 * probability differ from the believed one, destroying the propriety that
 * `scoring.ts` calls the requirement rather than a nicety.
 */

/* ---------------------------------------------------------------- thresholds */

/**
 * Below these the trainer reports progress and nothing else.
 *
 * Deliberately *higher* than the journal's, and its own constant rather than a
 * borrowed one. The reason the journal shows nothing at nine is sampling noise,
 * and noise does not care that practice answers are cheap to produce — twenty
 * coin-flips are twenty coin-flips whether they took a year or ten minutes. The
 * cheapness is what makes the higher bar affordable, not what makes it
 * unnecessary.
 */
export const PRACTICE_THRESHOLDS = {
  /** Hit rate, mean confidence, tendency, and the curve. */
  headline: 20,
  /** The reliability/resolution split and the skill score. */
  decomposition: 40,
} as const;

/** The lowest confidence a two-alternative answer can coherently express. */
export const PRACTICE_CONFIDENCE_MIN = 50;
/** Certainty is not on offer, here or in the journal. */
export const PRACTICE_CONFIDENCE_MAX = 99;

/**
 * Answering 50 to everything scores exactly this, whatever happens, because
 * `(0.5 − 0)² = (0.5 − 1)² = 0.25`. The journal has no such fixed reference —
 * its confidence floor is 1 — so this is a reading practice can offer from the
 * first session that the journal cannot.
 */
export const GUESSING_BRIER = 0.25;

/* --------------------------------------------------------------------- types */

export type PracticeDifficulty = "close" | "near" | "clear";

/** One side of a comparison. `value` is what the question is really about. */
export type PracticeSubject = {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  /** Shown after answering, so the reader can check the claim. */
  readonly detail?: string;
};

/** A pool of comparable subjects — one metric, e.g. population. */
export type PracticePool = {
  readonly kind: string;
  readonly subjects: readonly PracticeSubject[];
};

/**
 * An option as the page sees it: something to name and something to click, and
 * deliberately not the figure it is named for.
 */
export type PracticeOption = {
  readonly id: string;
  readonly label: string;
};

/**
 * What the page may render.
 *
 * The type is the enforcement. Everything that would give the answer away —
 * `value`, `detail`, and `answerId` itself — is absent, so no prop spread or
 * careless edit can serialise it into the payload Next sends to the browser.
 */
export type PracticeQuestion = {
  readonly id: string;
  readonly kind: string;
  readonly difficulty: PracticeDifficulty;
  readonly options: readonly [PracticeOption, PracticeOption];
};

/** What the server gets, figures and all. Only `resolveQuestion` produces one. */
export type PracticeQuestionKey = {
  readonly id: string;
  readonly kind: string;
  readonly difficulty: PracticeDifficulty;
  readonly options: readonly [PracticeSubject, PracticeSubject];
  readonly answerId: string;
};

export type PracticeAnswer = {
  /** Whole percent, 50–99. */
  readonly confidence: number;
  readonly correct: boolean;
};

export type PracticeReport = {
  readonly thresholds: typeof PRACTICE_THRESHOLDS;
  readonly counts: { readonly answered: number; readonly correct: number };
  readonly hitRate: number | null;
  readonly brier: number | null;
  readonly meanConfidence: number | null;
  /** Positive when confidence ran ahead of accuracy. */
  readonly gap: number | null;
  readonly direction: "overconfident" | "underconfident" | "calibrated" | null;
  /**
   * How much better than answering 50 to everything. 1 is perfect, 0 is no
   * better than shrugging, negative means the confidence is anti-informative.
   * Always defined once past the threshold, unlike `skillScore`.
   */
  readonly edgeOverGuessing: number | null;
  readonly bins: readonly CalibrationBin[];
  /**
   * The band furthest off the diagonal, or null when none is meaningfully off.
   *
   * Present because the diagram's caption is written from it, and an absent
   * `insight` makes that caption claim nothing is off the line — which is a
   * statement about the data, not a default. It was absent here once, and the
   * trainer told every reader their confidence tracked reality.
   */
  readonly insight: CalibrationInsight | null;
  readonly decomposition: MurphyDecomposition | null;
  readonly skillScore: number | null;
  readonly remainingForHeadline: number;
  readonly remainingForDecomposition: number;
};

/** Below this the gap is inside the noise and is not called a miss. */
const MEANINGFUL_GAP = 0.05;

/**
 * The band furthest off the diagonal. Mirrors `insightOf` in `calibration.ts`,
 * which is private there — ten lines duplicated in preference to widening that
 * module's surface, because its small-sample gating is the product rather than
 * an implementation detail to be shared around.
 */
function worstBand(bins: readonly CalibrationBin[]): CalibrationInsight | null {
  let worst: CalibrationInsight | null = null;
  for (const bin of bins) {
    const gap = bin.meanForecast - bin.observedFrequency;
    if (Math.abs(gap) < MEANINGFUL_GAP) continue;
    if (!worst || Math.abs(gap) > Math.abs(worst.gap)) {
      worst = { bin, gap, direction: gap > 0 ? "overconfident" : "underconfident" };
    }
  }
  return worst;
}

/* ------------------------------------------------------------------ scoring */

/**
 * The whole join with the existing machinery.
 *
 * The proposition being forecast is "the option I picked is the right one", so
 * the stated confidence passes through untouched and the outcome is whether the
 * pick was right.
 *
 * The alternative — fixing a canonical proposition ("the left option is
 * larger") and recording `100 − c` when the reader picks right — gives an
 * identical Brier score, since squared error is symmetric about the flip. It is
 * still wrong, in three ways that matter:
 *
 * - `baseRate` would become the share of questions whose left option happened
 *   to be larger, an artifact of presentation order converging on 0.5, rather
 *   than the reader's hit rate. `brierSkillScore` builds on it, so skill would
 *   be measured against a coin instead of against the person.
 * - The tendency would invert. Picking B at 70% when A was right reads as
 *   +0.70 overconfident under this framing and −0.70 *under*confident under the
 *   canonical one. The product would tell the reader the opposite of the truth.
 * - `murphyDecomposition` groups by identical confidence, and the two framings
 *   group differently, so the reliability/resolution split would move for
 *   identical behaviour.
 */
export function practiceForecast(answer: PracticeAnswer): ResolvedForecast {
  return { confidence: answer.confidence, occurred: answer.correct };
}

export function toForecasts(answers: readonly PracticeAnswer[]): ResolvedForecast[] {
  return answers.map(practiceForecast);
}

export function buildPracticeReport(answers: readonly PracticeAnswer[]): PracticeReport {
  const forecasts = toForecasts(answers);
  const answered = forecasts.length;
  const correct = forecasts.filter((forecast) => forecast.occurred).length;

  const hasHeadline = answered >= PRACTICE_THRESHOLDS.headline;
  const hasDecomposition = answered >= PRACTICE_THRESHOLDS.decomposition;

  // The scoring primitives throw on an empty sample by design, while
  // `binForecasts` returns []. Everything below threshold is gated rather than
  // defended against, which is also what keeps a first session honest.
  const brier = hasHeadline ? brierScore(forecasts) : null;
  const hitRate = hasHeadline ? baseRate(forecasts) : null;
  const meanConfidence = hasHeadline
    ? forecasts.reduce((total, f) => total + f.confidence / 100, 0) / answered
    : null;

  const gap =
    meanConfidence !== null && hitRate !== null ? meanConfidence - hitRate : null;

  const bins = hasHeadline ? binForecasts(forecasts) : [];

  return {
    thresholds: PRACTICE_THRESHOLDS,
    counts: { answered, correct },
    hitRate,
    brier,
    meanConfidence,
    gap,
    direction:
      gap === null
        ? null
        : Math.abs(gap) < MEANINGFUL_GAP
          ? "calibrated"
          : gap > 0
            ? "overconfident"
            : "underconfident",
    edgeOverGuessing: brier === null ? null : 1 - brier / GUESSING_BRIER,
    bins,
    insight: worstBand(bins),
    decomposition: hasDecomposition ? murphyDecomposition(forecasts) : null,
    // Null when every answer went the same way, which a strong start makes
    // likely. The caller renders that as "not yet", never as zero.
    skillScore: hasDecomposition ? brierSkillScore(forecasts) : null,
    remainingForHeadline: Math.max(PRACTICE_THRESHOLDS.headline - answered, 0),
    remainingForDecomposition: Math.max(PRACTICE_THRESHOLDS.decomposition - answered, 0),
  };
}

/* ------------------------------------------------------- question selection */

/**
 * A pair must differ by at least this much to become a question.
 *
 * This is a correctness floor rather than a difficulty preference. Two
 * countries whose populations differ by 2% is not a fact anyone can be
 * calibrated about — the difference is inside the source's own estimation
 * error, so "correct" would be an artifact of the estimate rather than of the
 * world. It also disposes of the exact ties the dataset really contains: Aruba
 * and the Marshall Islands are both recorded at 180 km², and the Northern
 * Mariana Islands, Palau and the Seychelles all at 460, where a right answer
 * does not exist at all.
 */
export const MIN_RATIO = 1.1;

/** Ratio bands. Difficulty is computed from the data, never assigned. */
export const DIFFICULTY_BANDS = {
  close: { min: MIN_RATIO, max: 1.5 },
  near: { min: 1.5, max: 4 },
  clear: { min: 4, max: Number.POSITIVE_INFINITY },
} as const satisfies Record<PracticeDifficulty, { min: number; max: number }>;

export const SESSION_LENGTH = 20;

/**
 * The shape of a session: six close, eight near, six clear.
 *
 * Interleaved rather than ramped, so position never predicts difficulty — a run
 * that gets steadily harder teaches the reader to lower their confidence by the
 * clock instead of by the question. It opens on `near` rather than `clear`
 * because opening easy is patronising and inflates the early hit rate.
 */
export const SESSION_SHAPE: readonly PracticeDifficulty[] = [
  "near",
  "clear",
  "close",
  "near",
  "near",
  "clear",
  "close",
  "near",
  "clear",
  "near",
  "close",
  "clear",
  "near",
  "close",
  "near",
  "clear",
  "close",
  "near",
  "clear",
  "close",
];

/**
 * Deterministic PRNG. Seeded so a session can be replayed and a test can assert
 * an exact question set; `Math.random` would make both impossible, and ambient
 * non-determinism has no place in this layer.
 */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function rng(seed: string): () => number {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lowest index whose value is >= target, in an ascending array. */
function lowerBound(sorted: readonly PracticeSubject[], target: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (sorted[mid].value < target) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * Stable and order-independent, so a pair is one question however it is drawn
 * and an account is never asked it twice.
 */
export function questionId(kind: string, a: string, b: string): string {
  return [kind, ...[a, b].sort()].join(":");
}

/**
 * Ids are parsed back out of the question id, so a colon in either would make
 * the id ambiguous. Callers building a pool run this over their subject ids.
 */
export function isUsableId(value: string): boolean {
  return value.length > 0 && !value.includes(":");
}

type Prepared = { pool: PracticePool; sorted: readonly PracticeSubject[] };

function prepare(pools: readonly PracticePool[]): Prepared[] {
  return pools
    .filter((pool) => pool.subjects.length >= 2)
    .map((pool) => ({
      pool,
      sorted: [...pool.subjects]
        .filter((subject) => subject.value > 0)
        .sort((a, b) => a.value - b.value),
    }))
    .filter((prepared) => prepared.sorted.length >= 2);
}

/**
 * Every partner for `subject` whose ratio falls inside `band`, found by binary
 * search rather than by scanning — the valid partners are exactly two
 * contiguous slices of the sorted array, one above and one below.
 */
function partnersInBand(
  sorted: readonly PracticeSubject[],
  index: number,
  band: { min: number; max: number },
): PracticeSubject[] {
  const value = sorted[index].value;
  const above = sorted.slice(
    lowerBound(sorted, value * band.min),
    Number.isFinite(band.max) ? lowerBound(sorted, value * band.max) : sorted.length,
  );
  const below = sorted.slice(
    Number.isFinite(band.max) ? lowerBound(sorted, value / band.max) : 0,
    lowerBound(sorted, value / band.min),
  );
  return [...below, ...above].filter((subject) => subject.id !== sorted[index].id);
}

export type SessionOptions = {
  readonly seed: string;
  /** Question ids the account has already answered. */
  readonly exclude?: ReadonlySet<string>;
  readonly length?: number;
};

/**
 * Build one session, with a deliberate spread of difficulty.
 *
 * Sampling pairs uniformly would be a measured mistake: across the bundled
 * dataset more than half of all pairs differ by over eightfold, so a uniform
 * trainer asks mostly trivia, every answer lands at 95–99%, and the reliability
 * diagram collapses into a single cluster in one corner. That teaches nothing
 * about calibration — it teaches that the questions were easy.
 *
 * The reader cannot tell which band a question came from, which is the point:
 * the spread exists so the confidence scale gets used, not to be perceived.
 */
export function buildSession(
  pools: readonly PracticePool[],
  options: SessionOptions,
): PracticeQuestion[] {
  const { seed, exclude } = options;
  const length = options.length ?? SESSION_LENGTH;
  const prepared = prepare(pools);
  if (length <= 0 || prepared.length === 0) return [];

  const random = rng(seed);
  const chosen: PracticeQuestion[] = [];
  const usedQuestions = new Set<string>();
  // No subject twice in one sitting: a session that asks about Brazil three
  // times reads as broken even when each pair is technically distinct.
  const usedSubjects = new Set<string>();

  const draw = (
    difficulty: PracticeDifficulty,
    allowRepeatSubjects: boolean,
    allowExcluded: boolean,
  ): PracticeQuestion | null => {
    const band = DIFFICULTY_BANDS[difficulty];
    // Two of the subjects in a real pool have no close-band partner at all, so
    // an empty slice must advance to another subject rather than give up.
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const { pool, sorted } = prepared[Math.floor(random() * prepared.length)];
      const index = Math.floor(random() * sorted.length);
      const anchor = sorted[index];
      if (!allowRepeatSubjects && usedSubjects.has(anchor.id)) continue;

      const partners = partnersInBand(sorted, index, band).filter(
        (partner) => allowRepeatSubjects || !usedSubjects.has(partner.id),
      );
      if (partners.length === 0) continue;

      const partner = partners[Math.floor(random() * partners.length)];
      const id = questionId(pool.kind, anchor.id, partner.id);
      if (usedQuestions.has(id)) continue;
      if (!allowExcluded && exclude?.has(id)) continue;

      // Which option is shown first must not encode the answer.
      const shown = random() < 0.5 ? [partner, anchor] : [anchor, partner];

      usedQuestions.add(id);
      usedSubjects.add(anchor.id);
      usedSubjects.add(partner.id);
      return {
        id,
        kind: pool.kind,
        difficulty,
        // Stripped to id and label. Carrying the values here would put both
        // figures in the page source and hand over the answer.
        options: [
          { id: shown[0].id, label: shown[0].label },
          { id: shown[1].id, label: shown[1].label },
        ],
      };
    }
    return null;
  };

  const ORDER: readonly PracticeDifficulty[] = ["near", "clear", "close"];

  for (let i = 0; i < length; i += 1) {
    const wanted = SESSION_SHAPE[i % SESSION_SHAPE.length];
    /*
     * Relax in order rather than return a short session: promising twenty
     * questions and delivering seventeen looks broken, where a repeated pair
     * merely looks like a repeat.
     *
     * The last step gives up the requested band entirely, because a band can be
     * unsatisfiable for a whole dataset rather than merely exhausted — a pool
     * whose neighbours are all a factor of 1.6 apart contains no `close` pair at
     * any seed, and asking for six of them would otherwise cost six questions.
     */
    const question =
      draw(wanted, false, false) ??
      draw(wanted, true, false) ??
      draw(wanted, true, true) ??
      ORDER.reduce<PracticeQuestion | null>(
        (found, fallback) =>
          found ?? (fallback === wanted ? null : draw(fallback, true, true)),
        null,
      );
    if (question) chosen.push(question);
  }

  return chosen;
}

/**
 * Recover a question, and its answer, from its id alone.
 *
 * This is the security property: the browser posts an id, a chosen option and a
 * confidence, and never tells the server which answer was right. Returns null
 * for anything that does not resolve, so a forged id cannot score.
 */
export function resolveQuestion(
  pools: readonly PracticePool[],
  id: string,
): PracticeQuestionKey | null {
  // The id is its own index: `kind:idA:idB`, subject ids sorted. Parsing beats
  // searching, and it means a forged id costs one map lookup to reject.
  const parts = id.split(":");
  if (parts.length !== 3) return null;
  const [kind, firstId, secondId] = parts;
  if (firstId === secondId) return null;

  const pool = pools.find((candidate) => candidate.kind === kind);
  if (!pool) return null;

  const byId = new Map(pool.subjects.map((subject) => [subject.id, subject]));
  const first = byId.get(firstId);
  const second = byId.get(secondId);
  if (!first || !second) return null;
  if (first.value <= 0 || second.value <= 0) return null;

  // A pair inside the correctness floor has no defensible answer, so it cannot
  // be scored even if it was somehow asked.
  const ratio = Math.max(first.value, second.value) / Math.min(first.value, second.value);
  if (!Number.isFinite(ratio) || ratio < MIN_RATIO) return null;

  return {
    // The canonical form, not what was posted. `population:B:A` and
    // `population:A:B` name one pair, and returning the id verbatim let the
    // second spelling be stored under its own `_id` — so the same pair could be
    // answered twice and scored twice.
    id: questionId(pool.kind, firstId, secondId),
    kind: pool.kind,
    difficulty: difficultyOf(ratio),
    options: [first, second],
    answerId: first.value > second.value ? first.id : second.id,
  };
}

export function difficultyOf(ratio: number): PracticeDifficulty {
  if (ratio < DIFFICULTY_BANDS.close.max) return "close";
  if (ratio < DIFFICULTY_BANDS.near.max) return "near";
  return "clear";
}
