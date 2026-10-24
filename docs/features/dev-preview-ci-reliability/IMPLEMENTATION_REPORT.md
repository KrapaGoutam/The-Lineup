# Implementation report — DEV Preview & CI Reliability

Stage log (newest last). Updated during implementation, not reconstructed.

| Sub-feature                              | State                                      |
| ---------------------------------------- | ------------------------------------------ |
| INFRA-A Preview/Development -> DEV       | ✅ applied (deployed-Preview smoke: owner) |
| INFRA-B Database CI registry reliability | ✅ implemented; CI run pending on PR       |
| INFRA-C Environment guardrails           | ✅                                         |
| INFRA-D Documentation / CI-CD closeout   | 🟡 final status after merge                |

## Log

- 2026-10-24 — Audit complete, plan written, issue #133 created, branch cut from `development` @ `ead4e8b`.
- 2026-10-24 — **INFRA-A applied.** Added DEV `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `APP_PIN_PEPPER`, `NEXT_PUBLIC_RESTAURANT_SLUG` to Preview and Development; Preview `NEXT_PUBLIC_DEMO_MODE` replaced `true` -> `false` (Development `false`). `NEON_DATABASE_URL` stays Production-only. Values came from `.env.development.local` through a stdin helper that refuses empty values or any value containing the PROD ref. Production entries verified unchanged by a metadata diff (names, types, ages). Pushing the branch produced a Ready Preview deployment.
  - Evidence: a local build with the Preview env has the DEV ref (12 files) and no PROD ref; the real-mode browser suite against DEV passes 15/15 under `next dev`.
  - **Not verifiable here:** the deployed Preview URL is behind Vercel Authentication and the Vercel MCP is not authorised for this team; no bypass secret was created (it would change project settings). Deployed-Preview browser smoke (one login on the Preview URL; Table Allocation / Schedule / Team load) is left to the owner.
  - **Finding #134 (not fixed, out of scope):** the real-mode suite fails S07 and the A/B/C scenario against a _production build_ (`next start`) but passes under `next dev`; reproduced with a plain `next build`. Realtime updates to an already-open page are not received. Preview and Production are production builds, so this needs its own investigation.
- 2026-10-24 — **INFRA-B implemented.** `scripts/ci/supabase-start.mjs` replaces the bare `supabase start` in `.github/workflows/database.yml` (same 10 excluded services). It sets `SUPABASE_INTERNAL_IMAGE_REGISTRY` and tries ghcr.io, then public.ecr.aws, then docker.io: at most 3 attempts with 15s/45s backoff, **only** when the output is classified registry-transient; anything else fails at once with an annotation. Retries emit `::warning::`; final failure emits `::error::` with the classification. `deploy-migrations` is also pinned to `refs/heads/main`; `workflow_dispatch` added; `vitest.config.ts` includes `scripts/**/*.test.ts`.
  - Local evidence: stack started via ghcr.io on attempt 1 (CLI 2.76.8 honours the env var); `db:reset` 35 migrations; `db:test` 25 files / 387 assertions PASS; 11 unit tests.
  - Residual risk: all three registries limited at once would fail the job visibly (never hidden). Image caching remains a documented option.
- 2026-10-24 — **INFRA-C implemented.** `scripts/check-nonprod-env.mjs` (+ `npm run check:env`, CI step scanning `.next` after the build). Reports names/paths only. Passes on `.env.development.local` and the DEV-env `.next`; fails (exit 1) on `.env.production.local`. 8 unit tests. `tests/real/**` guards unchanged.
- 2026-10-24 — **INFRA-D docs** updated: `docs/CI_CD.md`, `docs/DEPLOYMENT.md`, `docs/STATUS.md`, `docs/ROADMAP.md`, `tasks/current-task.md`.
