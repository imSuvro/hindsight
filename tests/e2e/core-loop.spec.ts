import { expect, test } from "@playwright/test";
import { lockDecision, signUp } from "./support";

/**
 * The loop the product exists for: write it down, seal it, come back, record
 * what happened, watch the score move.
 */
test.describe("the core loop", () => {
  test("locks a decision and shows it sealed", async ({ page }) => {
    await signUp(page);

    const url = await lockDecision(page, {
      title: "Moving the scheduler out of the app",
      situation: "The in-app cron keeps drifting by half an hour.",
      expected: "Reminders land within an hour of the time I asked for",
      confidence: 78,
    });

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Moving the scheduler out of the app",
    );
    await expect(page.getByText("78%")).toBeVisible();
    await expect(page.getByText(/Sealed as/)).toBeVisible();
    expect(url).toMatch(/\/decisions\/[A-Za-z0-9_-]{16}$/);
  });

  test("carries the prediction through to the outcome unchanged", async ({ page }) => {
    await signUp(page);
    await lockDecision(page, {
      title: "Dropping the legacy API",
      expected: "We lose no more than one customer",
      confidence: 64,
    });

    // A decision with a future review date is not offered for resolution.
    await expect(page.getByRole("heading", { name: /Comes back/ })).toBeVisible();
    await expect(page.getByText("64%")).toBeVisible();
  });

  test("refuses a review date in the past", async ({ page }) => {
    await signUp(page);
    await page.goto("/decisions/new");

    const date = page.getByLabel("When should this come back?");
    await date.fill("2020-01-01");

    // The browser refuses it before anything is submitted, because the field
    // will not accept a date earlier than tomorrow. The server checks the same
    // thing independently — a form post is not trusted to have obeyed this.
    const state = await date.evaluate((element: HTMLInputElement) => ({
      valid: element.validity.valid,
      rangeUnderflow: element.validity.rangeUnderflow,
      min: element.min,
    }));
    expect(state.valid).toBe(false);
    expect(state.rangeUnderflow).toBe(true);
    expect(Date.parse(state.min)).toBeGreaterThan(Date.now());
  });

  test("shows the journal and the review queue", async ({ page }) => {
    await signUp(page);
    await lockDecision(page, {
      title: "Cutting the roadmap to four items",
      expected: "We ship all four",
      confidence: 71,
    });

    await page.goto("/decisions");
    await expect(
      page.getByRole("heading", { name: "Cutting the roadmap to four items" }),
    ).toBeVisible();

    await page.goto("/review");
    await expect(page.getByRole("heading", { name: "Ready for review" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Cutting the roadmap to four items" }),
    ).toBeVisible();
  });

  test("moves a review date and records the move", async ({ page }) => {
    await signUp(page);
    await lockDecision(page, {
      title: "Backing the design system rewrite",
      expected: "Adoption passes 60%",
      confidence: 55,
    });

    await page.getByRole("button", { name: /Not ready yet/ }).click();
    await page.getByRole("button", { name: "In a year" }).click();
    await page.getByRole("button", { name: "Move the review date" }).click();

    await expect(page.getByText(/moved 1 time/)).toBeVisible();
    // The prediction itself is untouched by the move.
    await expect(page.getByText("55%")).toBeVisible();
  });

  test("keeps the calibration figures hidden until they mean something", async ({
    page,
  }) => {
    await signUp(page);
    await lockDecision(page, {
      title: "Taking the platform role",
      expected: "Still glad in a year",
      confidence: 82,
    });

    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Not enough yet to say anything true" }),
    ).toBeVisible();
    await expect(page.getByText("0/10")).toBeVisible();
    await expect(page.getByText(/Brier score/)).toBeHidden();
  });
});
