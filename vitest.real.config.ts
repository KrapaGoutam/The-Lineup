import path from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Real-mode suite: runs against the hosted the-lineup-dev project with real
 * Auth sessions (see tests/real/support/harness.ts, which hard-aborts on any
 * other project). Deliberately NOT part of `npm test` -- it needs DEV
 * credentials and the network. Run with `npm run test:real`.
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
