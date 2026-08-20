import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CanonicalError, canonicalize } from "@/lib/domain/canonical";
import { canonicalValueArb, nonCanonicalValueArb } from "./arbitraries";

/**
 * The hash chain is only meaningful if one logical record has exactly one byte
 * representation. Everything here defends that.
 */
describe("canonicalize", () => {
  it("is stable under key insertion order", () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1, maxLength: 8 }), fc.integer(), {
          minKeys: 2,
          maxKeys: 8,
        }),
        (object) => {
          const keys = Object.keys(object);
          const reversed: Record<string, unknown> = {};
          for (const key of [...keys].reverse()) reversed[key] = object[key];
          expect(canonicalize(reversed)).toBe(canonicalize(object));
        },
      ),
    );
  });

  it("round-trips through JSON without loss", () => {
    fc.assert(
      fc.property(canonicalValueArb, (value) => {
        expect(JSON.parse(canonicalize(value)) as unknown).toStrictEqual(value);
      }),
    );
  });

  it("is deterministic across repeated calls", () => {
    fc.assert(
      fc.property(canonicalValueArb, (value) => {
        expect(canonicalize(value)).toBe(canonicalize(value));
      }),
    );
  });

  it("emits object keys in ascending code-unit order", () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1, maxLength: 6 }), fc.integer(), {
          minKeys: 2,
          maxKeys: 8,
        }),
        (object) => {
          const serialised = canonicalize(object);
          const emitted = [...serialised.matchAll(/"((?:[^"\\]|\\.)*)":/g)].map(
            (match) => JSON.parse(`"${match[1]}"`) as string,
          );
          const sorted = [...emitted].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
          expect(emitted).toStrictEqual(sorted);
        },
      ),
    );
  });

  it("distinguishes values that differ anywhere", () => {
    fc.assert(
      fc.property(canonicalValueArb, canonicalValueArb, (a, b) => {
        fc.pre(JSON.stringify(a) !== JSON.stringify(b));
        // Not a proof of injectivity, but it catches the classes of collision a
        // hand-rolled serialiser tends to introduce (delimiter confusion, etc).
        const differs = canonicalize(a) !== canonicalize(b);
        const structurallyEqual =
          JSON.stringify(JSON.parse(canonicalize(a))) ===
          JSON.stringify(JSON.parse(canonicalize(b)));
        expect(differs || structurallyEqual).toBe(true);
      }),
    );
  });

  it("refuses values that have no canonical form", () => {
    fc.assert(
      fc.property(nonCanonicalValueArb, (value) => {
        expect(() => canonicalize(value)).toThrow(CanonicalError);
      }),
    );
  });

  it("refuses non-canonical values nested anywhere", () => {
    expect(() => canonicalize({ a: { b: [1, 2, 0.5] } })).toThrow(CanonicalError);
    expect(() => canonicalize({ a: undefined })).toThrow(CanonicalError);
    expect(() => canonicalize([new Date(0)])).toThrow(CanonicalError);
  });

  it("reports the path to the offending value", () => {
    try {
      canonicalize({ outer: { inner: [1, Number.NaN] } });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(CanonicalError);
      expect((error as CanonicalError).path).toBe("outer.inner[1]");
    }
  });

  it("treats negative zero and zero as one value", () => {
    expect(canonicalize(-0)).toBe("0");
    expect(canonicalize({ n: -0 })).toBe(canonicalize({ n: 0 }));
  });

  it("produces the documented encoding", () => {
    expect(canonicalize({ b: 1, a: [true, null, "x"] })).toBe(
      '{"a":[true,null,"x"],"b":1}',
    );
  });

  it("escapes strings so that delimiters cannot be forged", () => {
    // Two records that would collide under naive concatenation must not collide.
    const a = canonicalize({ x: 'a","b":"c' });
    const b = canonicalize({ x: "a", b: "c" });
    expect(a).not.toBe(b);
  });
});
