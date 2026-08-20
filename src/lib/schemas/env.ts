import { z } from "zod";

/**
 * The environment, validated once.
 *
 * A half-configured deployment is worse than one that refuses to start: it
 * fails later, somewhere less obvious, usually while a user is in the middle of
 * something. `instrumentation.ts` calls `assertEnv()` at server startup so a
 * missing variable surfaces at boot rather than on first use.
 *
 * Validation is lazy rather than at module load so that the build — which has
 * no real credentials and needs none — is not held hostage by runtime config.
 */

const nonEmpty = (label: string) => z.string().min(1, `${label} is required`);

const baseSchema = z.object({
  MONGODB_URI: nonEmpty("MONGODB_URI").refine(
    (value) => value.startsWith("mongodb://") || value.startsWith("mongodb+srv://"),
    "MONGODB_URI must be a MongoDB connection string",
  ),

  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.url("BETTER_AUTH_URL must be an absolute URL").transform(
    // A trailing slash here produces redirect URIs that no OAuth provider will
    // match, and the resulting error message names none of this.
    (value) => value.replace(/\/+$/, ""),
  ),

  // OAuth providers are optional so the app runs locally before credentials
  // exist; a provider whose pair is incomplete is simply not offered.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  CRON_SECRET: z.string().min(24, "CRON_SECRET must be at least 24 characters"),

  EMAIL_MODE: z.enum(["log", "brevo"]).default("log"),
  BREVO_API_KEY: z.string().optional(),
  EMAIL_FROM: z
    .email("EMAIL_FROM must be an email address")
    .default("hindsight@localhost"),
  EMAIL_REPLY_TO: z.email("EMAIL_REPLY_TO must be an email address").optional(),

  AUTH_TEST_MODE: z.string().optional(),
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const envSchema = baseSchema.superRefine((value, ctx) => {
  if (value.EMAIL_MODE === "brevo" && !value.BREVO_API_KEY) {
    ctx.addIssue({
      code: "custom",
      path: ["BREVO_API_KEY"],
      message: 'BREVO_API_KEY is required when EMAIL_MODE is "brevo"',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Environment is not valid. Fix these and restart:\n${problems}\n\n` +
        "See .env.example for what each variable is and where to get it.",
    );
  }

  cached = parsed.data;
  return cached;
}

/** Called from `instrumentation.ts` so misconfiguration fails at boot. */
export function assertEnv(): void {
  env();
}

/** Only offer a provider whose credentials are actually present. */
export function configuredProviders(): { google: boolean; github: boolean } {
  const e = env();
  return {
    google: Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET),
    github: Boolean(e.GITHUB_CLIENT_ID && e.GITHUB_CLIENT_SECRET),
  };
}

/** Reset the memoised value. Tests only. */
export function resetEnvCache(): void {
  cached = null;
}
