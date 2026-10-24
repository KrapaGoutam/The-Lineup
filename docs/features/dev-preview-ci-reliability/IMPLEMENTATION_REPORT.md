# Implementation report — DEV Preview & CI Reliability

Stage log (newest last). Updated during implementation, not reconstructed.

| Sub-feature                              | State |
| ---------------------------------------- | ----- |
| INFRA-A Preview/Development -> DEV       | 🟡    |
| INFRA-B Database CI registry reliability | 🟡    |
| INFRA-C Environment guardrails           | ⬜    |
| INFRA-D Documentation / CI-CD closeout   | ⬜    |

## Log

- 2026-10-24 — Audit complete, plan written, issue #133 created, branch cut from `development` @ `ead4e8b`.
- 2026-10-24 — **INFRA-A applied.** Added DEV `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `APP_PIN_PEPPER`, `NEXT_PUBLIC_RESTAURANT_SLUG` to Preview and Development; Preview `NEXT_PUBLIC_DEMO_MODE` replaced `true` -> `false` (Development `false`). `NEON_DATABASE_URL` stays Production-only. Values came from `.env.development.local` through a stdin helper that refuses empty values or any value containing the PROD ref. Production entries verified unchanged by metadata diff. Preview deployment of this branch built Ready.
  - Evidence: Preview-env local build has DEV ref (12 files) and no PROD ref; real-mode browser suite against DEV: 15/15 under `next dev`.
  - **Not verifiable here:** the deployed Preview URL is behind Vercel Authentication and the Vercel MCP is not authorised for this team; no bypass secret was created (that would change project settings). Deployed-Preview browser smoke is left to the owner (one login on the Preview URL).
  - **Finding #134 (not fixed, out of scope):** the real-mode suite fails S07 and the A/B/C scenario against a _production build_ (`next start`), passes under `next dev`; reproduced with plain `next build`. Realtime updates to an already-open page are not received. Preview/Production are production builds, so this needs its own investigation.
