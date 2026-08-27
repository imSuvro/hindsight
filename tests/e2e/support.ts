import AxeBuilder from "@axe-core/playwright";
import { type Page, expect } from "@playwright/test";

/**
 * Shared machinery for the end-to-end specs.
 *
 * Sign-in goes through Better Auth's real endpoints rather than a seeded
 * cookie, so the session handling under test is the same session handling that
 * ships. The email-and-password path exists only when `AUTH_TEST_MODE=1` and
 * the deployment is not production — see `src/lib/auth/test-mode.ts` and the
 * unit test that holds that gate shut.
 */

let counter = 0;

export function uniqueEmail(label: string): string {
  counter += 1;
  return `e2e-${label}-${Date.now()}-${counter}@example.test`;
}

const PASSWORD = "correct-horse-battery-staple";

/** Create an account and leave the browser signed into it. */
export async function signUp(page: Page, name = "Wren Adeyemi"): Promise<string> {
  const email = uniqueEmail("user");
  const response = await page.request.post("/api/auth/sign-up/email", {
    data: { name, email, password: PASSWORD },
  });
  expect(
    response.ok(),
    `sign-up failed: ${response.status()} ${await response.text()}`,
  ).toBe(true);
  return email;
}

/** Fill in the log-and-lock form and seal it. Returns the decision's URL. */
export async function lockDecision(
  page: Page,
  options: {
    title: string;
    expected: string;
    confidence?: number;
    situation?: string;
  },
): Promise<string> {
  await page.goto("/decisions/new");

  await page.getByLabel("What are you deciding?").fill(options.title);
  if (options.situation) {
    await page.getByLabel(/What is the situation/).fill(options.situation);
  }
  await page.getByLabel("What do you expect to happen?").fill(options.expected);

  if (options.confidence !== undefined) {
    const slider = page.getByLabel("How likely is that?");
    await slider.fill(String(options.confidence));
  }

  await page.getByRole("button", { name: "Review before locking" }).click();
  await expect(page.getByText("This is what gets sealed")).toBeVisible();
  await page.getByRole("button", { name: "Lock it" }).click();

  await expect(page.getByText("Locked", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "See it" }).click();
  await page.waitForURL(/\/decisions\/[A-Za-z0-9_-]{16}$/);
  return page.url();
}

/**
 * WCAG A and AA rules, run over whatever is currently on screen. Passing this
 * is the floor rather than the goal, but a regression here should fail a build.
 */
export async function expectNoAccessibilityViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const summary = results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? "unknown"}): ${violation.help}\n  ${violation.nodes
        .map((node) => node.target.join(" "))
        .join("\n  ")}`,
  );
  expect(summary, summary.join("\n\n")).toEqual([]);
}

/**
 * Bring a decision's review date forward into the past, so the review flow can
 * be driven through the interface.
 *
 * Review dates are forward-only in the form — correctly, since scheduling a
 * review for last Tuesday is meaningless. That leaves the second half of the
 * core loop unreachable in an end-to-end test: nothing can become due inside a
 * run that lasts seconds.
 *
 * This edits the materialised view and *not* the ledger. The ledger is the
 * record of what the user asserted and must stay untouched by test scaffolding.
 *
 * **It therefore makes `/api/ledger/verify` report a `projection` problem, by
 * design.** `auditRecord` rebuilds the decisions from the chain and diffs them
 * against what is stored, so a view edited behind the ledger's back is exactly
 * what it exists to catch — a stronger guarantee than the chain check alone,
 * and one worth knowing about. Specs using this helper must not assert an
 * intact record; they assert that no problem is of kind `chain`, which isolates
 * the claim under test from the fixture's known side effect.
 */
export async function makeDue(decisionId: string): Promise<void> {
  const { MongoClient } = await import("mongodb");
  const uri = (await import("node:fs")).readFileSync(".e2e/mongo-uri", "utf8").trim();
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const result = await client
      .db()
      .collection("decisions")
      .updateOne(
        { _id: decisionId as never },
        { $set: { reviewAt: Date.now() - 60_000 } },
      );
    if (result.matchedCount !== 1) {
      throw new Error(
        `makeDue matched ${result.matchedCount} decisions for ${decisionId}`,
      );
    }
  } finally {
    await client.close();
  }
}
