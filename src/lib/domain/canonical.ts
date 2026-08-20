/**
 * Deterministic serialisation, version 1.
 *
 * A hash is only as trustworthy as the bytes it was computed over. `JSON.stringify`
 * preserves insertion order, so the same logical record can serialise two ways
 * and produce two different digests — which would make an honest record look
 * tampered with. This module defines one and only one byte sequence per value.
 *
 * The rules are deliberately narrow, and violations throw rather than coerce:
 *
 * - Object keys are emitted in ascending UTF-16 code-unit order.
 * - Numbers must be finite integers. Floating point is refused outright because
 *   `0.1 + 0.2` does not round-trip and a record must round-trip exactly.
 * - `undefined`, functions, symbols and non-plain objects are refused; there is
 *   no silent key-dropping, because a dropped key is a changed record.
 * - Strings are assumed already NFC-normalised by the input schemas, so that the
 *   bytes stored and the bytes hashed are the same bytes.
 *
 * The scheme is versioned (`CANONICAL_VERSION`) and that version is part of what
 * gets hashed, so the rules can change later without invalidating old chains.
 */

export const CANONICAL_VERSION = 1;

export class CanonicalError extends Error {
  readonly path: string;

  constructor(message: string, path: string) {
    super(path ? `${message} (at ${path || "<root>"})` : message);
    this.name = "CanonicalError";
    this.path = path;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function encodeString(value: string): string {
  // JSON string escaping is fully specified and deterministic, including the
  // escaping of lone surrogates, so it is safe to delegate.
  return JSON.stringify(value);
}

function encodeNumber(value: number, path: string): string {
  if (!Number.isFinite(value)) {
    throw new CanonicalError("Numbers must be finite", path);
  }
  if (!Number.isInteger(value)) {
    throw new CanonicalError(
      "Numbers must be integers; represent fractions as scaled integers",
      path,
    );
  }
  // -0 and 0 are the same value and must not produce different bytes.
  return Object.is(value, -0) ? "0" : String(value);
}

function write(value: unknown, path: string, out: string[]): void {
  if (value === null) {
    out.push("null");
    return;
  }
  switch (typeof value) {
    case "string":
      out.push(encodeString(value));
      return;
    case "number":
      out.push(encodeNumber(value, path));
      return;
    case "boolean":
      out.push(value ? "true" : "false");
      return;
    case "undefined":
      throw new CanonicalError("undefined has no canonical form", path);
    case "bigint":
      throw new CanonicalError("bigint has no canonical form", path);
    case "function":
    case "symbol":
      throw new CanonicalError(`${typeof value} has no canonical form`, path);
    default:
      break;
  }

  if (Array.isArray(value)) {
    out.push("[");
    for (let i = 0; i < value.length; i += 1) {
      if (i > 0) out.push(",");
      write(value[i], `${path}[${i}]`, out);
    }
    out.push("]");
    return;
  }

  if (!isPlainObject(value)) {
    throw new CanonicalError(
      "Only plain objects, arrays and primitives have a canonical form",
      path,
    );
  }

  const keys = Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  out.push("{");
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (i > 0) out.push(",");
    out.push(encodeString(key), ":");
    write(value[key], path ? `${path}.${key}` : key, out);
  }
  out.push("}");
}

/** The one byte sequence that represents `value`. Throws if it has none. */
export function canonicalize(value: unknown): string {
  const out: string[] = [];
  write(value, "", out);
  return out.join("");
}
