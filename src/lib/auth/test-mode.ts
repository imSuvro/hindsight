/**
 * The gate on the test-only sign-in path.
 *
 * End-to-end tests need to sign in without a browser reaching Google, so Better
 * Auth's email-and-password method is switched on for them. That is a second
 * way into an account, and it must be impossible to leave open by accident.
 *
 * `VERCEL_ENV` is set by the platform, not by configuration, so a stray
 * `AUTH_TEST_MODE=1` in the production environment cannot open it. This is
 * checked by a test that asserts the closed case explicitly.
 *
 * It cannot be a compile-time exclusion: server environment variables are read
 * at runtime and there is no dead-code elimination to lean on. This is the
 * strongest guarantee actually available, and ADR-0006 says so plainly rather
 * than implying a stronger one.
 */

export type TestModeSource = {
  AUTH_TEST_MODE?: string | undefined;
  VERCEL_ENV?: string | undefined;
};

export function isTestAuthEnabled(source: TestModeSource): boolean {
  if (source.VERCEL_ENV === "production") return false;
  return source.AUTH_TEST_MODE === "1";
}
