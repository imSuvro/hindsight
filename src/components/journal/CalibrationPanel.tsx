import { ReliabilityDiagram } from "@/components/charts/ReliabilityDiagram";
import { DivergingBar, ProportionBar } from "@/components/ui/Bar";
import type { CalibrationReport } from "@/lib/domain/calibration";
import { DOMAIN_LABELS } from "@/lib/schemas/domain";
import styles from "./CalibrationPanel.module.css";

/**
 * Everything the journal can honestly say about a person's judgement.
 *
 * The panel has two quite different modes, and the second one is the point.
 * Above the thresholds it shows the figures. Below them it shows how far off
 * they are and nothing else — no greyed-out estimate, no provisional curve with
 * an apology underneath. A product whose premise is that memory flatters you
 * cannot flatter you with statistics.
 */

const points = (value: number) => Math.round(Math.abs(value) * 100);
const percent = (value: number) => `${Math.round(value * 100)}%`;

function VerdictHeadline({ report }: { report: CalibrationReport }) {
  const tendency = report.tendency;
  if (!tendency) return null;

  if (tendency.direction === "calibrated") {
    return (
      <h2 className={styles.verdictHeadline}>
        Your confidence tracks what actually happens.
      </h2>
    );
  }

  const over = tendency.direction === "overconfident";
  return (
    <h2 className={styles.verdictHeadline}>
      Your confidence runs{" "}
      <span
        className={`${styles.verdictNumber} ${over ? styles.verdictOver : styles.verdictUnder}`}
      >
        {points(tendency.gap)} points
      </span>{" "}
      {over ? "hot" : "cold"}.
    </h2>
  );
}

function verdictBody(report: CalibrationReport): string {
  const tendency = report.tendency;
  if (!tendency) return "";
  const said = percent(tendency.meanForecast);
  const happened = percent(tendency.baseRate);

  if (tendency.direction === "calibrated") {
    return `Across ${report.counts.scored} resolved decisions you have said ${said} on average, and ${happened} of them went the way you expected. That is what being well calibrated looks like.`;
  }
  if (tendency.direction === "overconfident") {
    return `Across ${report.counts.scored} resolved decisions you have said ${said} on average, and ${happened} of them went the way you expected. You are more often sure than you are right.`;
  }
  return `Across ${report.counts.scored} resolved decisions you have said ${said} on average, and ${happened} of them went the way you expected. Things go your way more often than you let yourself expect.`;
}

function brierReading(brier: number): string {
  if (brier < 0.15) return "Well below the coin-flip baseline of 0.25.";
  if (brier < 0.25) return "Better than answering 50% to everything, which scores 0.25.";
  if (brier < 0.3) return "About what answering 50% to everything would score.";
  return "Worse than answering 50% to everything, which scores 0.25.";
}

function skillReading(skill: number): string {
  if (skill > 0.1)
    return "Better than knowing only how often things generally go your way.";
  if (skill > -0.05) return "About the same as knowing only your own base rate.";
  return "Below what your own base rate alone would achieve.";
}

