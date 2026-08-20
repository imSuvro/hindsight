import { shortHash } from "@/lib/domain/chain";
import { formatDate } from "@/lib/format";
import type { DecisionView } from "@/lib/schemas/domain";
import type { EmailMessage } from "./transport";

/**
 * The one message this product ever sends.
 *
 * It does two jobs. It brings the decision back with the prediction attached —
 * because the whole point is reading what you thought before you knew, not
 * being reminded that you once thought something. And it carries the record's
 * head fingerprint into somewhere outside the database, which is what makes the
 * tamper-evidence mean anything (ADR-0002).
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type ReviewEmailInput = {
  to: string;
  toName: string;
  decision: DecisionView;
  timeZone: string;
  head: { seq: number; hash: string };
  baseUrl: string;
};

export function reviewDueEmail(input: ReviewEmailInput): EmailMessage {
  const { decision, head, baseUrl, timeZone } = input;
  const link = `${baseUrl}/decisions/${decision.decisionId}`;
  const lockedOn = formatDate(decision.lockedAt, timeZone);

  const text = [
    `You decided this on ${lockedOn}, and asked to be reminded today.`,
    "",
    decision.title,
    "",
    `You expected: ${decision.expectedOutcome}`,
    `You were ${decision.confidence}% sure.`,
    "",
    "What actually happened?",
    link,
    "",
    "—",
    `Record fingerprint ${head.hash}`,
    `${head.seq} ${head.seq === 1 ? "entry" : "entries"}. Keep this: it is how you can tell later that nothing in your record was changed.`,
    "",
    `Turn these off in settings: ${baseUrl}/settings`,
  ].join("\n");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(decision.title)}</title></head>
<body style="margin:0;padding:24px;background:#f2f4f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#12181b;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fbfcfb;border:1px solid #d9dfdd;border-radius:4px;">
    <tr><td style="padding:28px 28px 8px;">
      <p style="margin:0 0 20px;font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:#86939a;">Ready for review</p>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#55636b;">
        You decided this on ${escapeHtml(lockedOn)} and asked to be reminded today.
      </p>
      <h1 style="margin:0 0 18px;font-size:20px;line-height:1.25;font-weight:600;">${escapeHtml(decision.title)}</h1>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #d9dfdd;margin-bottom:20px;">
        <tr><td style="padding:16px 0 0;">
          <p style="margin:0 0 6px;font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:#86939a;">You expected</p>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.4;">${escapeHtml(decision.expectedOutcome)}</p>
          <p style="margin:0 0 6px;font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:#86939a;">You were</p>
          <p style="margin:0;font-size:28px;font-weight:600;color:#a5661f;">${decision.confidence}% sure</p>
        </td></tr>
      </table>
      <a href="${escapeHtml(link)}" style="display:inline-block;padding:11px 22px;background:#12181b;color:#fbfcfb;text-decoration:none;border-radius:3px;font-size:14px;font-weight:600;">Record what happened</a>
    </td></tr>
    <tr><td style="padding:24px 28px 26px;">
      <p style="margin:22px 0 8px;padding-top:18px;border-top:1px solid #d9dfdd;font-size:12px;color:#86939a;line-height:1.6;">
        Record fingerprint <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#12181b;">${escapeHtml(shortHash(head.hash))}</span>
        · ${head.seq} ${head.seq === 1 ? "entry" : "entries"}
      </p>
      <p style="margin:0 0 14px;font-size:12px;color:#86939a;line-height:1.6;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;">${escapeHtml(head.hash)}</p>
      <p style="margin:0 0 14px;font-size:12px;color:#86939a;line-height:1.6;">
        Keep this message. The fingerprint above is how you can tell later that nothing in your record was changed — including by us.
      </p>
      <p style="margin:0;font-size:12px;color:#86939a;">
        <a href="${escapeHtml(baseUrl)}/settings" style="color:#86939a;">Turn these off</a>
      </p>
    </td></tr>
  </table>
</body></html>`;

  return {
    to: input.to,
    toName: input.toName,
    subject: `Ready for review: ${decision.title}`,
    text,
    html,
  };
}
