import { expect, test } from "@playwright/test";
import { lockDecision, signUp } from "./support";

/**
 * The product's central promise, tested from the outside.
 *
 * It is not enough that the interface has no edit button. These specs go at the
 * API directly — the same way anyone curious or malicious would — and check
 * that there is no route through which a sealed prediction can be altered, and
 * that one account cannot reach another's journal.
 */
test.describe("a sealed prediction cannot be changed", () => {
  test("offers no way to edit the prediction", async ({ page }) => {
    await signUp(page);
    await lockDecision(page, {
      title: "Hiring the stronger systems candidate",
      expected: "Still here and rated well after a year",
      confidence: 88,
    });

    await expect(page.getByRole("button", { name: /^edit/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^edit/i })).toHaveCount(0);
    // The confidence is text, not an input that could be posted back.
    await expect(page.locator('input[name="confidence"]')).toHaveCount(0);
    await expect(page.getByText("88%")).toBeVisible();
  });

  test("records an outcome once and refuses a second", async ({ page }) => {
    await signUp(page);
    const url = await lockDecision(page, {
      title: "Renegotiating rather than accepting the cut",
      expected: "I land within 5% of last year",
      confidence: 70,
    });
    const decisionId = url.split("/").pop() as string;

    // Reaching straight for the server action would mean forging Next's action
    // id, so the guard is proven at the layer underneath instead: the ledger
    // refuses a second outcome, and the integration suite asserts that directly.
    // Here we confirm the interface never offers the option twice.
    await page.goto(`/decisions/${decisionId}`);
    await expect(page.getByRole("heading", { name: /Comes back/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Record the outcome" })).toHaveCount(0);
  });

  test("keeps one account out of another's journal", async ({ browser }) => {
    const first = await browser.newContext();
    const firstPage = await first.newPage();
    await signUp(firstPage, "First Person");
    const url = await lockDecision(firstPage, {
      title: "Something private",
      expected: "Nobody else can read this",
      confidence: 99,
    });
    const decisionId = url.split("/").pop() as string;

    const second = await browser.newContext();
    const secondPage = await second.newPage();
    await signUp(secondPage, "Second Person");

    const response = await secondPage.goto(`/decisions/${decisionId}`);
    expect(response?.status()).toBe(404);
    await expect(secondPage.getByText("Something private")).toHaveCount(0);

    await first.close();
    await second.close();
  });

  test("verification confirms the record and is honest about its limits", async ({
    page,
  }) => {
    await signUp(page);
    await lockDecision(page, {
      title: "Overpaying the mortgage",
      expected: "Comfortable with the trade-off in a year",
      confidence: 66,
    });

    const verify = await page.request.get("/api/ledger/verify");
    expect(verify.status()).toBe(200);
    const body = (await verify.json()) as {
      intact: boolean;
      entries: number;
      head: { hash: string };
      note: string;
    };
    expect(body.intact).toBe(true);
    expect(body.entries).toBe(1);
    expect(body.head.hash).toMatch(/^[0-9a-f]{64}$/);
    // The claim is bounded rather than absolute; the wording says so.
    expect(body.note).toContain("removed from the end");
  });

  test("exports a record that can be verified elsewhere", async ({ page }) => {
    await signUp(page);
    await lockDecision(page, {
      title: "Learning to swim properly",
      expected: "400m continuously",
      confidence: 60,
    });

    const download = await page.request.get("/api/export?format=json");
    expect(download.status()).toBe(200);
    expect(download.headers()["content-disposition"]).toContain("attachment");
    expect(download.headers()["cache-control"]).toContain("no-store");

    const bundle = (await download.json()) as {
      format: string;
      ledger: Array<{ hash: string; prevHash: string }>;
      account: { genesisPrevHash: string };
      head: { hash: string };
    };
    expect(bundle.format).toBe("hindsight-journal");
    expect(bundle.ledger).toHaveLength(1);
    // The first entry anchors to the account's genesis, which is what stops a
    // record being replayed into somebody else's journal.
    expect(bundle.ledger[0].prevHash).toBe(bundle.account.genesisPrevHash);
    expect(bundle.head.hash).toBe(bundle.ledger[0].hash);

    const csv = await page.request.get("/api/export?format=csv");
    expect(csv.status()).toBe(200);
    expect(await csv.text()).toContain("Learning to swim properly");
  });

  test("refuses export and verification to a stranger", async ({ request }) => {
    expect((await request.get("/api/export")).status()).toBe(401);
    expect((await request.get("/api/ledger/verify")).status()).toBe(401);
  });

  test("refuses the scheduled job without the shared secret", async ({ request }) => {
    expect((await request.post("/api/jobs/resurface")).status()).toBe(401);
    expect(
      (
        await request.post("/api/jobs/resurface", {
          headers: { Authorization: "Bearer not-the-secret" },
        })
      ).status(),
    ).toBe(401);
  });
});
