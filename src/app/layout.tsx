import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { headers } from "next/headers";
import { siteUrl } from "@/lib/schemas/env";
import "./globals.css";

/**
 * Three faces, three jobs — see DESIGN.md § Type.
 *
 * Fraunces carries the journal voice: your own words about your own decisions,
 * and every heading. IBM Plex Sans runs the interface, engineered for technical
 * reading without being anonymous about it. IBM Plex Mono holds the numbers,
 * which are the product, and keeps its columns while doing it.
 *
 * All three load with `display: "swap"`, and the fallback stacks are chosen for
 * similar metrics so the swap does not shift layout.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fraunces",
  axes: ["SOFT", "WONK", "opsz"],
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plex-sans",
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plex-mono",
  weight: ["400", "500"],
});

const SITE_URL = siteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Hindsight — a decision journal that scores your judgement",
    template: "%s · Hindsight",
  },
  description:
    "Record what you expect to happen and how sure you are. Hindsight locks the prediction, brings it back when the outcome is known, and measures how well your confidence matches reality.",
  applicationName: "Hindsight",
  openGraph: {
    type: "website",
    siteName: "Hindsight",
    title: "Hindsight — a decision journal that scores your judgement",
    description:
      "Your memory rewrites what you originally believed. Hindsight makes the original belief permanent, then scores it.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f4f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1416" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading the per-request nonce is what opts every route into dynamic
  // rendering, which a nonce-based CSP requires: a prerendered shell would
  // carry a stale nonce and every script on the page would be refused.
  // See src/proxy.ts.
  await headers();

  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
