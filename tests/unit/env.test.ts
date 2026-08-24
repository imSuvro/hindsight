import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  NotConfiguredError,
  env,
  features,
  requireAuthSecret,
  requireCronSecret,
  requireDatabaseUrl,
  resetEnvCache,
  siteUrl,
} from "@/lib/schemas/env";

/**
 * The rule this file exists to hold: an *un*-configured deployment must run,
 * and a *mis*-configured one must not.
 *
 * Those are different failures. Missing credentials mean a feature is
 * unavailable and should say so. A malformed credential means somebody typed
 * something wrong, and quietly carrying on with it is how a deployment ends up
 * pointing at the wrong database.
 */
const KEYS = [
  "MONGODB_URI",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "CRON_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "EMAIL_MODE",
  "BREVO_API_KEY",
  "VERCEL_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
  resetEnvCache();
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetEnvCache();
});

describe("an environment with nothing in it", () => {
  it("parses rather than throwing", () => {
    expect(() => env()).not.toThrow();
  });

  it("reports every feature as unavailable", () => {
    expect(features()).toMatchObject({
      database: false,
      auth: false,
      scheduledJobs: false,
      email: "log",
      providers: { google: false, github: false },
    });
  });

  it("names the missing variable when something asks for it", () => {
    expect(() => requireDatabaseUrl()).toThrow(NotConfiguredError);
    expect(() => requireDatabaseUrl()).toThrow(/MONGODB_URI/);
    expect(() => requireAuthSecret()).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => requireCronSecret()).toThrow(/CRON_SECRET/);
  });

  it("falls back to localhost for the site URL", () => {
    expect(siteUrl()).toBe("http://localhost:3000");
  });
});

describe("an environment that is set but wrong", () => {
  it("refuses a connection string that is not one", () => {
    process.env.MONGODB_URI = "postgres://nope";
    resetEnvCache();
    expect(() => env()).toThrow(/MONGODB_URI/);
  });

  it("refuses a session secret short enough to brute force", () => {
    process.env.BETTER_AUTH_SECRET = "too-short";
    resetEnvCache();
    expect(() => env()).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("refuses a site URL that is not absolute", () => {
    process.env.BETTER_AUTH_URL = "/relative";
    resetEnvCache();
    expect(() => env()).toThrow(/BETTER_AUTH_URL/);
  });
});

describe("partial configuration", () => {
  const DB = "mongodb+srv://user:pass@cluster.example.net/hindsight";
  const SECRET = "a".repeat(32);

  it("gives a database but no sign-in without a session secret", () => {
    process.env.MONGODB_URI = DB;
    resetEnvCache();
    expect(features()).toMatchObject({ database: true, auth: false });
  });

  it("gives sign-in once both are present", () => {
    process.env.MONGODB_URI = DB;
    process.env.BETTER_AUTH_SECRET = SECRET;
    resetEnvCache();
    expect(features().auth).toBe(true);
  });

  it("will not enable a job that has no database to work on", () => {
    process.env.CRON_SECRET = "b".repeat(24);
    resetEnvCache();
    expect(features().scheduledJobs).toBe(false);
  });

  it("only offers a provider whose pair is complete", () => {
    process.env.MONGODB_URI = DB;
    process.env.BETTER_AUTH_SECRET = SECRET;
    process.env.GOOGLE_CLIENT_ID = "id-only";
    resetEnvCache();
    expect(features().providers.google).toBe(false);

    process.env.GOOGLE_CLIENT_SECRET = "and-secret";
    resetEnvCache();
    expect(features().providers.google).toBe(true);
  });

  it("falls back to the logging transport when the mail key is missing", () => {
    process.env.EMAIL_MODE = "brevo";
    resetEnvCache();
    // Losing the key should cost the send, not the whole server.
    expect(features().email).toBe("log");

    process.env.BREVO_API_KEY = "xkeysib-example";
    resetEnvCache();
    expect(features().email).toBe("brevo");
  });

  it("treats a variable set to whitespace as absent", () => {
    process.env.MONGODB_URI = "   ";
    resetEnvCache();
    expect(features().database).toBe(false);
  });
});

describe("siteUrl", () => {
  it("prefers explicit configuration", () => {
    process.env.BETTER_AUTH_URL = "https://hindsight.example";
    process.env.VERCEL_URL = "ignored.vercel.app";
    resetEnvCache();
    expect(siteUrl()).toBe("https://hindsight.example");
  });

  it("uses the platform's production URL when nothing is configured", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "hindsight.vercel.app";
    resetEnvCache();
    expect(siteUrl()).toBe("https://hindsight.vercel.app");
  });

  it("strips a trailing slash, which no OAuth redirect URI would match", () => {
    process.env.BETTER_AUTH_URL = "https://hindsight.example/";
    resetEnvCache();
    expect(siteUrl()).toBe("https://hindsight.example");
  });
});
