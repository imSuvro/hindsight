import { genesisPrevHash, sealEntry } from "@/lib/domain/chain";
import { rebuildDecisions } from "@/lib/domain/rebuild";
import type {
  DecisionView,
  Domain,
  LedgerEntry,
  Outcome,
  UnsealedLedgerEntry,
} from "@/lib/schemas/domain";

/**
 * A sample journal, so the product can be understood before anyone commits a
 * real decision to it.
 *
 * It is built from actual ledger entries, sealed by the same hashing code the
 * live path uses and folded into decisions by the same function. That is not
 * ceremony: it means the demo cannot drift away from how the product really
 * behaves, and the record-verification page can be demonstrated on it honestly.
 *
 * Everything is anchored to a fixed instant so the sample never shifts under
 * anyone. The interface labels it plainly as a sample rather than implying it
 * is someone's real record.
 */

export const DEMO_USER_ID = "sample-journal";
export const DEMO_NOW = Date.parse("2026-08-01T09:00:00Z");
const DEMO_ZONE = "Europe/London";
const DAY = 86_400_000;

type DemoSpec = {
  title: string;
  situation: string;
  expected: string;
  confidence: number;
  domain: Domain;
  tags: string[];
  /** Days before the anchor instant that the decision was locked. */
  lockedAgo: number;
  /** Days before the anchor instant it came up for review. Negative is future. */
  reviewAgo: number;
  outcome?: Outcome;
  notes?: string;
  rescheduledTo?: number;
};

/**
 * The pattern in this sample is the one most people actually have: roughly
 * honest when unsure, increasingly optimistic as confidence rises. It is what
 * makes the diagram worth looking at.
 */
