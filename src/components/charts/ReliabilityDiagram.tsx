import type { CalibrationBin } from "@/lib/domain/binning";
import type { CalibrationInsight } from "@/lib/domain/calibration";
import styles from "./ReliabilityDiagram.module.css";

/**
 * The reliability diagram — the one picture this product exists to draw.
 *
 * Horizontal is what you said. Vertical is what happened. The dashed diagonal
 * is where a perfectly calibrated forecaster's points would fall, so the
 * distance from a point to that line is the entire finding — and it is drawn as
 * a line rather than left for the reader to estimate.
 *
 * Three things are deliberate:
 *
 * - **Direction is encoded three ways.** Position relative to the diagonal,
 *   line style (solid when confidence outran reality, dashed when it lagged),
 *   and colour. Nothing depends on colour alone.
 * - **Sample size is in the mark.** Point area is proportional to the number of
 *   decisions behind it, and every point carries a Wilson interval, so a point
 *   built from five decisions cannot be mistaken for one built from fifty.
 * - **There is no JavaScript.** Readouts appear on hover *and* on keyboard
 *   focus through CSS alone, and the same numbers are available as a table, so
 *   the chart works for a screen reader, for a keyboard, and with scripting
 *   disabled.
 */

const SIZE = 320;
const PAD_LEFT = 46;
const PAD_TOP = 18;
const PAD_RIGHT = 18;
// A square plot area: both axes carry the same quantity in the same units, so
// any other aspect ratio would tilt the perfect-calibration diagonal off 45°
// and make the distance from it harder to judge by eye.
const PLOT = SIZE - PAD_LEFT - PAD_RIGHT;

const MIN_RADIUS = 5;
const MAX_RADIUS = 13;
/** Keeps the gap bracket clear of the interval that shares the point's x. */
const GAP_OFFSET = 7;
/** Half-width of the invisible hover and focus target around each point. */
const HIT_HALF_WIDTH = 15;

type Direction = "over" | "under" | "even";

/** Gaps below this are inside the noise and are not called a miss. */
const EVEN_BAND = 0.02;

export type ReliabilityDiagramProps = {
  bins: readonly CalibrationBin[];
  insight?: CalibrationInsight | null;
  /** Used for the accessible description and the table caption. */
  scoredCount: number;
  /**
   * `"frame"` draws the instrument with no reading in it: axes, grid and the
   * perfect-calibration diagonal, and nothing plotted.
   *
   * This is what a journal below the display threshold shows. It is not a
   * preview and not a faded estimate — there is no data on it at all, which
   * keeps the thresholds in `docs/calibration.md` intact while still letting a
   * new user see the instrument they are filling. The legend and the numbers
   * table are omitted because both would describe marks that are not there.
   */
  variant?: "full" | "frame";
};

const x = (value: number) => PAD_LEFT + value * PLOT;
const y = (value: number) => PAD_TOP + (1 - value) * PLOT;
const percent = (value: number) => `${Math.round(value * 100)}%`;

function directionOf(bin: CalibrationBin): Direction {
  const gap = bin.meanForecast - bin.observedFrequency;
  if (Math.abs(gap) <= EVEN_BAND) return "even";
  return gap > 0 ? "over" : "under";
}

function radiusOf(count: number, largest: number): number {
  if (largest <= 0) return MIN_RADIUS;
  // Area, not radius, tracks the count — otherwise a bin of 50 looks seven
  // times heavier than a bin of 10 rather than a little over twice.
  const scale = Math.sqrt(count / largest);
  return MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * scale;
}

function describe(bin: CalibrationBin): string {
  const range =
    bin.lowerConfidence === bin.upperConfidence
      ? `${bin.lowerConfidence}%`
      : `${bin.lowerConfidence}% to ${bin.upperConfidence}%`;
  return (
    `When you said ${range}, it happened ${percent(bin.observedFrequency)} of the time. ` +
    `${bin.occurred} of ${bin.count} decisions. ` +
    `Plausible range ${percent(bin.interval.lower)} to ${percent(bin.interval.upper)}.`
  );
}

