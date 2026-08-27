import { writeFileSync } from "node:fs";
import { type Page, test } from "@playwright/test";
import { lockDecision, signUp } from "./support";

/**
 * Not a test — a capture harness for the design audit.
 *
 * Walks every route at three widths, writes a screenshot per route per width,
 * and records every console message and page error it sees along the way. The
 * output is the evidence behind `design/AUDIT.md` and `design/REPORT.md`; the
 * `before` and `after` runs use the same code so the pairs are comparable.
 *
 *   AUDIT_PHASE=before pnpm exec playwright test audit-capture --project=desktop
 *
 * Skipped unless AUDIT_PHASE is set, so it never runs in CI.
 */

const PHASE = process.env.AUDIT_PHASE;

test.describe(() => {
  test.skip(!PHASE, "set AUDIT_PHASE=before|after to capture");
  test.describe.configure({ mode: "serial" });

  const WIDTHS = [
    { name: "360", width: 360, height: 780 },
    { name: "768", width: 768, height: 1024 },
    { name: "1440", width: 1440, height: 900 },
  ];

  type Problem = { route: string; width: string; kind: string; text: string };
  const problems: Problem[] = [];

  function watch(page: Page, route: string, width: string): void {
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        problems.push({
          route,
          width,
          kind: `console.${message.type()}`,
          text: message.text(),
        });
      }
    });
    page.on("pageerror", (error) => {
      problems.push({ route, width, kind: "pageerror", text: error.message });
    });
  }

  /** Screenshot one already-loaded page at all three widths. */
  async function shootAllWidths(page: Page, slug: string): Promise<void> {
    for (const size of WIDTHS) {
      await page.setViewportSize({ width: size.width, height: size.height });
      // Let the layout settle so the shot is not mid-reflow.
      await page.waitForTimeout(350);
      await page.screenshot({
        path: `design/audit/${PHASE}/${slug}-${size.name}.png`,
        fullPage: true,
      });
    }
  }

  async function capture(page: Page, route: string, slug: string): Promise<void> {
    watch(page, route, "all");
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    await shootAllWidths(page, slug);
  }

  test("public routes", async ({ page }) => {
    await capture(page, "/", "01-landing");
    await capture(page, "/sign-in", "02-sign-in");
    await capture(page, "/demo", "03-demo");
    await capture(page, "/how-scoring-works", "04-how-scoring-works");
  });

  test("authenticated routes, empty and populated", async ({ page }) => {
    await signUp(page);

    // Empty states first — a new account sees these, and they are where a
    // product either invites the first action or leaves you stranded.
    await capture(page, "/dashboard", "05-dashboard-empty");
    await capture(page, "/decisions", "06-decisions-empty");
    await capture(page, "/review", "07-review-empty");
    await capture(page, "/settings", "08-settings");

    // The form, and the confirmation step that precedes sealing.
    await page.setViewportSize({ width: 1440, height: 900 });
    await capture(page, "/decisions/new", "09-decision-new");

    await page.goto("/decisions/new");
    await page
      .getByLabel("What are you deciding?")
      .fill("Ship the redesign before the interview loop");
    await page
      .getByLabel(/What is the situation/)
      .fill("Three screens still look like scaffolding. Two weeks of evenings.");
    await page
      .getByLabel("What do you expect to happen?")
      .fill("All screens hold up in a portfolio walkthrough");
    await page.getByRole("button", { name: "Review before locking" }).click();
    await page.waitForTimeout(300);
    await shootAllWidths(page, "10-decision-confirm");

    // Populated states.
    const detailUrl = await lockDecision(page, {
      title: "Move the calibration chart above the fold",
      expected: "Time-to-first-insight drops for a first-time visitor",
      confidence: 72,
      situation: "The chart is the whole argument and it sits below three cards.",
    });
    await lockDecision(page, {
      title: "Keep the ledger verification link in the footer",
      expected: "Nobody clicks it but its presence is the point",
      confidence: 35,
    });
    await lockDecision(page, {
      title: "Write the empty states before the populated ones",
      expected: "Fewer rewrites later",
      confidence: 84,
    });

    await capture(page, "/dashboard", "11-dashboard-populated");
    await capture(page, "/decisions", "12-decisions-populated");
    await capture(page, detailUrl, "13-decision-detail");
  });

  test.afterAll(() => {
    const path = `design/audit/${PHASE}-console.md`;
    const lines = [
      `# Console output — ${PHASE} run`,
      "",
      problems.length === 0
        ? "No console errors, warnings, or page errors observed."
        : `${problems.length} message(s) observed:`,
      "",
      ...problems.map((p) => `- \`${p.kind}\` on **${p.route}** — ${p.text}`),
      "",
    ];
    // Written rather than echoed: the repository's lint allows only `warn` and
    // `error` on the console, and a capture summary is neither.
    writeFileSync(path, lines.join("\n"));
  });
});
