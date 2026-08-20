/**
 * Runs once when the server starts.
 *
 * Validating the environment here means a missing or malformed variable stops
 * the process at boot with a message naming the variable, rather than surfacing
 * later as a confusing failure in the middle of somebody's session.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertEnv } = await import("@/lib/schemas/env");
  assertEnv();
}