export function ReliabilityDiagram({
  bins,
  insight,
  scoredCount,
  variant = "full",
}: ReliabilityDiagramProps) {
  const isFrame = variant === "frame";
  const largest = bins.reduce((max, bin) => Math.max(max, bin.count), 0);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <figure className={styles.figure}>
      <div className={styles.plotFrame}>
        <svg
          className={styles.plot}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={
            isFrame
              ? "An empty reliability diagram. What you said runs along the bottom, what happened runs up the side, and the dashed diagonal marks perfect calibration. Nothing is plotted yet."
              : `Reliability diagram of ${scoredCount} resolved decisions, grouped into ${bins.length} confidence bands. The numbers behind it are in the table below.`
          }
        >
          {ticks.map((tick) => (
            <g key={`grid-${tick}`}>
              <line
                className={styles.gridLine}
                x1={x(0)}
                x2={x(1)}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text
                className={styles.tickLabel}
                x={PAD_LEFT - 8}
                y={y(tick) + 3.5}
                textAnchor="end"
              >
                {percent(tick)}
              </text>
              <text
                className={styles.tickLabel}
                x={x(tick)}
                y={y(0) + 16}
                textAnchor="middle"
              >
                {percent(tick)}
              </text>
            </g>
          ))}

          <line className={styles.axisLine} x1={x(0)} x2={x(1)} y1={y(0)} y2={y(0)} />
          <line className={styles.axisLine} x1={x(0)} x2={x(0)} y1={y(0)} y2={y(1)} />

          {/* The reference wire, named in place so it is never colour alone. */}
          <line
            className={styles.referenceLine}
            x1={x(0)}
            y1={y(0)}
            x2={x(1)}
            y2={y(1)}
          />
          {/*
            Set along the diagonal rather than above it, and low on the line.
            Laid horizontally near the top it sat across whatever point happened
            to be plotted there; down here it labels the line without competing
            with the data, since low-confidence decisions are the sparsest part
            of most journals.
          */}
          <text
            className={styles.referenceLabel}
            transform={`rotate(-45, ${x(0.3) + 8}, ${y(0.3) + 8})`}
            x={x(0.3) + 8}
            y={y(0.3) + 8}
            textAnchor="middle"
          >
            Perfect calibration
          </text>

          <text className={styles.axisTitle} x={x(0.5)} y={SIZE - 6} textAnchor="middle">
            What you said
          </text>
          <text
            className={styles.axisTitle}
            transform={`translate(12 ${y(0.5)}) rotate(-90)`}
            textAnchor="middle"
          >
            What happened
          </text>

          {(isFrame ? [] : bins).map((bin) => {
            const direction = directionOf(bin);
            const cx = x(bin.meanForecast);
            const cy = y(bin.observedFrequency);
            const radius = radiusOf(bin.count, largest);
            const gapClass = direction === "under" ? styles.gapUnder : styles.gapOver;
            const intervalClass =
              direction === "under" ? styles.intervalUnder : styles.intervalOver;
            const pointClass =
              direction === "under"
                ? styles.pointUnder
                : direction === "over"
                  ? styles.pointOver
                  : styles.pointEven;

            // Keep the readout inside the frame on points near the right edge.
            const readoutWidth = 128;
            const readoutX = Math.min(cx + 10, x(1) - readoutWidth);
            const readoutY = Math.max(cy - 34, PAD_TOP);

            return (
              <g
                key={bin.index}
                className={styles.mark}
                tabIndex={0}
                role="img"
                aria-label={describe(bin)}
              >
                {/*
                  A transparent target covering the point and its whole
                  interval. Without it only the drawn pixels are hoverable, so
                  the readout barely triggers — the hit area has to be bigger
                  than the mark, not equal to it.
                */}
                <rect
                  className={styles.hitArea}
                  x={cx - HIT_HALF_WIDTH}
                  y={Math.min(y(bin.interval.upper), cy - radius) - 4}
                  width={HIT_HALF_WIDTH * 2}
                  height={
                    Math.max(y(bin.interval.lower), cy + radius) -
                    Math.min(y(bin.interval.upper), cy - radius) +
                    8
                  }
                />
                {/*
                  The gap is offset to the left of the point and bracketed at
                  the diagonal end, so it reads as a measurement of the distance
                  rather than merging into the interval that shares its x.
                */}
                {direction !== "even" && (
                  <>
                    <line
                      className={gapClass}
                      x1={cx - GAP_OFFSET}
                      y1={cy}
                      x2={cx - GAP_OFFSET}
                      y2={y(bin.meanForecast)}
                    />
                    <line
                      className={gapClass}
                      x1={cx - GAP_OFFSET - 3}
                      y1={y(bin.meanForecast)}
                      x2={cx - GAP_OFFSET + 3}
                      y2={y(bin.meanForecast)}
                    />
                  </>
                )}
                {/* Interval with end caps, so it reads as an error bar. */}
                <line
                  className={intervalClass}
                  x1={cx}
                  y1={y(bin.interval.lower)}
                  x2={cx}
                  y2={y(bin.interval.upper)}
                />
                <line
                  className={intervalClass}
                  x1={cx - 3.5}
                  y1={y(bin.interval.upper)}
                  x2={cx + 3.5}
                  y2={y(bin.interval.upper)}
                />
                <line
                  className={intervalClass}
                  x1={cx - 3.5}
                  y1={y(bin.interval.lower)}
                  x2={cx + 3.5}
                  y2={y(bin.interval.lower)}
                />
                <circle className={pointClass} cx={cx} cy={cy} r={radius} />

                <g className={styles.readout}>
                  <rect
                    className={styles.readoutBox}
                    x={readoutX}
                    y={readoutY}
                    width={readoutWidth}
                    height={30}
                  />
                  <text className={styles.readoutText} x={readoutX + 8} y={readoutY + 13}>
                    said {bin.lowerConfidence}
                    {bin.lowerConfidence === bin.upperConfidence
                      ? ""
                      : `–${bin.upperConfidence}`}
                    % · {percent(bin.observedFrequency)}
                  </text>
                  <text className={styles.readoutText} x={readoutX + 8} y={readoutY + 24}>
                    {bin.occurred}/{bin.count} decisions
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      {!isFrame && (
        <ul className={styles.legendList}>
          <li className={styles.legendItem}>
            <svg className={styles.legendSwatch} viewBox="0 0 18 10" aria-hidden="true">
              <line className={styles.gapOver} x1="0" y1="5" x2="18" y2="5" />
              <circle className={styles.pointOver} cx="9" cy="5" r="4" />
            </svg>
            More confident than it turned out
          </li>
          <li className={styles.legendItem}>
            <svg className={styles.legendSwatch} viewBox="0 0 18 10" aria-hidden="true">
              <line className={styles.gapUnder} x1="0" y1="5" x2="18" y2="5" />
              <circle className={styles.pointUnder} cx="9" cy="5" r="4" />
            </svg>
            Less confident than it turned out
          </li>
          <li className={styles.legendItem}>
            <svg className={styles.legendSwatch} viewBox="0 0 18 10" aria-hidden="true">
              <line className={styles.referenceLine} x1="0" y1="5" x2="18" y2="5" />
            </svg>
            Perfect calibration
          </li>
          <li className={styles.legendItem}>Point size shows how many decisions</li>
        </ul>
      )}

      {isFrame ? null : insight ? (
        <p className={styles.annotation}>
          <span className={styles.annotationStrong}>
            When you said{" "}
            {insight.bin.lowerConfidence === insight.bin.upperConfidence
              ? `${insight.bin.lowerConfidence}%`
              : `${insight.bin.lowerConfidence}–${insight.bin.upperConfidence}%`}
            , it happened {percent(insight.bin.observedFrequency)} of the time.
          </span>{" "}
          That is your widest gap between confidence and outcome, across{" "}
          {insight.bin.count} decisions.
        </p>
      ) : (
        <p className={styles.annotation}>
          <span className={styles.annotationStrong}>
            No band is meaningfully off the line.
          </span>{" "}
          Across {scoredCount} resolved decisions, your stated confidence has tracked what
          actually happened.
        </p>
      )}

      {!isFrame && (
        <details className={styles.tableToggle}>
          <summary>Show the numbers</summary>
          {/*
            An explicit scroll container. `overflow-x` on the <details> itself
            does not contain the table, so at 360px it pushed the whole page
            sideways instead.
          */}
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <caption>
                Each row is one point on the diagram, built from {scoredCount} resolved
                decisions.
              </caption>
              <thead>
                <tr>
                  <th scope="col">You said</th>
                  <th scope="col">It happened</th>
                  <th scope="col">Decisions</th>
                  <th scope="col">Plausible range</th>
                  <th scope="col">Reading</th>
                </tr>
              </thead>
              <tbody>
                {bins.map((bin) => {
                  const direction = directionOf(bin);
                  return (
                    <tr key={bin.index}>
                      <td>
                        {bin.lowerConfidence === bin.upperConfidence
                          ? `${bin.lowerConfidence}%`
                          : `${bin.lowerConfidence}–${bin.upperConfidence}%`}
                      </td>
                      <td>{percent(bin.observedFrequency)}</td>
                      <td>
                        {bin.occurred} of {bin.count}
                      </td>
                      <td>
                        {percent(bin.interval.lower)}–{percent(bin.interval.upper)}
                      </td>
                      <td className={styles.tableTextCell}>
                        {direction === "over"
                          ? "More confident than it turned out"
                          : direction === "under"
                            ? "Less confident than it turned out"
                            : "On the line"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </figure>
  );
}
