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
  workers: process.env.CI ? 2 : undefined,
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
