import { z } from "zod";

/**
 * The environment, validated once — and deliberately tolerant of an empty one.
 *
 * An earlier version required the database, the session secret and the cron
 * secret to be present or the server refused to boot. That is the right
 * instinct applied in the wrong place: it protects nobody from a
 * *half*-configured deployment, and it makes an *un*-configured one useless.
 * Someone who clones this repository should be able to run it and look at the
 * sample journal without first provisioning a database.
 *
 * So credentials are optional here, and each feature reports its own
 * availability through `features()`. Code that needs a credential asks for it
 * with one of the `require…` helpers, which throw `NotConfiguredError` at the
 * point of use — loudly, naming the variable, rather than silently doing
 * something half-right.
 */

const optionalText = z
  .string()
  .transform((value) => value.trim())
  .transform((value) => (value.length > 0 ? value : undefined))
  .optional();

const baseSchema = z.object({
  // --- Credentials, all optional. See `features()` for what each unlocks. ---
  MONGODB_URI: optionalText.refine(
    (value) =>
      value === undefined ||
      value.startsWith("mongodb://") ||
      value.startsWith("mongodb+srv://"),
    "MONGODB_URI must be a MongoDB connection string",
  ),
  BETTER_AUTH_SECRET: optionalText.refine(
    (value) => value === undefined || value.length >= 32,
    "BETTER_AUTH_SECRET must be at least 32 characters",
  ),
  BETTER_AUTH_URL: optionalText.refine(
    (value) => value === undefined || URL.canParse(value),
    "BETTER_AUTH_URL must be an absolute URL",
  ),
  CRON_SECRET: optionalText.refine(
    (value) => value === undefined || value.length >= 24,
    "CRON_SECRET must be at least 24 characters",
  ),

  // A provider whose pair is incomplete is simply not offered on sign-in.
  GOOGLE_CLIENT_ID: optionalText,
  GOOGLE_CLIENT_SECRET: optionalText,
  GITHUB_CLIENT_ID: optionalText,
  GITHUB_CLIENT_SECRET: optionalText,

  EMAIL_MODE: z.enum(["log", "brevo", "smtp2go"]).default("log"),
  BREVO_API_KEY: optionalText,
  SMTP2GO_API_KEY: optionalText,
  // The default only ever reaches the logging transport, so it points at the
  // reserved .invalid TLD rather than somewhere mail could actually go.
  EMAIL_FROM: z
    .email("EMAIL_FROM must be an email address")
    .default("no-reply@hindsight.invalid"),
  EMAIL_REPLY_TO: z.email("EMAIL_REPLY_TO must be an email address").optional(),

  AUTH_TEST_MODE: optionalText,

  // --- Platform-set, never configured by hand. ---
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  VERCEL_URL: optionalText,
  VERCEL_PROJECT_PRODUCTION_URL: optionalText,
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof baseSchema>;

export class NotConfiguredError extends Error {
  readonly variable: string;

  constructor(variable: string, feature: string) {
    super(
      `${feature} is not configured on this deployment: ${variable} is not set. ` +
        "See docs/deploying.md.",
    );
    this.name = "NotConfiguredError";
    this.variable = variable;
  }
}

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;

  const parsed = baseSchema.safeParse(process.env);
  if (!parsed.success) {
    // Reaching here means a variable is present but malformed, which is a real
    // misconfiguration rather than an absent one. That still fails hard.
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Environment is set but not valid. Fix these and restart:\n${problems}\n\n` +
        "See .env.example for what each variable is and where to get it.",
    );
  }

  cached = parsed.data;
  return cached;
}

export type Features = {
  /** Journals can be read and written. Everything personal depends on this. */
  database: boolean;
  /** Sessions can be issued. Needs the database and a session secret. */
  auth: boolean;
  /** The resurfacing endpoint will accept a call. */
  scheduledJobs: boolean;
  /** Which transport review emails go through. */
  email: "log" | "brevo" | "smtp2go";
  providers: { google: boolean; github: boolean };
};

export function features(): Features {
  const e = env();
  const database = Boolean(e.MONGODB_URI);
  const providers = {
    google: Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET),
    github: Boolean(e.GITHUB_CLIENT_ID && e.GITHUB_CLIENT_SECRET),
  };
  return {
    database,
    auth: database && Boolean(e.BETTER_AUTH_SECRET),
    scheduledJobs: database && Boolean(e.CRON_SECRET),
    // Falling back rather than throwing: a missing key should cost you the
    // send, not the whole server.
    email:
      e.EMAIL_MODE === "brevo" && e.BREVO_API_KEY
        ? "brevo"
        : e.EMAIL_MODE === "smtp2go" && e.SMTP2GO_API_KEY
          ? "smtp2go"
          : "log",
    providers,
  };
}

export function requireDatabaseUrl(): string {
  const value = env().MONGODB_URI;
  if (!value) throw new NotConfiguredError("MONGODB_URI", "The journal database");
  return value;
}

export function requireAuthSecret(): string {
  const value = env().BETTER_AUTH_SECRET;
  if (!value) throw new NotConfiguredError("BETTER_AUTH_SECRET", "Sign-in");
  return value;
}

export function requireCronSecret(): string {
  const value = env().CRON_SECRET;
  if (!value) throw new NotConfiguredError("CRON_SECRET", "Scheduled resurfacing");
  return value;
}

/**
 * Where this deployment lives. Explicit configuration wins; otherwise Vercel
 * tells us, which is what lets a fresh deployment work with nothing set at all.
 * The trailing slash is stripped because carrying one produces redirect URIs no
 * OAuth provider will match, and the resulting error names none of this.
 */
export function siteUrl(): string {
  const e = env();
  const candidate =
    e.BETTER_AUTH_URL ??
    (e.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${e.VERCEL_PROJECT_PRODUCTION_URL}`
      : e.VERCEL_URL
        ? `https://${e.VERCEL_URL}`
        : "http://localhost:3000");
  return candidate.replace(/\/+$/, "");
}

/** Only offer a provider whose credentials are actually present. */
export function configuredProviders(): { google: boolean; github: boolean } {
  return features().providers;
}

/** Reset the memoised value. Tests only. */
export function resetEnvCache(): void {
  cached = null;
}
