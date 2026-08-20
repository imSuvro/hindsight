import { requireApiSession } from "@/lib/auth/session";
import { auditRecord } from "@/lib/audit";
import { dbContext } from "@/lib/db/client";

/**
 * Replay a person's record and report whether it still adds up.
 *
 * The same check the settings page runs, exposed so it can be run by anything —
 * a script, a scheduled job, a sceptic with `curl`. Verification that only
 * works inside the application is worth much less than verification anyone can
 * repeat.
 */
export async function GET(): Promise<Response> {
  const session = await requireApiSession();
  if (!session) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const audit = await auditRecord(dbContext(), session.user.id);

  return Response.json(
    {
      intact: audit.intact,
      entries: audit.entries,
      decisions: audit.decisions,
      head: audit.head,
      checkedAt: audit.checkedAt,
      problems: audit.problems,
      note: audit.intact
        ? "Every entry hashes to its stored fingerprint and links to the one before it. Compare the head against a copy you already hold — one is in every review email and every export — to rule out entries having been removed from the end."
        : "This record does not verify. Nothing has been changed automatically; the problems are listed above.",
    },
    {
      status: audit.intact ? 200 : 409,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
