import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isTestAuthEnabled } from "@/lib/auth/test-mode";

/**
 * The test-only sign-in path is a second way into an account. These are the
 * tests that keep it shut.
 */
describe("isTestAuthEnabled", () => {
  it("is off when nothing asks for it", () => {
    expect(isTestAuthEnabled({})).toBe(false);
    expect(isTestAuthEnabled({ VERCEL_ENV: "preview" })).toBe(false);
    expect(isTestAuthEnabled({ AUTH_TEST_MODE: "" })).toBe(false);
    expect(isTestAuthEnabled({ AUTH_TEST_MODE: "0" })).toBe(false);
    expect(isTestAuthEnabled({ AUTH_TEST_MODE: "true" })).toBe(false);
    expect(isTestAuthEnabled({ AUTH_TEST_MODE: "yes" })).toBe(false);
  });

  it("is on where the tests actually run", () => {
    expect(isTestAuthEnabled({ AUTH_TEST_MODE: "1" })).toBe(true);
    expect(isTestAuthEnabled({ AUTH_TEST_MODE: "1", VERCEL_ENV: "development" })).toBe(
      true,
    );
  });

  /**
   * The one that matters. If `AUTH_TEST_MODE` ever leaks into the production
   * environment — pasted into the wrong Vercel scope, copied from a local file,
   * inherited from a template — this has to stay shut anyway.
   */
  it("stays shut in production no matter what the configuration says", () => {
    expect(isTestAuthEnabled({ AUTH_TEST_MODE: "1", VERCEL_ENV: "production" })).toBe(
      false,
    );

    fc.assert(
      fc.property(fc.string(), (value) => {
        expect(
          isTestAuthEnabled({ AUTH_TEST_MODE: value, VERCEL_ENV: "production" }),
        ).toBe(false);
      }),
    );
  });

  it("only ever opens for the exact value, never anything truthy-looking", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.option(fc.constantFrom("production", "preview", "development"), {
          nil: undefined,
        }),
        (testMode, vercelEnv) => {
          const enabled = isTestAuthEnabled({
            AUTH_TEST_MODE: testMode,
            VERCEL_ENV: vercelEnv,
          });
          if (enabled) {
            expect(testMode).toBe("1");
            expect(vercelEnv).not.toBe("production");
          }
        },
      ),
    );
  });
});
