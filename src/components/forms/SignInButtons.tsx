"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import styles from "./SignInButtons.module.css";

/**
 * Sign-in is OAuth only. There is no password to store, no reset flow to
 * hijack, and nothing a person needs is behind email delivery (ADR-0006).
 */

type Provider = "google" | "github";

const LABELS: Record<Provider, string> = {
  google: "Continue with Google",
  github: "Continue with GitHub",
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className={styles.mark} aria-hidden="true">
      <path
        fill="currentColor"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="currentColor"
        opacity="0.75"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="currentColor"
        opacity="0.5"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="currentColor"
        opacity="0.85"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" className={styles.mark} aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.23.49-2.7-1.07-2.7-1.07-.36-.93-.89-1.18-.89-1.18-.73-.5.05-.49.05-.49.81.06 1.23.83 1.23.83.72 1.23 1.89.87 2.35.67.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  );
}

const MARKS: Record<Provider, () => React.ReactElement> = {
  google: GoogleMark,
  github: GitHubMark,
};

export function SignInButtons({
  providers,
  next,
  hasDatabase = true,
}: {
  providers: Provider[];
  next: string;
  /** False when this deployment has no journal database at all. */
  hasDatabase?: boolean;
}) {
  const [busy, setBusy] = useState<Provider | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function start(provider: Provider): Promise<void> {
    setBusy(provider);
    setFailed(null);
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: next,
    });
    // On success the browser has already left for the provider; only a failure
    // returns here.
    if (error) {
      setBusy(null);
      setFailed(
        "That sign-in did not go through. Please try again, or use the other provider.",
      );
    }
  }

  if (providers.length === 0) {
    return (
      <p className={styles.unavailable}>
        {hasDatabase
          ? "Sign-in is not configured on this deployment: no OAuth provider has been registered."
          : "This deployment has no journal database, so accounts cannot be created on it."}{" "}
        The sample journal works either way. If you are running Hindsight yourself,{" "}
        <code>.env.example</code> lists what each variable is, and{" "}
        <a href="https://github.com/imSuvro/hindsight/blob/main/docs/deploying.md">
          docs/deploying.md
        </a>{" "}
        walks through getting them.
      </p>
    );
  }

  return (
    <div className={styles.stack}>
      {failed && (
        <p className={styles.error} role="alert">
          {failed}
        </p>
      )}
      {providers.map((provider) => {
        const Mark = MARKS[provider];
        return (
          <button
            key={provider}
            type="button"
            className={styles.provider}
            disabled={busy !== null}
            onClick={() => {
              void start(provider);
            }}
          >
            <Mark />
            {busy === provider ? "Taking you there…" : LABELS[provider]}
          </button>
        );
      })}
    </div>
  );
}
