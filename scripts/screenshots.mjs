#!/usr/bin/env node
/**
 * Capture the screenshots the README and the docs use.
 *
 *   node scripts/e2e-server.mjs &        # or leave `pnpm test:e2e` running
 *   node scripts/screenshots.mjs
 *
 * Generated rather than hand-taken so they cannot quietly go stale: rerun this
 * after an interface change and the diff shows what actually moved. Both colour
 * schemes are captured, because dark mode here is a designed set of steps rather
 * than an inversion of the light one.
 *
 * The signed-in shots use the same test sign-in path as the end-to-end suite, so
 * no real account or real journal is ever involved.
 */

import { mkdir } from "node:fs/promises";
import { chromium, devices } from "@playwright/test";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const OUT = "docs/screenshots";
const PASSWORD = "correct-horse-battery-staple";

const PUBLIC_SHOTS = [
  { path: "/", name: "landing", fullPage: true },
  { path: "/demo", name: "sample-journal", fullPage: true },
  { path: "/how-scoring-works", name: "methodology", fullPage: false },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

async function shoot(context, scheme, shots, tag = "") {
  const page = await context.newPage();
  for (const shot of shots) {
    await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle" });
    // Fonts settle a frame or two after load; without this the display face is
    // occasionally captured mid-swap.
    await page.waitForTimeout(400);
    const file = `${OUT}/${shot.name}${tag}-${scheme}.png`;
    await page.screenshot({ path: file, fullPage: shot.fullPage ?? false });
    console.log(`  ${file}`);
  }
  await page.close();
}

for (const scheme of ["light", "dark"]) {
  console.log(`${scheme}:`);

  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
  });
  await shoot(desktop, scheme, PUBLIC_SHOTS);

  // A journal with enough resolved decisions to show the figures rather than
  // the not-yet state.
  const page = await desktop.newPage();
  const email = `screenshots-${Date.now()}-${scheme}@example.test`;
  const signUp = await page.request.post(`${BASE}/api/auth/sign-up/email`, {
    data: { name: "Wren Adeyemi", email, password: PASSWORD },
  });
  if (!signUp.ok()) {
    throw new Error(`sign-up failed: ${signUp.status()} ${await signUp.text()}`);
  }
  await page.goto(`${BASE}/decisions/new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/record-a-decision-${scheme}.png` });
  console.log(`  ${OUT}/record-a-decision-${scheme}.png`);
  await page.close();
  await desktop.close();

  const phone = await browser.newContext({
    ...devices["Pixel 7"],
    colorScheme: scheme,
  });
  await shoot(
    phone,
    scheme,
    [{ path: "/demo", name: "sample-journal", fullPage: false }],
    "-mobile",
  );
  await phone.close();
}

await browser.close();
console.log("Done.");
