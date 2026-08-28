import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Security headers, and a redirect for signed-out visitors.
 *
 * **This is not a security boundary.** The cookie check below proves only that
 * a cookie exists — not that it is valid, unexpired or unrevoked. Every page
 * and handler that touches a journal calls `getSession` and verifies for
 * itself. Treating a proxy check as authorisation is the exact shape of the
 * fail-open vulnerability discussed in ADR-0006, and it is avoided here by
 * construction: nothing downstream trusts this file.
 *
 * The Content-Security-Policy uses a per-request nonce, which means pages
 * render dynamically rather than being served from a static shell. That is a
 * deliberate trade — the app is small, and a strict policy on a page holding
 * somebody's private assessments is worth more than a prerendered marketing
 * page.
 */

/**
 * Every route that needs an account. A route missing from here still refuses a
 * signed-out visitor — the page checks its own session — but the bounce loses
 * the destination, so the reader signs in and lands somewhere generic instead
 * of where they were going. `/practice` was missing and did exactly that.
 */
const SIGNED_IN_ONLY = ["/dashboard", "/decisions", "/review", "/settings", "/practice"];

/** Avatars come straight from the identity provider; nothing else is remote. */
const AVATAR_HOSTS = [
  "https://lh3.googleusercontent.com",
  "https://avatars.githubusercontent.com",
];

function contentSecurityPolicy(nonce: string, isDevelopment: boolean): string {
  const directives = [
    "default-src 'self'",
    // 'strict-dynamic' lets the nonced entry script load the rest of the bundle
    // without listing every chunk. React needs eval in development only.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    isDevelopment
      ? "style-src 'self' 'unsafe-inline'"
      : `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' data: ${AVATAR_HOSTS.join(" ")}`,
    // Fonts are self-hosted by next/font, so no external font origin is needed.
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ];
  if (!isDevelopment) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export function proxy(request: NextRequest): NextResponse {
  const isDevelopment = process.env.NODE_ENV === "development";
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy(nonce, isDevelopment);

  const { pathname } = request.nextUrl;
  const needsSignIn = SIGNED_IN_ONLY.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (needsSignIn && !getSessionCookie(request, { cookiePrefix: "hindsight" })) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("next", pathname);
    return NextResponse.redirect(signIn);
  }

  // Next reads the policy off the *request* headers to attach the nonce to the
  // scripts it emits, so it has to be set in both places.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  );
  if (!isDevelopment) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except build output and static assets, which need neither a
    // policy nor a session.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
