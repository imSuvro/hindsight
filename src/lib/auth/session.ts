import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { type Session, auth } from "./auth";

/**
 * Session lookup for server components and route handlers.
 *
 * Every page and every handler that touches a journal calls one of these for
 * itself. `src/proxy.ts` performs an optimistic cookie check to send signed-out
 * visitors somewhere useful, but it is not a security boundary and nothing
 * relies on it — that mistake is exactly the shape of the fail-open advisory
 * discussed in ADR-0006.
 */

export async function getSession(): Promise<Session | null> {
  return auth.api.getSession({ headers: await headers() });
}

/** For pages: send the visitor to sign in rather than showing them an error. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

/**
 * For API handlers: no redirect, just an answer the caller can act on. Returns
 * `null` so the handler decides its own response shape rather than throwing
 * through the framework.
 */
export async function requireApiSession(): Promise<Session | null> {
  return getSession();
}

/**
 * A user's journal is keyed by their Better Auth id, which is the Mongo `_id`
 * rendered as a hex string. One accessor so that never has to be remembered at
 * each call site.
 */
export function journalKey(session: Session): string {
  return session.user.id;
}