function DomainBreakdown({ report }: { report: CalibrationReport }) {
  const anyScored = report.byDomain.some((domain) => domain.brier !== null);
  const anyLogged = report.byDomain.some((domain) => domain.logged > 0);

  /*
   * Before anything has been answered every cell in this table reads 0 or a
   * dash, and five rows of nothing is a poor thing to hand somebody on their
   * first week. The numbers are not hidden once they exist — this only stands
   * in while there is genuinely nothing to tabulate.
   */
  if (!anyScored) {
    return (
      <section className={styles.section} aria-labelledby="domains-heading">
        <h3 id="domains-heading" className={styles.sectionTitle}>
          Where you are sharper
        </h3>
        <p className={styles.sectionNote}>
          {anyLogged
            ? `Career, technical, financial, people and personal are scored separately, because being sharp about code says nothing about being sharp about people. Each needs ${report.thresholds.domain} answered decisions before it can say anything.`
            : `Every decision belongs to one of five parts of life, and each is scored on its own — being sharp about code says nothing about being sharp about people. A figure appears once a domain has ${report.thresholds.domain} answered decisions behind it.`}
        </p>
      </section>
    );
  }

  return (
    <section className={styles.section} aria-labelledby="domains-heading">
      <h3 id="domains-heading" className={styles.sectionTitle}>
        Where you are sharper
      </h3>
      <p className={styles.sectionNote}>
        {`A figure appears once a domain has ${report.thresholds.domain} resolved decisions behind it. Positive means confidence ran ahead of the outcome.`}
      </p>
      <div className={styles.domainScroll}>
        <table className={styles.domainTable}>
          <thead>
            <tr>
              <th scope="col">Domain</th>
              <th scope="col">Logged</th>
              <th scope="col">Scored</th>
              <th scope="col">Brier</th>
              <th scope="col">Confidence vs outcome</th>
            </tr>
          </thead>
          <tbody>
            {report.byDomain.map((domain) => {
              const gap = domain.gap;
              return (
                <tr key={domain.domain}>
                  <th scope="row" className={styles.domainName}>
                    {DOMAIN_LABELS[domain.domain]}
                  </th>
                  <td className={styles.domainNumber}>{domain.logged}</td>
                  <td className={styles.domainNumber}>{domain.scored}</td>
                  <td className={styles.domainNumber}>
                    {domain.brier === null ? "—" : domain.brier.toFixed(2)}
                  </td>
                  <td>
                    {gap === null ? (
                      <span className={styles.domainPending}>
                        {Math.max(report.thresholds.domain - domain.scored, 0)} more to go
                      </span>
                    ) : (
                      <DivergingBar
                        value={gap}
                        extent={0.5}
                        label={
                          Math.abs(gap) < 0.02
                            ? "On the line"
                            : `${points(gap)} points ${gap > 0 ? "over" : "under"}confident`
                        }
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function NotYet({ report }: { report: CalibrationReport }) {
  const unlock = report.nextUnlock;
  const target = report.thresholds.headline;
  const scored = report.counts.scored;

  return (
    <div className={styles.locked}>
      <div className={styles.lockedCopy}>
        <h2 className={styles.lockedTitle}>Not enough yet to say anything true</h2>
        <div className={styles.progressRow}>
          <span className={styles.progressCount}>
            {scored}/{target}
          </span>
          <span className={styles.progressLabel}>resolved decisions</span>
        </div>
        <ProportionBar
          value={scored / target}
          tone="reality"
          height={4}
          label={`${scored} of ${target} resolved decisions needed`}
        />
        <p className={styles.lockedBody}>
          A calibration curve drawn from a handful of decisions is not a weak signal, it
          is an invented one.{" "}
          {unlock
            ? `${unlock.remaining} more ${unlock.remaining === 1 ? "decision" : "decisions"} with an outcome recorded and you will see ${unlock.unlocks}.`
            : ""}{" "}
          Until then, every decision you have resolved is below, exactly as you wrote it.
        </p>
      </div>

      {/*
        The instrument, with nothing on it. Showing the empty frame rather than
        a paragraph means a new journal looks like the thing it will become —
        the audit found the signed-in dashboard reading as less capable than the
        sample journal shown before sign-up, which is the wrong way round. No
        data is plotted, so the display thresholds are untouched.
      */}
      <div className={styles.lockedFrame}>
        <ReliabilityDiagram bins={[]} scoredCount={scored} variant="frame" />
        <p className={styles.lockedFrameNote}>
          Your points will land here — what you said along the bottom, what happened up
          the side. The closer to the diagonal, the better your judgement was.
        </p>
      </div>
    </div>
  );
}

export function CalibrationPanel({ report }: { report: CalibrationReport }) {
  if (report.brier === null || report.tendency === null) {
    return (
      <div className={styles.panel}>
        <NotYet report={report} />
        <DomainBreakdown report={report} />
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.verdict}>
        <VerdictHeadline report={report} />
        <p className={styles.verdictBody}>{verdictBody(report)}</p>
      </div>

      <div className={styles.tiles}>
        <div className={styles.tile}>
          <span className={styles.tileLabel}>Brier score</span>
          <span className={styles.tileValue}>{report.brier.toFixed(3)}</span>
          <span className={styles.tileNote}>{brierReading(report.brier)}</span>
        </div>

        <div className={styles.tile}>
          <span className={styles.tileLabel}>Skill score</span>
          <span
            className={`${styles.tileValue} ${report.skillScore === null ? styles.tileValueMuted : ""}`}
          >
            {report.skillScore === null ? "—" : report.skillScore.toFixed(2)}
          </span>
          <span className={styles.tileNote}>
            {report.skillScore === null
              ? report.decomposition === null
                ? `Needs ${report.thresholds.decomposition} resolved decisions.`
                : "Every resolved decision went the same way, so there is nothing yet to be skilful about."
              : skillReading(report.skillScore)}
          </span>
        </div>

        <div className={styles.tile}>
          <span className={styles.tileLabel}>Calibration error</span>
          <span
            className={`${styles.tileValue} ${report.decomposition === null ? styles.tileValueMuted : ""}`}
          >
            {report.decomposition === null
              ? "—"
              : report.decomposition.reliability.toFixed(3)}
          </span>
          <span className={styles.tileNote}>
            {report.decomposition === null
              ? `Needs ${report.thresholds.decomposition} resolved decisions.`
              : "How far your stated confidence sits from what happened. Zero is perfect."}
          </span>
        </div>

        <div className={styles.tile}>
          <span className={styles.tileLabel}>Scored</span>
          <span className={styles.tileValue}>{report.counts.scored}</span>
          <span className={styles.tileNote}>
            {report.counts.unresolvable > 0
              ? `${report.counts.unresolvable} more could not be settled either way and are left out of every figure.`
              : "Every resolved decision had a definite outcome."}
          </span>
        </div>
      </div>

      <section className={styles.section} aria-labelledby="diagram-heading">
        <h3 id="diagram-heading" className={styles.sectionTitle}>
          Confidence against outcome
        </h3>
        <ReliabilityDiagram
          bins={report.bins}
          insight={report.insight}
          scoredCount={report.counts.scored}
        />
      </section>

      <DomainBreakdown report={report} />
    </div>
  );
}
