import path from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Local-stack suite (V2-004.004): real Supabase Auth JWTs against the
 * DISPOSABLE local database started by `supabase start`. The harness refuses
 * any non-loopback URL, so it can never touch hosted DEV or Production.
 * Deliberately NOT part of `npm test`.
 *
 *   LOCAL_SUPABASE_URL / LOCAL_SUPABASE_ANON_KEY / LOCAL_SUPABASE_SERVICE_KEY
 *   come from `supabase status -o env` (loopback only).
 *   Run with `npm run test:local`.
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
    include: ["tests/local/**/*.local.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
