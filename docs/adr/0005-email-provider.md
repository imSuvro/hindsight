# ADR-0005: Send review notifications through Brevo

**Status:** Accepted
**Date:** 2026-08-20
**Deciders:** Suvra Samajder

## Context

When a decision comes due, the user gets an email. Volume is tens per day at
most. The constraints are that it must cost nothing and that **the operator
does not own a custom domain**, which turns out to be the binding constraint
rather than the price.

Most transactional email providers gate sending to arbitrary recipients behind
DNS verification of a domain you control. Without a domain, their free tiers
will only send to your own address, which is useless for a real product.

## Decision

Use **Brevo** (formerly Sendinblue) with a single verified sender address as
the primary transport, with **SMTP2GO** implemented as a same-shape
alternative — same interface, same free-without-a-domain constraint satisfied,
switched by one environment variable rather than a code change.

Sending goes through a transport interface with three implementations:

```
EMAIL_MODE=log      → prints the notification, sends nothing
EMAIL_MODE=brevo    → sends for real, via Brevo's REST API
EMAIL_MODE=smtp2go  → sends for real, via SMTP2GO's REST API
```

Development, tests, CI and the end-to-end suite all run on `log`, so no test
run can ever reach a real inbox or consume quota.

**Why both are implemented, not just Brevo.** The reasoning below still holds —
Brevo's daily-cap-only free tier has more headroom than SMTP2GO's 25/hour
unverified-sender limit, so Brevo is the one to reach for first. `Smtp2goTransport`
in `src/lib/email/transport.ts` was added so that a flaky Brevo dashboard
wouldn't block getting a deployment fully working — flip `EMAIL_MODE` and move
on, no code change needed.

**In practice, SMTP2GO turned out not to be that escape hatch.** Signing up
live (2026-08-27) hit a hard wall the earlier research missed: SMTP2GO's
account **signup form** rejects free-mail addresses outright ("Please use an
email at your own domain to sign up"). That is a different check from sender
verification — it gates creating the account at all, before a sender address
ever comes into it. Someone without a personal domain cannot open a SMTP2GO
account, full stop. The transport code stays, because it is correct and a
domain owner can use it today, but the operator playbook now recommends going
back to Brevo (or waiting out its dashboard glitch) rather than treating
SMTP2GO as a guaranteed fallback.

## Options considered

| Provider                  | Free tier                     | Works without a domain?                                                                                                                                                                                                                                                                                     | Verdict                                          |
| ------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Brevo**                 | 300 sends/day, no monthly cap | **Yes** — verify one sender address by emailed code                                                                                                                                                                                                                                                         | **Chosen**                                       |
| SMTP2GO                   | 1,000/month, 200/day, 25/hour | Sender verification is domain-free, but account **signup itself is not**: the signup form rejects free-mail addresses (`gmail.com` etc.) outright with "Please use an email at your own domain to sign up" (confirmed live, 2026-08-27). Only usable if the operator already owns a domain to sign up with. | Close second in theory, blocked without a domain |
| Resend                    | 3,000/month, 100/day          | **No** — without a verified domain it will only send to your own address                                                                                                                                                                                                                                    | Rejected                                         |
| MailerSend                | 500/month                     | No — sending domains are DNS-verified                                                                                                                                                                                                                                                                       | Rejected                                         |
| Postmark                  | 100/month                     | Effectively no, and 100/month is ~3/day                                                                                                                                                                                                                                                                     | Rejected                                         |
| Mailtrap                  | —                             | No — demo domain sends only to the registered address                                                                                                                                                                                                                                                       | Rejected                                         |
| Gmail SMTP via Nodemailer | —                             | Violates Google's terms for application sending and risks the account the project depends on                                                                                                                                                                                                                | Rejected outright                                |

Brevo over SMTP2GO on headroom: 300/day with no monthly ceiling absorbs a burst
of due reminders, whereas SMTP2GO's 25/hour unverified-sender cap would throttle
exactly the case where several decisions come due at once. That headroom
argument is why Brevo stays primary even though both are implemented.

## The deliverability trade-off, stated plainly

Sending "from" a `gmail.com` address through a third-party relay does not
DKIM- or SPF-align, and mailbox providers treat that pattern as a phishing
signature regardless of what DMARC policy says.

Brevo's answer is to rewrite the visible sender to a Brevo-controlled,
Brevo-authenticated subdomain — so the From address a recipient sees looks
something like `hindsight@5000001.brevosend.com`. That is the right engineering
call: it makes the message authenticate as something. The cost is a From address
that looks machine-generated.

Mitigations, all implemented:

- A human From **display name** ("Hindsight"), which is what most clients show.
- **Reply-To** set to a real address, so replies work.
- The onboarding flow tells users the sender looks unusual and asks them to
  allow it, instead of letting them discover it in a spam folder.

This is acceptable **only because email is a nudge and never a requirement**.
Sign-in is OAuth-only — there are no magic links and no password resets — so
nothing a user needs is trapped behind delivery. The in-app review queue is the
primary surface and is always correct.

## Consequences

**Easier.** No domain purchase, no DNS records, no waiting on propagation. The
transport interface means email is trivially testable and CI can never send.

**Harder.** A non-trivial share of notifications will land in spam, and there is
no way to fix that without a domain. Brevo's free tier also appends its own
footer to messages.

**To revisit.** Buying a domain (roughly $10/year) is the single highest-value
upgrade available to this project. It unlocks proper SPF/DKIM/DMARC alignment, a
professional sender address, and — if the switch is worth making at that point —
Resend's noticeably better developer experience. The transport interface exists
so that change is one implementation file, not a refactor. It is not assumed
here because the brief says free.
