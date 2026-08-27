import { expect, test } from "@playwright/test";
import { lockDecision, makeDue, signUp } from "./support";

/**
 * The awkward inputs and the unhappy paths.
 *
 * The journey specs prove the product works when used as intended. These probe
 * the edges: empty and whitespace-only fields, the exact boundaries of the
 * confidence range, text long enough to break a layout, characters that break
 * naive escaping, ids that do not exist, and the spreadsheet-injection guard on
 * the CSV export.
 *
 * Where a case is already covered elsewhere it is not repeated here —
 * `immutability.spec.ts` owns resolve-once and the absent edit path, and
 * `public-and-access.spec.ts` owns cross-account isolation.
 */

const LONG_TITLE = "A".repeat(139);
const OVER_TITLE = "A".repeat(200);

test.describe("what the form accepts and refuses", () => {
  test("refuses an empty decision, and says what is missing", async ({ page }) => {
    await signUp(page);
    await page.goto("/decisions/new");

    const submit = page.getByRole("button", { name: "Review before locking" });
    await expect(submit).toBeDisabled();

    // Unavailable is not enough on its own: a dimmed control with no stated
    // reason is a dead end, and a screen reader announces only "dimmed".
    await expect(page.getByText(/and this unlocks/i)).toBeVisible();
    await expect(submit).toHaveAttribute("aria-describedby", "lock-blocked");
  });

  test("treats a whitespace-only title as empty", async ({ page }) => {
    await signUp(page);
    await page.goto("/decisions/new");

    await page.getByLabel("What are you deciding?").fill("      ");
    await page.getByLabel("What do you expect to happen?").fill("Something happens");

    // Whitespace is not a decision, so the action stays unavailable and names
    // the field that is actually empty.
    await expect(
      page.getByRole("button", { name: "Review before locking" }),
    ).toBeDisabled();
    await expect(page.getByText(/what you are deciding/i)).toBeVisible();
  });

  test("accepts the confidence boundaries, 1 and 99", async ({ page }) => {
    await signUp(page);

    for (const confidence of [1, 99]) {
      const url = await lockDecision(page, {
        title: `Boundary case at ${confidence}`,
        expected: "The boundary is accepted",
        confidence,
      });
      await page.goto(url);
      await expect(page.locator("body")).toContainText(`${confidence}%`);
    }
  });

  test("keeps a title at the limit and refuses one past it", async ({ page }) => {
    await signUp(page);
    await page.goto("/decisions/new");

    const field = page.getByLabel("What are you deciding?");
    await field.fill(OVER_TITLE);
    // Either the control caps the input, or the server refuses it. Both are
    // fine; silently storing 200 characters against a 140 limit is not.
    const value = await field.inputValue();
    expect(
      value.length,
      "the field should not hold more than the limit",
    ).toBeLessThanOrEqual(140);
  });

  test("carries a title at the limit through to the record intact", async ({ page }) => {
    await signUp(page);
    const url = await lockDecision(page, {
      title: LONG_TITLE,
      expected: "A long title survives",
      confidence: 50,
    });
    await page.goto(url);
    await expect(page.locator("body")).toContainText(LONG_TITLE);
  });
});

test.describe("characters that break naive handling", () => {
  test("stores markup as text rather than rendering it", async ({ page }) => {
    await signUp(page);
    const payload = `<img src=x onerror="window.__xss=1">`;

    const url = await lockDecision(page, {
      title: `Injection ${payload}`,
      expected: "It renders as text",
      confidence: 50,
    });
    await page.goto(url);

    // The characters must appear as written, and nothing may have executed.
    await expect(page.locator("body")).toContainText(payload);
    const executed = await page.evaluate(
      () => (window as unknown as { __xss?: number }).__xss,
    );
    expect(executed, "the payload must not execute").toBeUndefined();
  });

  test("round-trips emoji and non-Latin script", async ({ page }) => {
    await signUp(page);
    const title = "মীমাংসা 🎯 — will the release hold?";

    const url = await lockDecision(page, {
      title,
      expected: "Unicode survives the ledger",
      confidence: 60,
    });
    await page.goto(url);
    await expect(page.locator("body")).toContainText(title);
  });
});

test.describe("ids that do not resolve", () => {
  test("a well-formed but unknown decision id is a 404, not a crash", async ({
    page,
  }) => {
    await signUp(page);
    const response = await page.goto("/decisions/AAAAAAAAAAAAAAAA");
    expect(response?.status(), "unknown id").toBe(404);
  });

  test("a malformed decision id is a 404, not a crash", async ({ page }) => {
    await signUp(page);
    const response = await page.goto("/decisions/../../etc/passwd");
    expect(response?.status(), "malformed id").toBeGreaterThanOrEqual(400);
    expect(response?.status(), "malformed id must not 500").toBeLessThan(500);
  });
});

