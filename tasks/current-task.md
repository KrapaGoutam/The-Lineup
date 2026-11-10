# The Lineup V2.0 — V2-006 Attendance V2

Parent issue: #254 | Program: #248 | Milestone: #8 (OPEN)
Branch: `feature/v2-006-attendance-v2` (local only, not pushed) | Base: `development` (`e796eee3`) | Worktree: `.tmp/v2-006-attendance`
Status: BATCH A VERIFIED + CORRECTED — BATCH B DELIVERED (UNMERGED) — BATCH C NOT STARTED

## Guardrails

- `main` / `development` untouched; Production no contact; hosted DEV no migrations without separate authorization.
- One feature branch for all batches; NO PR until Batch C is complete. Do not close #254.
- Existing Neon attendance preserved. Payroll and Tips unchanged until Batch C.
- Local disposable Supabase only (`supabase_db_restaurant-roster`, port 54322). Do not use `npm run db:types` (`--linked` = hosted); use `supabase gen types typescript --local` then prettier.
- Worktree build: `CI=1 npx next build --webpack` (Turbopack cannot follow the junctioned node_modules).
- Do NOT push the branch without owner approval: the Vercel Preview would build against hosted DEV, which lacks these migrations.

## Part 1 — Batch A gate

- [x] Preserve uncommitted Antigravity work as WIP commit `378ee9e`.
- [x] Independent audit — 14 findings fixed (README §3, §10).
- [x] Break-pay assumption removed (policy-neutral facts + explicit per-break classification + derived payable NULL until resolved).
- [x] pgTAP 0073 108/108; real parallel-session concurrency checks.
- [x] Batch A verified checkpoint commit `3428e5a`.

## Part 2 — Batch B

- [x] V2-006.004 Manager Corrections: migration `20261110010000`, RPC, pgTAP 0074 (66), actions, dialog UI, tests (`b5dcba6`).
- [x] V2-006.005 Unified Attendance Reporting: source selection, native report, tests; Batch A module-guard defect fixed (`76099f9`).
- [x] Focused regression: 15 pgTAP files / 778 assertions on a freshly reset DB; vitest 765+; tsc / ESLint / Prettier clean; `next build --webpack` OK.
- [x] Docs, receipts, Batch C handoff (README §5–§12).
- [x] Browser/Playwright verification of the new screens (39/39 passing across desktop, tablet, and mobile viewports in real browser via `tests/local/ui/attendance-location.local.spec.ts`).

## Current State & Next Step

Batch B browser acceptance, reconciliation, and verification are 100% complete and verified locally. Stop here. Next (needs the owner): answer README §11 decisions Q1/Q4/Q6 (and Q8 for hosted rollout), then start Batch C per README §12.
