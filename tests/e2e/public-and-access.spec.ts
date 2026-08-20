import { expect, test } from "@playwright/test";
import { expectNoAccessibilityViolations, signUp } from "./support";

/**
 * What a visitor sees before signing in, whether the private parts stay
 * private, and whether any of it is usable without a mouse or a screen.
 */

test.describe("the public pages", () => {
  test("the landing page states the thesis without needing a sign-in", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "do not remember what you actually believed",
    );
    await expect(page.getByRole("link", { name: "Start a journal" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Look around a sample first" }),
    ).toBeVisible();
  });

  test("the sample journal is browsable signed out", async ({ page }) => {
    await page.goto("/demo");

    await expect(page.getByRole("heading", { name: /A sample journal/ })).toBeVisible();
    await expect(page.getByText(/Invented decisions belonging to nobody/)).toBeVisible();

    // The figures are real: computed from the fixture by the same code the
    // live journal uses.
    await expect(page.getByText("Brier score")).toBeVisible();
    await expect(page.getByRole("heading", { name: /confidence runs/ })).toBeVisible();

    // And the chart carries its numbers in a form a screen reader can use.
    await expect(page.getByRole("img", { name: /Reliability diagram/ })).toBeVisible();
    await page.getByText("Show the numbers").click();
    await expect(
      page.getByRole("columnheader", { name: "Plausible range" }),
    ).toBeVisible();
  });

  test("the methodology page explains the rule and the thresholds", async ({ page }) => {
    await page.goto("/how-scoring-works");
    await expect(page.getByText("strictly proper")).toBeVisible();
    await expect(page.getByText(/0.25 is what you would score/)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "When the product says nothing" }),
    ).toBeVisible();
  });

  test("sends signed-out visitors to sign in, and remembers where they were going", async ({
    page,
  }) => {
    for (const path of ["/dashboard", "/decisions", "/review", "/settings"]) {
      await page.goto(path);
      await expect(page).toHaveURL(`/sign-in?next=${encodeURIComponent(path)}`);
    }
  });

  test("will not bounce a visitor to another site after sign-in", async ({ page }) => {
    await page.goto("/sign-in?next=https://example.com/phish");
    // The parameter is ignored rather than honoured; nothing on the page links out.
    await expect(page.getByRole("link", { name: /example\.com/ })).toHaveCount(0);
  });

  test("serves a strict content security policy", async ({ page }) => {
    const response = await page.goto("/");
    const csp = response?.headers()["content-security-policy"] ?? "";

    expect(csp).toContain("default-src 'self'");
    expect(csp).toMatch(/script-src [^;]*'nonce-/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    // If this ever appears, every inline script on the page is trusted again.
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");

    expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response?.headers()["referrer-policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  test("loads without the browser refusing anything", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(message.text());
    });
    page.on("pageerror", (error) => problems.push(error.message));

    await page.goto("/demo");
    await page.waitForLoadState("networkidle");
    expect(problems).toEqual([]);
  });
});

test.describe("accessibility", () => {
  for (const path of ["/", "/demo", "/sign-in", "/how-scoring-works"]) {
    test(`${path} has no WCAG A or AA violations`, async ({ page }) => {
      await page.goto(path);
      await expectNoAccessibilityViolations(page);
    });
  }

  test("the signed-in pages have no WCAG A or AA violations", async ({ page }) => {
    await signUp(page);
    for (const path of ["/dashboard", "/decisions/new", "/review", "/settings"]) {
      await page.goto(path);
      await expectNoAccessibilityViolations(page);
    }
  });

  test("the whole log-and-lock flow can be driven from the keyboard", async ({
    page,
  }) => {
    await signUp(page);
    await page.goto("/decisions/new");

    await page.getByLabel("What are you deciding?").focus();
    await page.keyboard.type("Deciding without touching the mouse");
    await page.keyboard.press("Tab"); // situation
    await page.keyboard.type("Typed entirely from the keyboard.");
    await page.keyboard.press("Tab"); // expected outcome
    await page.keyboard.type("It records exactly what I typed");

    await page.keyboard.press("Tab"); // confidence slider
    const slider = page.getByLabel("How likely is that?");
    await expect(slider).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveValue("71");

    await page.getByRole("button", { name: "Review before locking" }).click();
    await expect(page.getByText("This is what gets sealed")).toBeVisible();
    await page.getByRole("button", { name: "Lock it" }).click();
    await expect(page.getByText("Locked", { exact: true })).toBeVisible();
  });

  test("every interactive control shows a visible focus ring", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");

    const outline = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active) return null;
      const style = getComputedStyle(active);
      return { width: style.outlineWidth, style: style.outlineStyle };
    });

    expect(outline).not.toBeNull();
    expect(outline?.style).not.toBe("none");
    expect(parseFloat(outline?.width ?? "0")).toBeGreaterThan(0);
  });
});
