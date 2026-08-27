# Deploying Hindsight

Everything here fits on free tiers. It takes about half an hour, most of which is
waiting for a database to provision.

The steps that need a human are the ones that need an account or a credential;
they are marked **operator** and cannot be automated away.

---

## 1. MongoDB Atlas — the database

**operator**

1. Create a free **M0** cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. **Database Access** → add a user with `readWrite` on a database named
   `hindsight`. Use a generated password.
3. **Network Access** → allow `0.0.0.0/0`.

   This looks alarming and is the only option available: M0 has no private
   endpoints, and Vercel's egress addresses are dynamic. SCRAM credentials are
   the actual control. If you later move off M0, tighten this.

4. Copy the `mongodb+srv://` connection string and put the database name in it:

   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/hindsight?retryWrites=true&w=majority
   ```

Then apply the indexes and validators. This is idempotent and safe to re-run:

```bash
MONGODB_URI="mongodb+srv://…/hindsight" pnpm db:setup
```

It is deliberately not run by the application: serverless invocations are short
and numerous, and issuing `createIndex` on a request path would repeat the same
command thousands of times a day for nothing.

---

## 2. Vercel — the application

**operator, first two steps**

1. Install the [Vercel GitHub App](https://github.com/apps/vercel) and grant it
   access to the repository. Without this, Vercel cannot link the project.
2. **New Project** → import the repository. Framework detection handles the rest.
   Set the production branch to `main`.

   Hobby requires the repository to live under a **personal** GitHub account, not
   an organisation, and is restricted to non-commercial use — no ads, no
   payments, no affiliate links, and donations count. See
   [ADR-0001](adr/0001-hosting.md).

3. Deploy once so Vercel assigns the production URL. It will fail to serve until
   step 4, which is expected: the app validates its environment at boot and
   refuses to start half-configured rather than failing later somewhere less
   obvious.

### Environment variables

**operator.** Paste these into **Project → Settings → Environment Variables**,
scoped to **Production**:

| Variable                                    | Value                                   |
| ------------------------------------------- | --------------------------------------- |
| `MONGODB_URI`                               | from step 1                             |
| `BETTER_AUTH_URL`                           | the production URL, no trailing slash   |
| `BETTER_AUTH_SECRET`                        | `openssl rand -base64 32`               |
| `CRON_SECRET`                               | `openssl rand -hex 32`                  |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | step 3                                  |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | step 3                                  |
| `EMAIL_MODE`                                | `brevo` or `smtp2go`                    |
| `BREVO_API_KEY` or `SMTP2GO_API_KEY`        | step 4                                  |
| `EMAIL_FROM`                                | the address verified with that provider |
| `EMAIL_REPLY_TO`                            | an address you actually read            |

**Never set `AUTH_TEST_MODE` in production.** It would be refused anyway — the
gate also requires `VERCEL_ENV` to not be `production`, and there is a test
holding that shut — but do not rely on a safety net you did not need.

Redeploy after saving; environment variables are read at build and boot.

---

## 3. OAuth — sign-in

**operator**

### Google

[Google Cloud Console](https://console.cloud.google.com/apis/credentials) →
**Create credentials → OAuth client ID → Web application**. Authorised redirect
URIs:

```
http://localhost:3000/api/auth/callback/google
https://YOUR-DEPLOYMENT/api/auth/callback/google
```

### GitHub

**Settings → Developer settings → OAuth Apps → New OAuth App.** Since August
2026 an OAuth app accepts up to ten callback URLs, so one app covers both
environments:

```
http://localhost:3000/api/auth/callback/github
https://YOUR-DEPLOYMENT/api/auth/callback/github
```

**Turn off wildcard matching on each callback URL.** It is on by default for
apps with a single URI and for anything created before 2026-08-03, and GitHub's
own documentation calls it a security risk. If your account has not received the
multi-URI rollout yet, create two apps instead.

Both providers are optional in the sense that the app starts without them — a
provider whose credential pair is missing is simply not offered on the sign-in
page. With neither configured, nobody can sign in.

---

## 4. Email — Brevo (primary) — review emails

**operator.** Brevo is the one to use if you're signing up with a free-mail
address (Gmail etc.), which is the common case for a personal project.

1. Create a free account at [brevo.com](https://www.brevo.com). The free tier is
   300 sends a day with no monthly cap.
2. **Senders** → add and verify the address you want mail to come from. Brevo
   emails a six-digit code; no domain is required.
3. **SMTP & API → API Keys** → create a v3 key.
4. Set `EMAIL_MODE=brevo` and `BREVO_API_KEY`.

If Brevo's dashboard is glitchy (a known intermittent issue: the account/org
switcher screen can get stuck blank), try `app.brevo.com` directly rather than
the account-switcher URL, or retry in an incognito window — it is a page-render
issue, not an account problem.

Expect the visible sender to be rewritten to something like
`hindsight@5000001.brevosend.com`. Brevo does that because it cannot authenticate
a free-mail domain, and an address it _can_ authenticate is worth more than a
pretty one. The messages carry a friendly display name and a real Reply-To.

### Alternative: SMTP2GO — only if you own a domain

`EMAIL_MODE=smtp2go` / `SMTP2GO_API_KEY` is implemented and works, but SMTP2GO's
**account signup form rejects free-mail addresses** ("Please use an email at
your own domain to sign up") — confirmed live, 2026-08-27. This blocks account
creation itself, before sender verification is even reached. Only worth trying
if you're signing up with an address at a domain you own. See
[ADR-0005](adr/0005-email-provider.md) for the full history.

To check the wiring without waiting for a real review, set `EMAIL_MODE=log` and
watch the runtime logs — the message is printed instead of sent.

---

## 5. Scheduled resurfacing

The hourly job lives in GitHub Actions because Vercel's Hobby cron is daily-only
with an hour of slop ([ADR-0004](adr/0004-scheduled-jobs.md)).

```bash
gh secret set CRON_SECRET --body "<the same value as in Vercel>"
gh variable set APP_URL --body "https://YOUR-DEPLOYMENT"
gh variable set CRON_ENABLED --body "true"
```

`CRON_ENABLED` is the switch. The workflow exists on `main` from early on but
stays inert until this is set, because scheduled workflows only run from the
default branch and the file has to be there before the release that turns it on.

Trigger it by hand to confirm:

```bash
gh workflow run "Resurface due decisions"
gh run watch
```

A healthy run prints a summary — `scanned`, `sent`, `skippedAlreadySent` and so
on. Run it twice: the second run should send nothing, because the endpoint is
idempotent.

**Note the 60-day rule.** GitHub disables scheduled workflows in repositories
with no activity for 60 days. It emails you first. Re-enable from the Actions
tab. If that matters, register the same URL on
[cron-job.org](https://cron-job.org) as a free second trigger — double firing is
harmless, since the endpoint claims each notification before sending it.

---

## 6. Verifying a deployment

```bash
# public and reachable
curl -sI https://YOUR-DEPLOYMENT | head -1

# strict CSP with a per-request nonce
curl -sI https://YOUR-DEPLOYMENT | grep -i content-security-policy

# the sample journal renders without a session
curl -s https://YOUR-DEPLOYMENT/demo | grep -o "Brier score"

# private things stay private
curl -so /dev/null -w '%{http_code}\n' https://YOUR-DEPLOYMENT/api/export      # 401
curl -so /dev/null -w '%{http_code}\n' -X POST \
  https://YOUR-DEPLOYMENT/api/jobs/resurface                                    # 401
```

Then, in a browser: sign in with each provider, confirm the time zone offered
during onboarding matches where you actually are, record a decision, check that
its fingerprint appears, and run **Settings → Check my record**.

On a phone as well as a desktop — reviews get read on phones.

---

## Running it somewhere else

Nothing here is Vercel-specific except the deployment mechanics. The app is a
standard Next.js server needing a Node runtime and outbound TCP to MongoDB.

Two things to carry over:

- `VERCEL_ENV` is what closes the test-only sign-in gate. On another platform,
  set it to `production` explicitly, or the gate has one fewer lock on it.
- The hourly job is a plain authenticated HTTP endpoint. Any scheduler that can
  POST with a bearer token will do — its contract is deliberately independent of
  what calls it.
