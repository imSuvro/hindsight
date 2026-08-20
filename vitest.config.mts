import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          setupFiles: ["tests/unit/setup.ts"],
          // Property-based suites explore a large state space; give them room.
          testTimeout: 60_000,
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          // First run may download the pinned mongod binary.
          hookTimeout: 180_000,
          testTimeout: 60_000,
          // One mongod, many workers: keep collections isolated per file instead
          // of paying for a server per file.
          fileParallelism: false,
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/lib/domain/**", "src/lib/db/**", "src/lib/email/**"],
      thresholds: {
        // The domain core is the product's correctness claim; it is held to a
        // higher bar than the app shell around it.
        "src/lib/domain/**": {
          statements: 95,
          branches: 90,
          functions: 95,
          lines: 95,
        },
      },
    },
  },
});