const SPECS: DemoSpec[] = [
  {
    title: "Rewriting the billing service in Go",
    situation:
      "The Node service is fine but the team keeps citing performance. I think the real problem is the query pattern.",
    expected: "The rewrite ships and p99 latency improves by less than 20%",
    confidence: 90,
    domain: "technical",
    tags: ["architecture"],
    lockedAgo: 400,
    reviewAgo: 220,
    outcome: "happened",
    notes:
      "Shipped six weeks late. p99 moved 11%. The index we added in week two did most of it.",
  },
  {
    title: "Hiring Marta over the other finalist",
    situation: "Stronger on systems, weaker on communication. The team is already quiet.",
    expected: "She is still here and rated well after a year",
    confidence: 90,
    domain: "people",
    tags: ["hiring"],
    lockedAgo: 395,
    reviewAgo: 30,
    outcome: "happened",
    notes:
      "Best hire of the year. The communication worry never materialised once she had context.",
  },
  {
    title: "Declining the contract in favour of the salaried role",
    situation: "The contract pays 40% more but ends in nine months.",
    expected: "I will think this was the right call twelve months on",
    confidence: 90,
    domain: "career",
    tags: [],
    lockedAgo: 380,
    reviewAgo: 15,
    outcome: "did_not_happen",
    notes:
      "The stability I was buying did not arrive. Reorg in month four put me on a team I would not have chosen.",
  },
  {
    title: "Moving the standup to async",
    situation: "Three time zones and everyone dreads the call.",
    expected: "The team keeps it async after a month rather than reverting",
    confidence: 90,
    domain: "people",
    tags: ["process"],
    lockedAgo: 300,
    reviewAgo: 265,
    outcome: "did_not_happen",
    notes:
      "Reverted in three weeks. People wanted the contact more than they wanted the time back.",
  },
  {
    title: "Putting the emergency fund into an index tracker",
    situation: "Rates have peaked and the cash is losing to inflation.",
    expected: "I do not need to touch it within eighteen months",
    confidence: 85,
    domain: "financial",
    tags: [],
    lockedAgo: 360,
    reviewAgo: 45,
    outcome: "did_not_happen",
    notes:
      "Boiler failed in month seven. Sold at a small loss. The point of an emergency fund is that emergencies are not forecastable.",
  },
  {
    title: "Turning down the conference talk",
    situation: "Three weeks of prep during a release cycle.",
    expected: "I will not regret saying no",
    confidence: 85,
    domain: "career",
    tags: [],
    lockedAgo: 340,
    reviewAgo: 160,
    outcome: "happened",
    notes: "The release slipped anyway and I would have been underwater. No regret.",
  },
  {
    title: "Migrating the monolith database to a managed service",
    situation: "We spend about a day a week on database operations.",
    expected: "The migration finishes inside the quarter",
    confidence: 70,
    domain: "technical",
    tags: ["infrastructure"],
    lockedAgo: 330,
    reviewAgo: 240,
    outcome: "did_not_happen",
    notes:
      "Two quarters. The unknown was never the data, it was the four services nobody documented.",
  },
  {
    title: "Cutting the side project to one evening a week",
    situation: "It is eating the time I keep saying I want for running.",
    expected: "I actually hold to one evening for three months",
    confidence: 65,
    domain: "personal",
    tags: ["habits"],
    lockedAgo: 320,
    reviewAgo: 230,
    outcome: "did_not_happen",
    notes:
      "Held it for five weeks. Went back to three evenings the moment something got interesting.",
  },
  {
    title: "Fixing the mortgage rate for five years",
    situation:
      "Trackers are cheaper today and the spread is the narrowest I have seen it.",
    expected: "I am comfortable with the fix a year in",
    confidence: 90,
    domain: "financial",
    tags: ["property"],
    lockedAgo: 355,
    reviewAgo: 55,
    outcome: "happened",
    notes:
      "Rates moved against the tracker within four months. Sleeping well was the point and I am.",
  },
  {
    title: "Booking the trip before the schedule cleared",
    situation: "Flights double in six weeks. Nothing is confirmed at work.",
    expected: "I actually go, without rearranging anything important",
    confidence: 90,
    domain: "personal",
    tags: [],
    lockedAgo: 345,
    reviewAgo: 205,
    outcome: "happened",
    notes: "Went. The thing I was worried about clashing with moved on its own.",
  },
  {
    title: "Asking for the staff engineer promotion this cycle",
    situation:
      "My manager thinks I should wait a cycle. I think the scope is already there.",
    expected: "The promotion goes through this cycle",
    confidence: 80,
    domain: "career",
    tags: ["promotion"],
    lockedAgo: 300,
    reviewAgo: 210,
    outcome: "did_not_happen",
    notes:
      "Deferred, and the feedback was about visibility rather than scope. My manager was reading something I was not.",
  },
  {
    title: "Buying the flat in Walthamstow",
    situation: "Above budget, but the alternative is another year of renting.",
    expected: "I am glad about it a year later",
    confidence: 80,
    domain: "financial",
    tags: ["property"],
    lockedAgo: 290,
    reviewAgo: 20,
    outcome: "happened",
    notes: "Yes. The commute is worse than I modelled and it still does not matter.",
  },
  {
    title: "Dropping support for the legacy API",
    situation: "Four customers still on it, all small, all warned twice.",
    expected: "We lose no more than one of them",
    confidence: 80,
    domain: "technical",
    tags: ["api"],
    lockedAgo: 280,
    reviewAgo: 190,
    outcome: "happened",
    notes: "Lost one, and they came back three months later on the new API.",
  },
  {
    title: "Taking the six-week sabbatical",
    situation: "Unpaid, and the timing is bad for the team.",
    expected: "I come back with more energy than I left with",
    confidence: 80,
    domain: "personal",
    tags: [],
    lockedAgo: 260,
    reviewAgo: 175,
    outcome: "happened",
    notes: "Took four weeks to stop checking Slack. The last two were the point.",
  },
  {
    title: "Letting the junior lead the payments integration",
    situation: "Stretch assignment. I would be faster doing it myself.",
    expected: "It ships without me having to take it back",
    confidence: 75,
    domain: "people",
    tags: ["delegation"],
    lockedAgo: 250,
    reviewAgo: 165,
    outcome: "happened",
    notes:
      "Two weeks slower than I would have been, and now there are two of us who understand it.",
  },
  {
    title: "Switching the team to trunk-based development",
    situation: "Long-lived branches are causing most of our merge pain.",
    expected: "Merge conflicts drop noticeably within two months",
    confidence: 75,
    domain: "technical",
    tags: ["process"],
    lockedAgo: 240,
    reviewAgo: 150,
    outcome: "happened",
    notes: "Immediately and obviously better. Should have done it a year earlier.",
  },
  {
    title: "Saying yes to mentoring two people at once",
    situation: "I have said yes to one before and it was manageable.",
    expected: "Both relationships are still active after six months",
    confidence: 70,
    domain: "people",
    tags: ["mentoring"],
    lockedAgo: 230,
    reviewAgo: 45,
    outcome: "did_not_happen",
    notes:
      "One faded by month three. Not enough of me to go round, and I noticed too late.",
  },
  {
    title: "Renegotiating the contractor rate rather than accepting the cut",
    situation: "They opened at 15% below last year. I think there is room.",
    expected: "I land within 5% of last year's rate",
    confidence: 70,
    domain: "financial",
    tags: [],
    lockedAgo: 220,
    reviewAgo: 190,
    outcome: "happened",
    notes:
      "Settled at 3% down. They moved on the first counter, which suggests I opened too low.",
  },
  {
    title: "Running the half marathon without a training plan",
    situation: "I run four times a week already, just not to a structure.",
    expected: "I finish under two hours",
    confidence: 70,
    domain: "personal",
    tags: ["running"],
    lockedAgo: 200,
    reviewAgo: 120,
    outcome: "did_not_happen",
    notes: "2:07. Base fitness is not the same as race fitness and I knew that.",
  },
  {
    title: "Introducing a formal RFC process",
    situation: "Decisions keep getting relitigated because nobody wrote them down.",
    expected: "At least four RFCs are written in the first quarter",
    confidence: 70,
    domain: "technical",
    tags: ["process"],
    lockedAgo: 190,
    reviewAgo: 100,
    outcome: "happened",
    notes: "Seven. The relitigating mostly stopped, which was the actual goal.",
  },
  {
    title: "Recommending we buy rather than build the search layer",
    situation: "Building it is more interesting and I am aware that is a bias.",
    expected: "Buying looks correct to the team a year later",
    confidence: 70,
    domain: "technical",
    tags: ["build-vs-buy"],
    lockedAgo: 180,
    reviewAgo: 25,
    outcome: "happened",
    notes:
      "Nobody has suggested building it since. The bill is annoying and much cheaper than the engineers would have been.",
  },
  {
    title: "Moving my parents' savings out of the managed fund",
    situation: "The fees are high but they trust the adviser and I am not their adviser.",
    expected: "They actually make the switch",
    confidence: 60,
    domain: "financial",
    tags: ["family"],
    lockedAgo: 170,
    reviewAgo: 80,
    outcome: "did_not_happen",
    notes:
      "They did not, and I think that was reasonable. I was optimising a number they were not optimising.",
  },
  {
    title: "Asking for a four-day week",
    situation: "No precedent on the team. The work is measurable.",
    expected: "It is approved in some form",
    confidence: 60,
    domain: "career",
    tags: [],
    lockedAgo: 160,
    reviewAgo: 70,
    outcome: "happened",
    notes:
      "Approved as a six-month trial. The precedent argument turned out to be the thing they wanted solved.",
  },
  {
    title: "Doing the difficult conversation over video rather than in writing",
    situation: "Writing gives me control. Video gives them room to respond.",
    expected: "The relationship is intact afterwards",
    confidence: 55,
    domain: "people",
    tags: [],
    lockedAgo: 150,
    reviewAgo: 60,
    outcome: "happened",
    notes: "Better than intact. The bit I was dreading was the bit that helped.",
  },
  {
    title: "Backing the design system rewrite",
    situation: "Genuinely split. Half the team thinks it is the only way forward.",
    expected: "Component adoption passes 60% within two quarters",
    confidence: 55,
    domain: "technical",
    tags: ["design-system"],
    lockedAgo: 140,
    reviewAgo: 40,
    outcome: "did_not_happen",
    notes: "About 35%. The rewrite was fine. The migration was nobody's job.",
  },
  {
    title: "Whether the reorg improves how fast we ship",
    situation: "Three teams becoming two. Announced as a speed play.",
    expected: "Median cycle time falls within six months",
    confidence: 45,
    domain: "career",
    tags: ["reorg"],
    lockedAgo: 210,
    reviewAgo: 30,
    outcome: "unresolvable",
    notes:
      "We changed how cycle time was measured in the same quarter. There is no honest comparison to make.",
  },

  // Still open at the anchor instant: two due, two ahead.
  {
    title: "Turning down the manager track a second time",
    situation:
      "I said no eighteen months ago and the offer has come back with a bigger scope.",
    expected: "I still think this was right in a year",
    confidence: 65,
    domain: "career",
    tags: [],
    lockedAgo: 120,
    reviewAgo: 5,
  },
  {
    title: "Cutting the roadmap from nine items to four",
    situation: "Everything is half-finished and the team cannot name a priority.",
    expected: "We ship all four rather than seven halves",
    confidence: 75,
    domain: "technical",
    tags: ["planning"],
    lockedAgo: 95,
    reviewAgo: 1,
  },
  {
    title: "Overpaying the mortgage instead of investing the difference",
    situation: "The maths favours investing. The sleep favours overpaying.",
    expected: "I am comfortable with the trade-off in a year",
    confidence: 70,
    domain: "financial",
    tags: [],
    lockedAgo: 60,
    reviewAgo: -180,
  },
  {
    title: "Learning to swim properly at thirty-eight",
    situation: "I have avoided this for twenty years and it has stopped being funny.",
    expected: "I can swim 400m continuously",
    confidence: 60,
    domain: "personal",
    tags: ["habits"],
    lockedAgo: 20,
    reviewAgo: -140,
    rescheduledTo: -230,
  },
];

