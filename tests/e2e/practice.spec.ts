import { type Page, expect, test } from "@playwright/test";
import { signUp } from "./support";

/**
 * The calibration trainer, end to end.
 *
 * The promises worth proving through the interface: the answer is not in the
 * page before it is given, an answer can actually be recorded, and the reading
 * stays silent until it has grounds — the same refusal the journal makes, on
 * the trainer's own count.
 */

async function answerOne(page: Page, confidence?: number): Promise<void> {
  const options = page.locator("[aria-pressed]");
  await options.first().click();

  if (confidence !== undefined) {
    await page.getByLabel("How sure are you?").fill(String(confidence));
  }

  await page.getByRole("button", { name: "Lock it in" }).click();
  // The verdict names the outcome and the number that was staked on it.
  await expect(page.getByText(/^(Right|Wrong), and you said/)).toBeVisible();
}

test.describe("the calibration trainer", () => {
  test("asks a question without telling the browser the answer", async ({ page }) => {
    await signUp(page);
    await page.goto("/practice");

    await expect(page.getByText("How sure are you?")).toBeVisible();

    /*
     * The load-bearing check. If the answer were in the markup — in a data
     * attribute, a hidden field, or a serialised prop — the trainer would be
     * measuring whether the reader had opened dev tools.
     */
    const html = await page.content();
    expect(html).not.toContain("answerId");
  });

  test("records an answer and says whether it was right", async ({ page }) => {
    await signUp(page);
    await page.goto("/practice");

    await expect(page.getByText("1/20")).toBeVisible();
    await answerOne(page, 70);

    // Moving on advances the run rather than re-asking.
    await page.getByRole("button", { name: /Next question|See the reading/ }).click();
    await expect(page.getByText("2/20")).toBeVisible();
  });

  test("will not accept an answer until an option has been picked", async ({ page }) => {
    await signUp(page);
    await page.goto("/practice");

    const submit = page.getByRole("button", { name: "Lock it in" });
    await expect(submit).toBeDisabled();
    // Unavailable is not enough on its own; it has to say why.
    await expect(page.getByText(/Pick one of the two/)).toBeVisible();
  });

  test("says nothing about calibration until it has grounds", async ({ page }) => {
    await signUp(page);
    await page.goto("/practice");

    // A fresh account is far below the threshold, so the reading is a count
    // and an empty instrument, never a curve.
    await expect(page.getByText("What your practice says")).toBeVisible();
    await expect(
      page.getByText(/is not a weak signal, it is an invented one/),
    ).toBeVisible();
    await expect(page.getByText("0/20")).toBeVisible();
  });

  test("keeps the trainer's score out of the journal's", async ({ page }) => {
    await signUp(page);
    await page.goto("/practice");
    await answerOne(page, 90);

    // The journal counts decisions, not practice answers. One answered
    // question must not move the dashboard by a single entry.
    await page.goto("/dashboard");
    await expect(page.locator("body")).toContainText("Nothing recorded yet");
  });

  test("keeps you on the same question after answering it", async ({ page }) => {
    /*
     * Regression. The action used to revalidate the page, which re-ran the
     * server component and reseeded the session from the answer count — so
     * answering the first question silently replaced every remaining one and
     * left the reader looking at a verdict about a pair no longer on screen.
     */
    await signUp(page);
    await page.goto("/practice");

    const before = await page.locator("[aria-pressed]").allTextContents();
    await answerOne(page, 78);
    const after = await page.locator("[aria-pressed]").allTextContents();

    /*
     * Compare the names only. `allTextContents` runs the label and the figure
     * together with no separator once the answer is shown — "Uzbekistan35,652,307
     * people" — so everything from the first digit is dropped.
     */
    const names = (labels: string[]) =>
      labels.map((label) => label.replace(/\d[\s\S]*$/, "").trim());
    expect(names(after)).toEqual(names(before));
  });

  test("shows both figures once answered, so the verdict can be checked", async ({
    page,
  }) => {
    await signUp(page);
    await page.goto("/practice");
    await answerOne(page, 60);

    // Two figures, one per option, in the units the question was about.
    const options = page.locator("[aria-pressed]");
    await expect(options.first()).toContainText(/[\d,]+/);
    await expect(options.nth(1)).toContainText(/[\d,]+/);
  });

  test("names its source, so a doubted figure can be checked", async ({ page }) => {
    await signUp(page);
    await page.goto("/practice");
    await expect(page.getByText(/World Bank/)).toBeVisible();
  });
});
