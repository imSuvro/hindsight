# ADR-0006: Authenticate with Better Auth, OAuth only

**Status:** Accepted
**Date:** 2026-08-20
**Deciders:** Suvra Samajder

## Context

Hindsight holds a person's private assessments of their own career, money and
relationships. It is among the more sensitive things a hobby project could
store. Sign-in has to be Google and GitHub OAuth, sessions have to be handled
properly, and the library choice has to survive being looked at by someone who
cares.

## Decision

**Better Auth v1.7.1 or later**, with Google and GitHub social providers, the
MongoDB adapter, and **no optional feature plugins**.

Sign-in is **OAuth only**. There are no passwords, no magic links and no
password resets in the product — which removes the entire credential-handling
attack surface and means nothing a user needs depends on email delivery
(see [ADR-0005](0005-email-provider.md)).

## Options considered

### Better Auth — chosen

The decisive fact is that **Auth.js told us to**. The Auth.js project was
absorbed into the Better Auth team in September 2025, and the announcement
explicitly recommends Better Auth for new projects.

Beyond that: first-class MongoDB support with no schema-generation or migration
step; documented Next.js 16 integration including the `middleware` → `proxy`
rename; and, as of August 2026, more weekly downloads than `next-auth`.

### Auth.js / NextAuth v5 — rejected

Still `5.0.0-beta.32` after roughly three years, with no stable date and an open
discussion asking when it ends. `npm install next-auth` still resolves to v4.
Two **critical** advisories were published in July 2026 — including one where
misconfiguration causes existence-based auth checks to fail _open_ — patched
only in the latest beta. Building new code on a beta tag the maintainers have
redirected away from is debt with no upside.

### Lucia — rejected

Deprecated in March 2025. It now exists as a learning resource, not a library.

## Security posture

**Better Auth has a busy advisory history** — around twenty advisories since
early 2025, several high and two critical. That is read here as a project under
active security research that patches quickly, not as an unsafe one; Auth.js
shipped two criticals in the same window. It is managed rather than ignored:

- **Pin to the latest release and enable Dependabot.** Staying current _is_ the
  control for a library with this cadence.
- **Load no optional feature plugins.** The high-severity advisories cluster in
  `oidc-provider`, `mcp`, `api-key`, device authorisation, SCIM and
  organisation — code this project has no reason to load. The one exception is
  `nextCookies()`, which is framework glue for Next.js cookie handling rather
  than a feature surface, and must be last in the plugin array.

**The proxy is not a security boundary.** `src/proxy.ts` performs an optimistic
cookie check to redirect signed-out visitors, and generates the CSP nonce.
Nothing more. Every route handler and every server component that touches user
data calls `auth.api.getSession` and verifies for itself. This is precisely the
class of mistake behind the Auth.js fail-open advisory, and it is avoided by
construction rather than by care.

**Sessions** are database-backed with a short-lived signed cookie cache: the
common path costs no database round-trip, and sessions remain genuinely
revocable. Cookies are `HttpOnly`, `Secure` in production, `SameSite=Lax`.

**CSRF and origin checking** are Better Auth's defaults, left on. `trustedOrigins`
lists the production URL and localhost. OAuth deliberately does not work on
Vercel preview deployments, because their URLs are neither registered with the
providers nor trusted — an accepted limitation, not a bug to chase.

## The test-only sign-in path

End-to-end tests need to sign in without a browser reaching Google. Better
Auth's email-and-password method is enabled for that, gated on:

```ts
enabled: process.env.AUTH_TEST_MODE === "1" && process.env.VERCEL_ENV !== "production";
```

`VERCEL_ENV` is set by the platform and cannot be overridden by a misconfigured
environment variable, so the gate cannot be opened by accident. A unit test
asserts the configuration resolves to disabled under `VERCEL_ENV=production`
even when `AUTH_TEST_MODE=1` is present, and the variable is never added to the
production environment.

An earlier draft of this plan claimed the path would be "compile-time excluded".
That is not achievable — server environment variables are read at runtime and
there is no dead-code elimination to rely on. This is the provable version of
that intent, and it is written down here so nobody later mistakes the weaker
guarantee for the stronger one.

## Consequences

**Easier.** No password storage, no reset flow, no credential stuffing surface.
Account linking, session revocation and user deletion come from the library.

**Harder.** A user who loses access to both their Google and GitHub accounts
loses their journal; there is no recovery path, and the README says so.
Dependency currency becomes an ongoing obligation rather than a one-off setup
task.

**To revisit.** If Auth.js ever ships a stable v5 under active maintenance, this
is worth re-examining — but the migration would need to earn its cost.
