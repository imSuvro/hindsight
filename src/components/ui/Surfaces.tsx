import type { ReactNode } from "react";
import styles from "./Surfaces.module.css";

/**
 * Surface primitives — DESIGN.md § Components.
 *
 * These exist so that width, padding and border decisions are made once. The
 * audit's second-ranked finding was that cards on the same page chose their own
 * widths, so nothing aligned down the right edge. A `Card` fills its container;
 * an `EmptyState` fills the same box its populated counterpart would.
 */

export function Card({
  children,
  tone = "raised",
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  tone?: "raised" | "quiet" | "sunk";
  className?: string;
  as?: "div" | "section" | "article";
}) {
  const toneClass =
    tone === "quiet" ? styles.cardQuiet : tone === "sunk" ? styles.cardSunk : styles.card;
  return <Tag className={`${toneClass} ${className}`.trim()}>{children}</Tag>;
}

export function SectionHead({
  title,
  note,
  action,
  id,
}: {
  title: string;
  note?: string;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className={styles.sectionHead}>
      <div>
        <h2 className={styles.sectionTitle} id={id}>
          {title}
        </h2>
        {note && <p className={styles.sectionNote}>{note}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * An empty state names what will be here and offers the action that puts it
 * there. It never apologises and never says "no data".
 */
export function EmptyState({
  title,
  children,
  action,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyText}>
        {title && <p className={styles.emptyTitle}>{title}</p>}
        {children}
      </div>
      {action}
    </div>
  );
}

/** A panel in the instrument rail: a label, some readings, an optional note. */
export function RailPanel({
  label,
  children,
  note,
}: {
  label: string;
  children: ReactNode;
  note?: ReactNode;
}) {
  return (
    <section className={styles.railPanel}>
      <h2 className={styles.railLabel}>{label}</h2>
      {children}
      {note && <p className={styles.railNote}>{note}</p>}
    </section>
  );
}

export function RailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={styles.railRow}>
      <span>{label}</span>
      <span className={styles.railValue}>{value}</span>
    </div>
  );
}

/** Placeholder in the shape of the content it stands in for. */
export function Skeleton({
  width = "100%",
  height,
}: {
  width?: string;
  height?: string;
}) {
  return (
    <span
      className={height ? styles.skeleton : styles.skeletonLine}
      style={{ width, ...(height ? { height, display: "block" } : {}) }}
      aria-hidden="true"
    />
  );
}
