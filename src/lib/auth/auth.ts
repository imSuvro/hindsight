import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { nextCookies } from "better-auth/next-js";
import { getDb, getMongoClient } from "@/lib/db/client";
import { env, features, requireAuthSecret, siteUrl } from "@/lib/schemas/env";
import { isTestAuthEnabled } from "./test-mode";

/**
 * Authentication, kept deliberately small.
 *
 * Sign-in is OAuth only. There is no password to steal, no reset flow to
 * hijack, and nothing a user needs is trapped behind email delivery. See
 * ADR-0006 for why Better Auth rather than Auth.js, and for the reasoning
 * behind loading none of its optional feature plugins — the advisory history
 * clusters in exactly those.
 *
 * Constructed lazily, and only when there is a database and a session secret to
 * construct it with. A deployment without those still serves the landing page
 * and the sample journal; it just cannot issue a session, and says so rather
 * than failing to boot.
 */

const environment = env();

const isProduction = environment.VERCEL_ENV === "production";
const testAuthEnabled = isTestAuthEnabled(environment);

/**
 * A provider is only offered when both halves of its credential pair exist, so
 * the app runs locally before any OAuth client has been registered.
 */
function socialProviders() {
  const providers: Record<string, { clientId: string; clientSecret: string }> = {};
  if (environment.GOOGLE_CLIENT_ID && environment.GOOGLE_CLIENT_SECRET) {
    providers.google = {
      clientId: environment.GOOGLE_CLIENT_ID,
      clientSecret: environment.GOOGLE_CLIENT_SECRET,
    };
  }
  if (environment.GITHUB_CLIENT_ID && environment.GITHUB_CLIENT_SECRET) {
    providers.github = {
      clientId: environment.GITHUB_CLIENT_ID,
      clientSecret: environment.GITHUB_CLIENT_SECRET,
    };
  }
  return providers;
}

function createAuth() {
  return betterAuth({
    appName: "Hindsight",
    baseURL: siteUrl(),
    basePath: "/api/auth",
    secret: requireAuthSecret(),

    /*
     * `transaction: false` is not an oversight. Passing a client turns the
     * adapter's transaction wrapper on by default, and in 1.7.1 that wrapper
     * calls `abortTransaction` after `commitTransaction` on the sign-up path,
     * which fails every registration with a 500. The end-to-end suite caught it
     * immediately.
     *
     * Turning it off costs little here: the writes involved are a handful of
     * single documents, and the ledger — the part of this system where atomicity
     * genuinely matters — runs its own transactions through `appendEvent` using
     * the same client, entirely unaffected by this setting. Revisit when the
     * adapter is fixed upstream.
     */
    database: mongodbAdapter(getDb(), {
      client: getMongoClient(),
      transaction: false,
    }),

    socialProviders: socialProviders(),

    // Never on in production; see test-mode.ts and its regression test.
    emailAndPassword: { enabled: testAuthEnabled, minPasswordLength: 12 },

    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      // A short signed cache keeps the common path off the database while leaving
      // sessions genuinely revocable.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },

    user: {
      additionalFields: {
        // Captured from the browser at first sign-in and confirmed during
        // onboarding, so reviews arrive on the day the user meant.
        timeZone: { type: "string", required: false, input: true },
        emailOptIn: {
          type: "boolean",
          required: false,
          defaultValue: true,
          input: true,
        },
        onboardedAt: { type: "date", required: false, input: false },
      },
    },

    trustedOrigins: [siteUrl(), "http://localhost:3000"],

    advanced: {
      cookiePrefix: "hindsight",
      useSecureCookies: isProduction,
    },

    rateLimit: {
      // Better Auth defaults this to production-only; the sign-in endpoints are
      // the ones worth limiting and it does that out of the box. Tests would trip
      // the three-attempts-per-ten-seconds rule, so they opt out.
      enabled: !testAuthEnabled,
      storage: "database",
    },

    // Framework glue rather than a feature surface: without it, cookies set by
    // a direct auth.api call never reach the browser. Must be last.
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

let cachedAuth: Auth | null | undefined;

/**
 * The configured auth instance, or `null` when this deployment has no database
 * or no session secret.
 *
 * Callers must handle `null` rather than assume it away — that is the whole
 * point. A signed-out visitor on an unconfigured deployment should meet a page
 * explaining that sign-in is unavailable, not a stack trace.
 */
export function authOrNull(): Auth | null {
  if (cachedAuth !== undefined) return cachedAuth;
  cachedAuth = features().auth ? createAuth() : null;
  return cachedAuth;
}

/** For code paths that have already established auth is available. */
export function requireAuth(): Auth {
  const auth = authOrNull();
  if (!auth) {
    throw new Error("Sign-in is not configured on this deployment");
  }
  return auth;
}

export type Session = Auth["$Infer"]["Session"];
export type SessionUser = Session["user"];
