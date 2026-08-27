import { env, features } from "@/lib/schemas/env";

/**
 * Sending mail, behind one small interface.
 *
 * Development, the test suites, CI and the end-to-end run all use the `log`
 * transport, so no test run can reach a real inbox or burn a day's quota. The
 * live path calls the provider's REST API directly rather than an SDK — this
 * is one POST, and a generated client would be a large dependency for it.
 *
 * See ADR-0005 for why Brevo is primary, SMTP2GO exists as a same-shape
 * fallback, and for the honest note about how free-tier senders get rewritten.
 */

export type EmailMessage = {
  to: string;
  toName: string;
  subject: string;
  text: string;
  html: string;
};

export interface EmailTransport {
  readonly name: "log" | "brevo" | "smtp2go";
  send(message: EmailMessage): Promise<void>;
}

class LogTransport implements EmailTransport {
  readonly name = "log" as const;

  send(message: EmailMessage): Promise<void> {
    console.log(
      [
        "─── email (not sent: EMAIL_MODE=log) ───",
        `to:      ${message.toName} <${message.to}>`,
        `subject: ${message.subject}`,
        "",
        message.text,
        "────────────────────────────────────────",
      ].join("\n"),
    );
    return Promise.resolve();
  }
}

export class EmailSendError extends Error {
  constructor(provider: string, status: number, body: string) {
    super(`${provider} refused the message (${status}): ${body.slice(0, 200)}`);
    this.name = "EmailSendError";
  }
}

class BrevoTransport implements EmailTransport {
  readonly name = "brevo" as const;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly replyTo: string | undefined,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": this.apiKey,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        // A human display name matters here: on the free tier Brevo rewrites
        // the address itself to one it can authenticate, and the name is what
        // most clients actually show.
        sender: { name: "Hindsight", email: this.from },
        to: [{ email: message.to, name: message.toName }],
        ...(this.replyTo ? { replyTo: { email: this.replyTo } } : {}),
        subject: message.subject,
        textContent: message.text,
        htmlContent: message.html,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new EmailSendError("Brevo", response.status, await response.text());
    }
  }
}

class Smtp2goTransport implements EmailTransport {
  readonly name = "smtp2go" as const;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly replyTo: string | undefined,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch("https://api.smtp2go.com/v3/email/send", {
      method: "POST",
      headers: {
        "X-Smtp2go-Api-Key": this.apiKey,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: this.from,
        to: [`${message.toName} <${message.to}>`],
        subject: message.subject,
        text_body: message.text,
        html_body: message.html,
        ...(this.replyTo
          ? { custom_headers: [{ header: "Reply-To", value: this.replyTo }] }
          : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const raw = await response.text();
    // SMTP2GO returns 200 even for a rejected recipient — the failure count
    // lives in the body, so both the status and the body are checked.
    const failed = (() => {
      try {
        return (
          ((JSON.parse(raw) as { data?: { failed?: number } })?.data?.failed ?? 0) > 0
        );
      } catch {
        return false;
      }
    })();

    if (!response.ok || failed) {
      throw new EmailSendError("SMTP2GO", response.status, raw);
    }
  }
}

let cached: EmailTransport | null = null;

export function emailTransport(): EmailTransport {
  if (cached) return cached;
  const config = env();

  // `features()` has already decided: a provider only when its key is
  // actually there. A missing key costs the send, not the whole server.
  const mode = features().email;
  if (mode === "brevo") {
    if (!config.BREVO_API_KEY) {
      throw new Error("EMAIL_MODE is brevo but BREVO_API_KEY is missing");
    }
    cached = new BrevoTransport(
      config.BREVO_API_KEY,
      config.EMAIL_FROM,
      config.EMAIL_REPLY_TO,
    );
  } else if (mode === "smtp2go") {
    if (!config.SMTP2GO_API_KEY) {
      throw new Error("EMAIL_MODE is smtp2go but SMTP2GO_API_KEY is missing");
    }
    cached = new Smtp2goTransport(
      config.SMTP2GO_API_KEY,
      config.EMAIL_FROM,
      config.EMAIL_REPLY_TO,
    );
  } else {
    cached = new LogTransport();
  }
  return cached;
}

/** Tests replace the transport rather than mocking the module. */
export function setEmailTransport(transport: EmailTransport | null): void {
  cached = transport;
}
