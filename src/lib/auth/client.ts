"use client";

import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { Auth } from "./auth";

/**
 * The browser half of authentication.
 *
 * `inferAdditionalFields` carries the shape of the fields declared on the
 * server — `timeZone`, `emailOptIn`, `onboardedAt` — across to the client, so
 * they arrive typed rather than as an untyped bag.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<Auth>()],
});

export const { signIn, signOut, useSession } = authClient;
