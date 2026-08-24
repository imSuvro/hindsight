import { toNextJsHandler } from "better-auth/next-js";
import { authOrNull } from "@/lib/auth/auth";

/**
 * A deployment with no database or no session secret has no auth instance, so
 * these endpoints answer 503 rather than 500. The distinction matters: this is
 * a deployment that was never configured for sign-in, not one that broke.
 */
const unavailable = () =>
  Response.json(
    {
      error: "Sign-in is not configured on this deployment.",
      documentation: "https://github.com/imSuvro/hindsight/blob/main/docs/deploying.md",
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );

async function handle(request: Request): Promise<Response> {
  const auth = authOrNull();
  if (!auth) return unavailable();
  return toNextJsHandler(auth).POST(request);
}

export async function GET(request: Request): Promise<Response> {
  const auth = authOrNull();
  if (!auth) return unavailable();
  return toNextJsHandler(auth).GET(request);
}

export const POST = handle;
