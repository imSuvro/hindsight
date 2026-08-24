import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { dbContext } from "@/lib/db/client";
import { runResurface } from "@/lib/jobs/resurface";
import { features, requireCronSecret, siteUrl } from "@/lib/schemas/env";

/**
 * The scheduled job, as a plain HTTP endpoint.
 *
 * Vercel's Hobby cron can only run once a day with an hour of slop, so this is
 * driven from a GitHub Actions schedule instead (ADR-0004). Keeping it an
 * ordinary authenticated endpoint means it can also be triggered by hand,
 * tested with `curl`, and covered by integration tests without a scheduler
 * anywhere in sight.
 *
 * `maxDuration` is raised because a backlog is processed serially; Vercel Hobby
 * allows up to 300 seconds.
 */
export const maxDuration = 120;

function authorised(request: NextRequest): boolean {
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  const expected = requireCronSecret();

  // Compare in constant time, and compare lengths first because
  // timingSafeEqual throws on a mismatch rather than returning false.
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest): Promise<Response> {
  // Never configured for this is a different thing from broken, and deserves a
  // different status code — otherwise a monitor pages someone over a
  // deployment that was never meant to run the job.
  if (!features().scheduledJobs) {
    return Response.json(
      {
        error: "Scheduled resurfacing is not configured on this deployment.",
        documentation: "https://github.com/imSuvro/hindsight/blob/main/docs/deploying.md",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!authorised(request)) {
    return Response.json({ error: "Not authorised" }, { status: 401 });
  }

  try {
    const summary = await runResurface(dbContext(), {
      now: Date.now(),
      baseUrl: siteUrl(),
    });
    return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("resurface job failed", error);
    return Response.json(
      { error: "The job failed. Nothing was marked as sent that was not sent." },
      { status: 500 },
    );
  }
}
