import path from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Real Auth/JWT suite, deliberately excluded from npm test. The shared harness
 * defaults to hosted the-lineup-dev; explicit LINEUP_REAL_LOCAL=1 accepts only
 * restaurant-roster on 127.0.0.1:54321 with process-provided local credentials.
 * Run with npm run test:real or select a specific real.test.ts file.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "server-only": path.resolve(
        import.meta.dirname,
        "./vitest.server-only-stub.ts",
      ),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/real/**/*.real.test.ts"],
    fileParallelism: false,
    testTimeout: 90_000,
    hookTimeout: 180_000,
    reporters: [
      "verbose",
      ["json", { outputFile: "test-results/real-mode.json" }],
    ],
  },
});
