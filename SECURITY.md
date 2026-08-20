# Security

Hindsight stores private assessments of a person's career, money, health and
relationships. That makes it a more sensitive target than its size suggests, and
reports are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue.** Use GitHub's private vulnerability
reporting on this repository: **Security → Report a vulnerability**.

Include what you did, what you observed, and why you believe it is exploitable.
A proof of concept is welcome; please use an account you control and do not
access another person's journal.

Expect an acknowledgement within a few days. This is a personal project rather
than a funded one, so there is no bounty and no formal response-time guarantee —
but you will get a straight answer about whether it is being fixed and when.

## What is stored

- Your name, email address and avatar URL, as supplied by Google or GitHub at
  sign-in.
- Your time zone, so reviews arrive on the day you meant.
- Whether you want review emails.
- Everything you write in a decision: title, situation, expected outcome,
  confidence, domain, tags, review date, outcome and closing notes.
- The SHA-256 hash chain over those entries.

There is no analytics, no tracking, no third-party script, and no AI or LLM
anywhere in the product. Decision content is never sent to any external service.
The only outbound traffic carrying user data is the review email, which contains
the decision title and goes to the address you signed in with.

## What is not stored

No passwords — sign-in is OAuth only, so there is no credential to steal. No
OAuth refresh tokens are used after sign-in. No payment details; the product
takes no money.

## Deleting everything

Settings → Delete account removes your user record, sessions, linked OAuth
accounts, every ledger entry, every decision and every notification record. It
is immediate and it is not recoverable.

Deleting your own journal is not tampering, and the design says so explicitly:
falsifying a record and destroying it are different acts, and only one of them
is a threat to you. See [ADR-0002](docs/adr/0002-tamper-evidence.md).

## Known limitations

These are real and are listed so nobody has to discover them:

- **Rate limiting is best-effort.** The application runs on serverless functions
  that share no memory, so per-instance throttling is a speed bump rather than a
  control. Durable rate limiting needs infrastructure this project does not pay
  for. Sign-in itself is rate-limited by Better Auth.
- **The hash chain detects tampering; it does not prevent it.** Anyone holding
  the database can rewrite every row and recompute the chain. What defeats that
  is the head digest published in the app, in every email and in every export —
  a copy you already hold that they cannot reach.
- **Truncation of the most recent entries is not detectable from the chain
  alone**, because any prefix of a valid chain is itself valid. Same defence:
  compare against a head you were shown earlier.
- **Losing both OAuth accounts means losing the journal.** There is no recovery
  path, because adding one would mean adding a way in that is not OAuth.

## Supported versions

The latest release, on the `main` branch. There are no backports.
