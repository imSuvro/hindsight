import { type ConsoleMessage, type Page, expect, test } from "@playwright/test";
import { signUp } from "./support";

/**
 * Per-route smoke: every route loads, shows the one thing it exists to show,
 * and says nothing to the console while doing it.
 *
 * The journey specs alongside this file prove the product works. This proves it
 * is not quietly broken anywhere — a route that renders but logs a hydration
 * mismatch, or one that 500s only at a mobile width, passes every journey test
 * and still fails a user.
 *
 * Runs under both the desktop and mobile projects, so each assertion is made
 * twice at two widths.
 */

/** Console noise Playwright cannot suppress and that is not ours to fix. */
const IGNORED = [
  /Download the React DevTools/i,
  /favicon\.ico/i,
  // The service worker registration Next attempts in some dev paths.
  /workbox/i,
];

function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  const record = (message: ConsoleMessage) => {
    if (message.type() !== "error" && message.type() !== "warning") return;
    const text = message.text();
    if (IGNORED.some((pattern) => pattern.test(text))) return;
    problems.push(`console.${message.type()}: ${text}`);
  };
  page.on("console", record);
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

type Route = {
  path: string;
  /** Text that must be on the page — the thing the route exists to show. */
  expect: RegExp;
};

const PUBLIC_ROUTES: Route[] = [
  { path: "/", expect: /You do not remember what you actually believed/i },
  { path: "/sign-in", expect: /Start recording what you actually believe/i },
  { path: "/demo", expect: /sample journal/i },
  { path: "/how-scoring-works", expect: /Brier/i },
];

const SIGNED_IN_ROUTES: Route[] = [
  { path: "/dashboard", expect: /Record a decision/i },
  { path: "/decisions", expect: /journal/i },
  { path: "/decisions/new", expect: /What are you deciding/i },
  { path: "/review", expect: /review/i },
  { path: "/settings", expect: /Settings|Time zone|Your account/i },
];

test.describe("public routes", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route.path} loads cleanly`, async ({ page }) => {
      const problems = watchConsole(page);
      const response = await page.goto(route.path);

      expect(response?.status(), `${route.path} status`).toBeLessThan(400);
      await expect(page.locator("body")).toContainText(route.expect);
      expect(problems, `${route.path} console`).toEqual([]);
    });
  }
});

test.describe("signed-in routes", () => {
  for (const route of SIGNED_IN_ROUTES) {
    test(`${route.path} loads cleanly`, async ({ page }) => {
      const problems = watchConsole(page);
      await signUp(page);

      const response = await page.goto(route.path);
      expect(response?.status(), `${route.path} status`).toBeLessThan(400);
      await expect(page.locator("body")).toContainText(route.expect);
      expect(problems, `${route.path} console`).toEqual([]);
    });
  }
});

test.describe("layout integrity", () => {
  /**
   * Nothing may scroll the page sideways. A single element wider than the
   * viewport is invisible on desktop and ruins every screen on a phone, which
   * is where reviews actually get read.
   */
  for (const path of ["/", "/demo", "/dashboard", "/review", "/decisions/new"]) {
    test(`${path} does not scroll sideways`, async ({ page }) => {
      if (path === "/dashboard" || path === "/review" || path === "/decisions/new") {
        await signUp(page);
      }
      await page.goto(path);
      await page.waitForLoadState("networkidle");

      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth - doc.clientWidth;
      });
      expect(overflow, `${path} horizontal overflow in px`).toBeLessThanOrEqual(1);
    });
  }
});

test.describe("the instrument rail", () => {
  test("carries the reading and follows the column on a narrow screen", async ({
    page,
  }) => {
    await signUp(page);
    await page.goto("/dashboard");

    const rail = page.getByRole("complementary", { name: "Current reading" });
    await expect(rail).toBeVisible();
    await expect(rail).toContainText("Recorded");

    // Below the breakpoint it stacks under the column rather than disappearing.
    await page.setViewportSize({ width: 390, height: 800 });
    await expect(rail).toBeVisible();
  });
});
