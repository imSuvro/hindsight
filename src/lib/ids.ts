import { randomBytes } from "node:crypto";

/**
 * Identifiers that appear in URLs.
 *
 * Twelve random bytes render as exactly sixteen URL-safe base64 characters —
 * 96 bits of entropy, which is more than enough that ids cannot be guessed or
 * enumerated, in a string short enough to look deliberate in an address bar.
 */
export function newDecisionId(): string {
  return randomBytes(12).toString("base64url");
}
