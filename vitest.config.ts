import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // "server-only" is a Next.js bundler alias, not a real npm package --
      // see vitest.server-only-stub.ts for why a test needs this at all.
      "server-only": path.resolve(
        import.meta.dirname,
        "./vitest.server-only-stub.ts",
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      reporter: ["text", "html"],
      include: ["src/features/**/domain/**/*.ts"],
    },
  },
});
