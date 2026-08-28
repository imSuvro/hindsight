import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a production build, because that is the only
 * configuration where the proxy, the strict Content-Security-Policy and the
 * real server-action wiring are all in play. A dev-server run would pass while
 * the shipped thing was broken.
 *
 * `scripts/e2e-server.mjs` brings up an in-memory MongoDB replica set before
 * starting the server — Playwright launches `webServer` before `globalSetup`,
 * so the database has to be started by the server command itself.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  /*
   * Bounded locally, not left to the default.
   *
   * The default is derived from the core count — ten workers on a twenty-core
   * machine — and all of them hit one `next start` process fronting one
   * in-memory replica set. That server drops connections under the load: a soak
   * of sixteen full runs failed four times, every failure a `read ECONNRESET`
   * on a different test and a different endpoint, never the same one twice.
   * Fourteen runs at four workers failed none.
   *
   * It costs nothing. A run takes ~47s at four workers and ~46s at ten, because
   * the bottleneck was never the browsers — it was the server they were all
   * queuing behind.
   *
   * This mattered more than a slow suite: a rare infrastructure flake is
   * indistinguishable from a real failure, and CI's single retry would have
   * hidden it either way.
   */
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Reviews get read on phones, so the mobile pass is not optional.
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],

  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