function localOf(instant: number): { date: string; time: string; timeZone: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DEMO_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
    timeZone: DEMO_ZONE,
  };
}

/** Deterministic ids: the sample must be byte-identical on every render. */
function demoId(index: number): string {
  return `demo${String(index).padStart(12, "0")}`;
}

function buildChain(): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  let prevHash = genesisPrevHash(DEMO_USER_ID);
  let seq = 0;

  const append = (
    draft: Omit<UnsealedLedgerEntry, "userId" | "seq" | "prevHash">,
  ): void => {
    seq += 1;
    const sealed = sealEntry({
      ...draft,
      userId: DEMO_USER_ID,
      seq,
      prevHash,
    } as UnsealedLedgerEntry);
    entries.push(sealed);
    prevHash = sealed.hash;
  };

  // Locks first, in the order they were made, then the later events — the same
  // interleaving a real journal produces.
  const ordered = [...SPECS]
    .map((spec, index) => ({ spec, decisionId: demoId(index) }))
    .sort((a, b) => b.spec.lockedAgo - a.spec.lockedAgo);

  const followUps: Array<{
    at: number;
    run: () => void;
  }> = [];

  for (const { spec, decisionId } of ordered) {
    const lockedAt = DEMO_NOW - spec.lockedAgo * DAY;
    const reviewAt = DEMO_NOW - spec.reviewAgo * DAY;
    append({
      type: "decision_locked",
      at: lockedAt,
      payload: {
        decisionId,
        title: spec.title,
        situation: spec.situation,
        expectedOutcome: spec.expected,
        confidence: spec.confidence,
        domain: spec.domain,
        tags: [...spec.tags].sort(),
        reviewAt,
        reviewLocal: localOf(reviewAt),
      },
    });

    if (spec.rescheduledTo !== undefined) {
      const movedTo = DEMO_NOW - spec.rescheduledTo * DAY;
      const movedAt = reviewAt;
      followUps.push({
        at: movedAt,
        run: () =>
          append({
            type: "review_rescheduled",
            at: movedAt,
            payload: {
              decisionId,
              reviewAt: movedTo,
              reviewLocal: localOf(movedTo),
            },
          }),
      });
    }

    if (spec.outcome) {
      const resolvedAt = reviewAt + DAY;
      followUps.push({
        at: resolvedAt,
        run: () =>
          append({
            type: "decision_resolved",
            at: resolvedAt,
            payload: {
              decisionId,
              outcome: spec.outcome as Outcome,
              notes: spec.notes ?? "",
            },
          }),
      });
    }
  }

  for (const followUp of followUps.sort((a, b) => a.at - b.at)) followUp.run();
  return entries;
}

let cachedChain: LedgerEntry[] | null = null;
let cachedDecisions: DecisionView[] | null = null;

export function demoChain(): LedgerEntry[] {
  cachedChain ??= buildChain();
  return cachedChain;
}

export function demoDecisions(): DecisionView[] {
  if (!cachedDecisions) {
    const { decisions } = rebuildDecisions(DEMO_USER_ID, demoChain());
    cachedDecisions = decisions;
  }
  return cachedDecisions;
}

export function demoHead(): { seq: number; hash: string } {
  const chain = demoChain();
  const last = chain[chain.length - 1];
  return { seq: last.seq, hash: last.hash };
}
