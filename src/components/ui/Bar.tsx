import styles from "./Bar.module.css";

/**
 * The small inline bars — confidence, progress, per-domain gap.
 *
 * These are SVG rather than a `<div>` with a percentage width for a specific
 * reason. The Content-Security-Policy sets `style-src 'self' 'nonce-…'`, and a
 * nonce does not apply to inline `style` attributes, so a width computed per
 * element would be silently refused by the browser and every bar would render
 * empty. An end-to-end test that watches for console errors caught exactly
 * that.
 *
 * SVG geometry is expressed in attributes rather than CSS, so it is unaffected,
 * and the policy stays strict for styles as well as scripts.
 */

export function ProportionBar({
  value,
  label,
  tone = "belief",
  height = 3,
}: {
  /** 0 to 1. */
  value: number;
  label: string;
  tone?: "belief" | "reality";
  height?: number;
}) {
  const width = Math.max(0, Math.min(1, value)) * 100;
  return (
    <svg
      className={styles.bar}
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <rect className={styles.track} x="0" y="0" width="100" height={height} />
      <rect
        className={tone === "belief" ? styles.fillBelief : styles.fillReality}
        x="0"
        y="0"
        width={width}
        height={height}
      />
    </svg>
  );
}

/**
 * A bar that grows from a centre line in either direction, so the direction of
 * a calibration gap is read from position rather than from colour.
 */
export function DivergingBar({
  value,
  extent,
  label,
}: {
  /** Signed. Positive means confidence ran ahead of the outcome. */
  value: number;
  /** The value that fills half the track. */
  extent: number;
  label: string;
}) {
  const magnitude = Math.min(Math.abs(value) / extent, 1) * 50;
  const over = value > 0;
  return (
    <svg
      className={styles.gapBar}
      viewBox="0 0 100 10"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <rect className={styles.track} x="0" y="0" width="100" height="10" />
      <rect
        className={over ? styles.fillBelief : styles.fillReality}
        x={over ? 50 : 50 - magnitude}
        y="0"
        width={magnitude}
        height="10"
      />
      <rect className={styles.centre} x="49.7" y="0" width="0.6" height="10" />
    </svg>
  );
}
