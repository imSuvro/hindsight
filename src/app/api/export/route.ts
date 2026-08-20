import type { NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth/session";
import { auditRecord } from "@/lib/audit";
import { dbContext } from "@/lib/db/client";
import { buildCsv, buildExport } from "@/lib/export";
import { exportFormatSchema } from "@/lib/schemas/api";

/**
 * The whole journal, in a file.
 *
 * JSON carries the full ledger and every digest so the chain can be verified
 * offline; CSV is a flat table for spreadsheets. Both are served as downloads
 * with `no-store`, because this is the most sensitive response the application
 * produces and it has no business in any cache.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const session = await requireApiSession();
  if (!session) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const parsed = exportFormatSchema.safeParse(
    request.nextUrl.searchParams.get("format") ?? undefined,
  );
  if (!parsed.success) {
    return Response.json({ error: 'Format must be "json" or "csv"' }, { status: 400 });
  }

  const audit = await auditRecord(dbContext(), session.user.id);
  const stamp = audit.checkedAt.slice(0, 10);

  if (parsed.data === "csv") {
    return new Response(buildCsv(audit.rebuilt), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="hindsight-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const bundle = buildExport(session.user.id, audit);
  return new Response(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="hindsight-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
