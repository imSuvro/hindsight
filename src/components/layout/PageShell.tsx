import Link from "next/link";
import type { ReactNode } from "react";
import { shortHash } from "@/lib/domain/chain";
import styles from "./PageShell.module.css";

/**
 * The frame every page inside the product sits in.
 *
 * The chain head is printed in the footer on purpose. It is the fingerprint of
 * the whole record, it appears in every review email and every export, and a
 * user who keeps any copy of it holds something the database cannot quietly
 * contradict later. See ADR-0002.
 */

export type NavItem = { href: string; label: string };

export const SIGNED_IN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/review", label: "Review" },
  { href: "/decisions", label: "Journal" },
  { href: "/practice", label: "Practice" },
  { href: "/settings", label: "Settings" },
];

export type PageShellProps = {
  children: ReactNode;
  nav?: NavItem[];
  currentPath?: string;
  title?: string;
  lead?: string;
  actions?: ReactNode;
  identity?: { name: string; image: string | null };
  sample?: boolean;
  chainHead?: { seq: number; hash: string } | null;
  /**
   * The instrument rail — the current reading, alongside the work. Supplying
   * it switches the page onto the two-column chart layout; omitting it leaves
   * a single column. See DESIGN.md § Layout.
   */
  rail?: ReactNode;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => part[0] ?? "").join("");
  return letters.toUpperCase() || "?";
}

export function PageShell({
  children,
  nav = [],
  currentPath,
  title,
  lead,
  actions,
  identity,
  sample = false,
  chainHead = null,
  rail,
}: PageShellProps) {
  return (
    <div className={styles.shell}>
      <header className={styles.masthead}>
        <div className={styles.mastheadInner}>
          <Link href={identity ? "/dashboard" : "/"} className={styles.wordmark}>
            <span className={styles.wordmarkTick} aria-hidden="true" />
            Hindsight
          </Link>

          {nav.length > 0 && (
            <nav className={styles.nav} aria-label="Primary">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navLink} ${currentPath === item.href ? styles.navLinkActive : ""}`}
                  aria-current={currentPath === item.href ? "page" : undefined}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}

          {identity ? (
            <div className={styles.identity}>
              {identity.image ? (
                /* Avatars come straight from the identity provider at a fixed
                   26px. Routing them through the optimiser would add a round
                   trip and consume an image quota for no visible gain. */
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className={styles.avatar}
                  src={identity.image}
                  alt=""
                  width={26}
                  height={26}
                />
              ) : (
                <span className={styles.avatarFallback} aria-hidden="true">
                  {initials(identity.name)}
                </span>
              )}
              <span className="visually-hidden">Signed in as {identity.name}</span>
            </div>
          ) : (
            <nav className={styles.nav} aria-label="Account">
              <Link href="/sign-in" className={styles.navLink}>
                Sign in
              </Link>
            </nav>
          )}
        </div>
      </header>

      {sample && (
        <div className={styles.sampleBand}>
          <p className={styles.sampleBandInner}>
            <span className={styles.sampleTag}>Sample journal</span>
            <span>
              Invented decisions belonging to nobody, frozen at 1 August 2026. Nothing
              here is saved and nothing you do changes it.
            </span>
          </p>
        </div>
      )}

      <main id="main" className={styles.main}>
        {(title || actions) && (
          <div className={styles.pageHead}>
            <div>
              {title && <h1 className={styles.pageTitle}>{title}</h1>}
              {lead && <p className={styles.pageLead}>{lead}</p>}
            </div>
            {actions}
          </div>
        )}
        {rail ? (
          <div className={styles.withRail}>
            <div className={styles.column}>{children}</div>
            <aside className={styles.rail} aria-label="Current reading">
              {rail}
            </aside>
          </div>
        ) : (
          children
        )}
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          {chainHead ? (
            <span className={styles.seal}>
              <span className={styles.sealDot} aria-hidden="true" />
              Record fingerprint {shortHash(chainHead.hash)} · {chainHead.seq}{" "}
              {chainHead.seq === 1 ? "entry" : "entries"}
            </span>
          ) : (
            <span>Private by default. Your journal is visible only to you.</span>
          )}
          <nav className={styles.footerLinks} aria-label="Footer">
            <Link href="/how-scoring-works">How scoring works</Link>
            {!identity && <Link href="/demo">Sample journal</Link>}
            <a href="https://github.com/imSuvro/hindsight">Source</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
