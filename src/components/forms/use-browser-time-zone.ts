"use client";

import { useSyncExternalStore } from "react";

/**
 * The time zone the browser reports, or `null` on the server.
 *
 * `useSyncExternalStore` rather than an effect: this is a value that genuinely
 * differs between server and client and never changes afterwards, which is
 * exactly what the server-snapshot argument is for. Reading it in an effect
 * would work but would render once with the wrong answer first.
 */
const noopSubscribe = () => () => {};
const readBrowser = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const readServer = () => null;

export function useBrowserTimeZone(): string | null {
  return useSyncExternalStore(noopSubscribe, readBrowser, readServer);
}
