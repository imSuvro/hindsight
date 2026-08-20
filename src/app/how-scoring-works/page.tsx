import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { CALIBRATION_THRESHOLDS } from "@/lib/domain/calibration";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "How scoring works",
  description:
    "The scoring rule Hindsight uses, why it was chosen, and the point at which it refuses to show you a number.",
};

/**
 * The methodology, in the open.
 *
 * A product that tells someone how good their judgement is owes them the
 * ability to check the claim. This page is the user-facing half of ADR-0003;
 * the repository carries the rest, including the tests.
 */
export default function HowScoringWorksPage() {
  return (
    <PageShell title="How scoring works">
      <article className={styles.article}>
        <p className={styles.standfirst}>
          Hindsight tells you how good your judgement is. That is a strong claim, so here
          is exactly how the number is produced, what it can and cannot tell you, and the
          point at which the product refuses to tell you anything at all.
        </p>

        <section aria-labelledby="rule">
          <h2 id="rule" className={styles.heading}>
            The rule: squared error, averaged
          </h2>
          <p>
            Every resolved decision contributes the square of the gap between what you
            said and what happened. Say 80% and it happens, and you contribute{" "}
            <span className={styles.mono}>(0.8 − 1)² = 0.04</span>. Say 80% and it does
            not, and you contribute <span className={styles.mono}>(0.8 − 0)² = 0.64</span>
            . Your score is the average across everything you have resolved.
          </p>
          <p>
            This is the <strong>Brier score</strong>. Lower is better. Zero is perfect.{" "}
            <strong>0.25 is what you would score by answering 50% to everything</strong>,
            which is the number worth holding on to — it is the line between forecasting
            and shrugging.
          </p>
        </section>

        <section aria-labelledby="proper">
          <h2 id="proper" className={styles.heading}>
            Why this rule and not a friendlier one
          </h2>
          <p>
            The Brier score is <strong>strictly proper</strong>, which means the only way
            to make your expected score as good as possible is to state the probability
            you actually believe. Shading your numbers to look better cannot work — not
            because we would catch you, but because the arithmetic does not reward it.
          </p>
          <p>
            That property is the whole reason a scoring rule was chosen rather than
            invented. A rule that could be gamed would quietly teach people to game it,
            and then the thing being measured would no longer be their judgement.
          </p>
          <p className={styles.aside}>
            Two rules were considered and rejected. The logarithmic score is also proper,
            but its penalty runs away to infinity as a confident forecast approaches being
            wrong, so one badly-missed 99% would swamp a decade of careful thinking.
            &ldquo;Percent correct&rdquo; is not proper at all: it rewards saying 51%
            about everything you think is more likely than not, which is precisely the
            habit this product exists to cure.
          </p>
        </section>

        <section aria-labelledby="curve">
          <h2 id="curve" className={styles.heading}>
            The curve: are your 80%s really 80%?
          </h2>
          <p>
            The single score tells you how well you did. The reliability diagram tells you{" "}
            <em>how</em> you are wrong, which is more useful. It groups your decisions by
            the confidence you stated and plots, for each group, how often things actually
            went that way.
          </p>
          <p>
            If you are well calibrated, the points sit on the diagonal: the things you
            were 70% sure of happened about 70% of the time. Points below the line mean
            confidence ran ahead of reality. Points above it mean you were more right than
            you let yourself believe.
          </p>
          <p>
            Each point carries a vertical bar. That is a{" "}
            <strong>95% Wilson interval</strong> — the range of true frequencies that
            would plausibly produce what you observed. It is wide when a point rests on
            five decisions and narrow when it rests on fifty, because those two situations
            mean very different things and a chart that drew them the same way would be
            lying by omission.
          </p>
        </section>

        <section aria-labelledby="thresholds">
          <h2 id="thresholds" className={styles.heading}>
            When the product says nothing
          </h2>
          <p>
            A calibration curve drawn from four decisions is not a weak signal. It is an
            invented one. So there are thresholds, and below them you see your individual
            decisions and a count of how far off you are — not a faded number or a
            provisional estimate.
          </p>
          <ul className={styles.thresholds}>
            <li>
              <span className={styles.mono}>{CALIBRATION_THRESHOLDS.headline}</span>{" "}
              resolved decisions before any overall score or the curve
            </li>
            <li>
              <span className={styles.mono}>{CALIBRATION_THRESHOLDS.decomposition}</span>{" "}
              before the skill score and the calibration breakdown
            </li>
            <li>
              <span className={styles.mono}>{CALIBRATION_THRESHOLDS.domain}</span> within
              a single domain before that domain gets a figure
            </li>
          </ul>
          <p>
            Decisions you close as <em>could not be settled</em> are excluded from every
            figure and reported as their own count. They are never quietly folded in,
            because the ones that get murky are disproportionately the ones that went
            badly, and dropping them silently would flatter everybody.
          </p>
        </section>

        <section aria-labelledby="limits">
          <h2 id="limits" className={styles.heading}>
            What this cannot tell you
          </h2>
          <p>
            It cannot tell you whether a decision was <em>good</em>. A well-made decision
            can turn out badly and a reckless one can turn out fine; outcomes are noisy
            and one of them is never evidence about the thinking behind it. What
            accumulates over dozens of decisions is evidence about your{" "}
            <em>confidence</em> — whether the feeling of being sure means anything when
            you have it.
          </p>
          <p>
            It also cannot tell whether you were honest with yourself when you typed the
            number. Nothing can. The product only guarantees that whatever you typed is
            still exactly what you typed.
          </p>
        </section>

        <section aria-labelledby="check">
          <h2 id="check" className={styles.heading}>
            Checking any of this
          </h2>
          <p>
            The arithmetic lives in one small, dependency-free part of the codebase and is
            covered by property-based tests: the decomposition identity is asserted to
            twelve decimal places, the intervals are checked against an independent
            derivation, and there is a test demonstrating that stating your real belief
            beats shading it. The reasoning behind each choice is written up as an
            architecture decision record.
          </p>
          <p>
            <a href="https://github.com/imSuvro/hindsight/blob/main/docs/adr/0003-scoring-methodology.md">
              Read ADR-0003
            </a>{" "}
            or <Link href="/demo">look at a worked example</Link>.
          </p>
        </section>
      </article>
    </PageShell>
  );
}
