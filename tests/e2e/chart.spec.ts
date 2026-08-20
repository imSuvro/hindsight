import { expect, test } from "@playwright/test";

/**
 * The calibration diagram claims to be interactive without any client
 * JavaScript, and to be reachable from a keyboard. Both are stated in the
 * README, so both are tested rather than asserted.
 */
const MARK = "svg[role='img'] g[tabindex='0']";
/**
 * The transparent hover target, which is the first rect inside a mark. Aiming
 * at the group would aim at the centre of its bounding box — and that box
 * includes the readout, so its centre is empty space rather than the point.
 */
const HIT_AREA = `${MARK} > rect:first-of-type`;

test.describe("the calibration diagram", () => {
  test("shows a readout on hover with JavaScript switched off", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/demo");

    const readout = page.locator(MARK).first().locator("g").first();
    await expect(readout).toHaveCSS("opacity", "0");

    // `force` skips Playwright's hit-target check, which reports a transparent
    // SVG rect as obscured by the plot behind it even when the browser sends it
    // the event. The pointer still really moves, which is the thing under test.
    await page.locator(HIT_AREA).first().hover({ force: true });
    await expect(readout).toHaveCSS("opacity", "1");

    await context.close();
  });

  test("shows the same readout on keyboard focus", async ({ page }) => {
    await page.goto("/demo");

    const mark = page.locator(MARK).first();
    const readout = mark.locator("g").first();

    await expect(readout).toHaveCSS("opacity", "0");
    await mark.focus();
    await expect(readout).toHaveCSS("opacity", "1");
  });

  test("gives every point a target bigger than the mark", async ({ page }) => {
    await page.goto("/demo");

    // Hovering a point's whole vertical band, not only its drawn pixels, is
    // what makes the readout usable. Regression guard: without the transparent
    // hit area the plot itself swallows the pointer.
    const areas = await page.locator(HIT_AREA).all();
    expect(areas.length).toBeGreaterThan(0);
    for (const area of areas) {
      const box = await area.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(24);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);
    }
  });

  test("describes every point in words for a screen reader", async ({ page }) => {
    await page.goto("/demo");

    const marks = await page.locator(MARK).all();
    expect(marks.length).toBeGreaterThan(0);
    for (const mark of marks) {
      const label = await mark.getAttribute("aria-label");
      // Position, colour and line style are the visual encodings; this is the
      // one that does not depend on seeing the chart at all.
      expect(label).toMatch(/When you said .+ it happened .+ of the time\./);
      expect(label).toMatch(/Plausible range/);
    }
  });
});
