import Link from "next/link";
import styles from "./page.module.css";

/**
 * The landing page has one job: make the loop obvious to someone who has never
 * heard of a decision journal, before they scroll.
 *
 * It opens with the argument as an object rather than a claim — the same
 * decision, as it was sealed and as it would be remembered — because the gap
 * between those two panels is the entire reason the product exists.
 */

const STEPS = [
  {
    ordinal: "Step 1",
    title: "Write down what you expect",
    body: "The decision, the outcome you are predicting, and a number between 1 and 99 for how likely you think it is. It takes about a minute.",
  },
  {
    ordinal: "Step 2",
    title: "Lock it, and pick a date",
    body: "The prediction is sealed and fingerprinted. Nothing can edit it afterwards — not you, not us. You choose when it should come back.",
  },
  {
    ordinal: "Step 3",
    title: "Say what actually happened",
    body: "On the date you chose, the decision returns with your original words still on it. Record the outcome, and the score follows from there.",
  },
];

export default function LandingPage() {
  return (
    <div className={styles.shell}>
      <header className={styles.masthead}>
        <Link href="/" className={styles.wordmark}>
          <span className={styles.wordmarkTick} aria-hidden="true" />
          Hindsight
        </Link>
        <nav className={styles.mastheadLinks} aria-label="Primary">
          <Link href="/demo">Sample journal</Link>
          <Link href="/how-scoring-works">How scoring works</Link>
          <Link href="/sign-in">Sign in</Link>
        </nav>
      </header>

      <main id="main" className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1 className={styles.heroTitle}>
            You do not remember what you actually believed.
          </h1>
          <p className={styles.heroLead}>
            Memory quietly edits your old predictions to match how things turned out.
            Hindsight records the prediction while the answer is still unknown, seals it,
            and brings it back when the outcome is in — then measures how often your
            confidence was worth having.
          </p>
          <div className={styles.heroActions}>
            <Link href="/sign-in" className={styles.primaryAction}>
              Start a journal
            </Link>
            <Link href="/demo" className={styles.secondaryAction}>
              Look around a sample first
            </Link>
          </div>
        </div>

        <figure className={styles.specimen}>
          <figcaption className="visually-hidden">
            The same decision as it was recorded in March 2026 and as it would be
            remembered a year later. The recorded confidence was 85 percent; the outcome
            was that it did not happen.
          </figcaption>

          <div className={styles.specimenPane}>
            <div className={styles.specimenHead}>
              <span className={styles.specimenLabel}>What you recorded</span>
              <span className={styles.specimenLabel}>Career · Mar 2026</span>
            </div>
            <p className={styles.specimenQuote}>
              &ldquo;Taking the platform role will still look right to me in a
              year.&rdquo;
            </p>
            <div className={styles.specimenRow}>
              <span className={styles.specimenLabel}>Confidence</span>
              <span className={`${styles.specimenFigure} ${styles.figureBelief}`}>
                85%
              </span>
            </div>
            <p className={styles.specimenSeal}>
              <span className={styles.sealDot} aria-hidden="true" />
              Sealed 4f2a91c8 · locked, unedited
            </p>
          </div>

          <div className={styles.specimenDivider} aria-hidden="true" />

          <div className={`${styles.specimenPane} ${styles.specimenPaneRemembered}`}>
            <div className={styles.specimenHead}>
              <span className={styles.specimenLabel}>What you would remember</span>
              <span className={styles.specimenLabel}>Mar 2027</span>
            </div>
            <p className={`${styles.specimenQuote} ${styles.specimenQuoteFaded}`}>
              &ldquo;I had my doubts about that one from the start.&rdquo;
            </p>
            <div className={styles.specimenRow}>
              <span className={styles.specimenLabel}>Recalled confidence</span>
              <span className={`${styles.specimenFigure} ${styles.figureFaint}`}>
                ~60%
              </span>
            </div>
            <p className={styles.specimenNote}>
              The role did not work out. The doubt is real, and it arrived afterwards.
              Without a record, that is not a distinction you can make.
            </p>
          </div>
        </figure>
      </main>

      <section className={styles.steps} aria-labelledby="loop-heading">
        <div className={styles.sectionHead}>
          <p className="eyebrow">The loop</p>
          <h2 id="loop-heading" className={styles.sectionTitle}>
            Three steps, then arithmetic
          </h2>
          <p className={styles.sectionLead}>
            Everything else in Hindsight follows from these. Log enough of them and the
            pattern in your own judgement becomes something you can read rather than
            something you assume.
          </p>
        </div>
        <ol className={styles.stepList}>
          {STEPS.map((step) => (
            <li key={step.ordinal} className={styles.step}>
              <span className={styles.stepOrdinal}>{step.ordinal}</span>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepBody}>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <p>Private by default. Your journal is visible only to you.</p>
          <nav className={styles.footerLinks} aria-label="Footer">
            <Link href="/demo">Sample journal</Link>
            <Link href="/how-scoring-works">How scoring works</Link>
            <a href="https://github.com/imSuvro/hindsight">Source</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
