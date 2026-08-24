import type { Metadata, Viewport } from "next";
import { Archivo, Newsreader, Spline_Sans_Mono } from "next/font/google";
import { headers } from "next/headers";
import { siteUrl } from "@/lib/schemas/env";
import "./globals.css";

/**
 * Three faces, three jobs. Newsreader carries the journal voice — your own
 * words about your own decisions. Archivo runs the interface. Spline Sans Mono
 * holds the numbers, which are the product, and keeps its columns while doing
 * it.
 */
const newsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-newsreader",
  axes: ["opsz"],
});

const archivo = Archivo({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-archivo",
});

const splineSansMono = Spline_Sans_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-spline-mono",
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
      className={`${newsreader.variable} ${archivo.variable} ${splineSansMono.variable}`}
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