test.describe("the CSV export", () => {
  test("neutralises anything a spreadsheet would execute", async ({ page }) => {
    await signUp(page);
    await lockDecision(page, {
      // A classic formula-injection payload as the decision's own wording.
      title: `=1+1 formula injection probe`,
      expected: `+1+1 also dangerous`,
      confidence: 50,
    });

    const response = await page.request.get("/api/export?format=csv");
    expect(response.ok(), `csv export: ${response.status()}`).toBe(true);
    const body = await response.text();

    // Every cell that begins with a formula lead-in must be prefixed so the
    // spreadsheet treats it as text.
    const dangerous = body
      .split(/\r?\n/)
      .flatMap((line) => line.split(","))
      .map((cell) => cell.replace(/^"/, ""))
      .filter((cell) => /^[=+\-@]/.test(cell));

    expect(
      dangerous,
      `cells starting with a formula character:\n${dangerous.join("\n")}`,
    ).toEqual([]);
  });
});

test.describe("resolving", () => {
  test("counts an unsettled outcome separately from a scored one", async ({ page }) => {
    await signUp(page);
    const url = await lockDecision(page, {
      title: "An outcome nobody can settle",
      expected: "It stays ambiguous",
      confidence: 50,
    });
    await makeDue(url.split("/").pop() as string);

    await page.goto(url);
    await page
      .getByRole("radio", { name: /could not be settled/i })
      .first()
      .check();
    await page.getByRole("button", { name: "Record the outcome" }).click();
    await expect(page.getByRole("radio", { name: /could not be settled/i })).toHaveCount(
      0,
    );

    /*
     * The product's claim is that an unsettled decision is excluded from every
     * figure and reported separately rather than quietly scored as a miss —
     * scoring it either way would invent a result the user never gave.
     */
    await page.goto("/dashboard");
    await expect(page.locator("body")).toContainText("0/10");
  });
});

test.describe("the second half of the loop", () => {
  /*
   * Reading a due decision and recording what happened. Unreachable through
   * the interface without seeding, because review dates are forward-only —
   * which is why this half of the core loop had no end-to-end coverage.
   */
  test("a due decision can be read and answered through the interface", async ({
    page,
  }) => {
    await signUp(page);
    const url = await lockDecision(page, {
      title: "The migration finishes inside the quarter",
      expected: "It ships before the quarter closes",
      confidence: 65,
      situation: "Two engineers, one of them part-time.",
    });
    const decisionId = url.split("/").pop() as string;
    await makeDue(decisionId);

    // It surfaces in the queue.
    await page.goto("/review");
    await expect(page.locator("body")).toContainText(
      "The migration finishes inside the quarter",
    );

    // The original wording is still on it, unchanged, at the moment of answering.
    await page.goto(url);
    await expect(page.locator("body")).toContainText(
      "It ships before the quarter closes",
    );
    await expect(page.locator("body")).toContainText("65%");

    await page
      .getByRole("radio", { name: /it happened/i })
      .first()
      .check();
    await page.getByRole("button", { name: "Record the outcome" }).click();

    await expect(page.locator("body")).toContainText(/happened/i);
    // Once answered, the interface offers no second answer.
    await expect(page.getByRole("button", { name: "Record the outcome" })).toHaveCount(0);
  });

  test("answering leaves the chain itself intact", async ({ page }) => {
    await signUp(page);
    const url = await lockDecision(page, {
      title: "The chain survives an outcome",
      expected: "The hash chain still links end to end",
      confidence: 55,
    });
    await makeDue(url.split("/").pop() as string);

    await page.goto(url);
    await page
      .getByRole("radio", { name: /it happened/i })
      .first()
      .check();
    await page.getByRole("button", { name: "Record the outcome" }).click();
    // Wait on the radios, not the button: the button relabels to "Recording…"
    // the instant it is pressed, so its absence proves nothing about the write.
    await expect(page.getByRole("radio", { name: /it happened/i })).toHaveCount(0);

    const verify = await page.request.get("/api/ledger/verify");
    const report = (await verify.json()) as {
      problems?: { kind: string; detail: string }[];
    };
    const chainProblems = (report.problems ?? []).filter((p) => p.kind === "chain");

    // `makeDue` edits the view, so a projection problem is expected here and is
    // asserted on its own below. What must hold is that recording an outcome
    // adds no *chain* problem: the append linked correctly.
    expect(
      chainProblems,
      `chain problems after resolving: ${chainProblems.map((p) => p.detail).join("; ")}`,
    ).toEqual([]);
  });

  test("editing the record behind the ledger's back is caught", async ({ page }) => {
    await signUp(page);
    const url = await lockDecision(page, {
      title: "Tampering with the view is detectable",
      expected: "Verification reports a projection problem",
      confidence: 50,
    });

    // Clean before.
    const before = await page.request.get("/api/ledger/verify");
    expect(before.status(), "a fresh record verifies").toBe(200);

    // Now change stored state without a corresponding ledger entry — exactly
    // what an operator with database access could do.
    await makeDue(url.split("/").pop() as string);

    const after = await page.request.get("/api/ledger/verify");
    expect(after.status(), "a tampered projection must not report as intact").toBe(409);
    const report = (await after.json()) as {
      intact: boolean;
      problems: { kind: string }[];
    };
    expect(report.intact).toBe(false);
    expect(report.problems.some((p) => p.kind === "projection")).toBe(true);
  });

  test("an answered decision starts counting toward the score", async ({ page }) => {
    await signUp(page);
    const url = await lockDecision(page, {
      title: "It counts toward the score",
      expected: "The dashboard moves from 0 to 1",
      confidence: 80,
    });
    await makeDue(url.split("/").pop() as string);

    await page.goto(url);
    await page
      .getByRole("radio", { name: /it happened/i })
      .first()
      .check();
    await page.getByRole("button", { name: "Record the outcome" }).click();
    await expect(page.getByRole("radio", { name: /it happened/i })).toHaveCount(0);

    await page.goto("/dashboard");
    await expect(page.locator("body")).toContainText("1/10");
  });
});
