import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

/**
 * Type-aware linting is enabled for application, script and test sources only.
 * Config files stay on the syntax-only parser so they do not need to appear in
 * tsconfig's include list.
 */
const typeAwareFiles = ["src/**/*.{ts,tsx}", "tests/**/*.ts", "scripts/**/*.ts"];

export default defineConfig([
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "test-results/**",
    "playwright-report/**",
    ".cache/**",
    "next-env.d.ts",
  ]),
  ...nextVitals,
  ...nextTs,
  {
    // eslint-config-next already registers the jsx-a11y plugin, so these turn
    // on the rules it leaves off rather than re-registering it. Accessibility
    // is a merge gate here, not a later pass.
    files: ["src/**/*.tsx"],
    rules: {
      "jsx-a11y/label-has-associated-control": "error",
      "jsx-a11y/no-autofocus": "error",
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-static-element-interactions": "error",
      "jsx-a11y/no-noninteractive-element-interactions": "error",
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",
      "jsx-a11y/interactive-supports-focus": "error",
      "jsx-a11y/tabindex-no-positive": "error",
    },
  },
  {
    files: typeAwareFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // `any` is banned outright: this codebase is type-safe end to end with
      // runtime validation at every boundary.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      // Unawaited promises in route handlers silently drop database writes.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // Scripts and the job runner legitimately write to stdout.
    files: ["scripts/**/*.{ts,mjs}", "src/lib/email/transport.ts"],
    rules: { "no-console": "off" },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
]);
