# The Lineup V2.0 — V2-006 Attendance V2

Parent issue: #254 | Program: #248 | Milestone: #8 (OPEN)
Branch: `feature/v2-006-attendance-v2` | Base: `development` (`e796eee3`) | Worktree: `.tmp/v2-006-attendance`
Status: BATCH A VERIFIED + CORRECTED — BATCH B IN PROGRESS

## Guardrails

- `main` / `development` untouched; Production no contact; hosted DEV no migrations without separate authorization.
- One feature branch for all batches; NO PR until Batch C is complete. Do not close #254.
- Existing Neon attendance preserved. Payroll and Tips unchanged until Batch C.
- Local disposable Supabase only (`supabase_db_restaurant-roster`, port 54322). Do not use `npm run db:types` (`--linked` = hosted); use `supabase gen types typescript --local` then prettier.

## Part 1 — Batch A gate

- [x] Preserve uncommitted Antigravity work as WIP commit `378ee9e` (unverified snapshot).
- [x] Independent security / integrity audit — 13 findings fixed in place (README §3).
- [x] Break-pay assumption removed: policy-neutral facts + per-break explicit classification + derived `net_payable_seconds` (NULL until resolved).
- [x] pgTAP `0073`: 108/108 behavioural assertions pass.
- [x] Real parallel-session concurrency checks pass.
- [x] Vitest attendance + locations 348/348; tsc, ESLint, Prettier clean.
- [ ] Batch A verified checkpoint commit.

## Part 2 — Batch B

- [ ] V2-006.004 Manager Corrections (migration, RPC, action, UI, tests)
- [ ] V2-006.005 Unified Attendance Reporting (source selection, UI, tests)
- [ ] Focused regression + one production build
- [ ] Docs, receipts, Batch C handoff

## Current State & Next Step

Batch A gate complete; committing checkpoint. Next: design Batch B migration `20261110010000_attendance_corrections.sql`.
