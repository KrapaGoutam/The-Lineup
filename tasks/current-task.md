# The Lineup V2.0 — V2-006 Attendance V2

Parent issue: #254 | Program: #248 | Milestone: #8 (OPEN)
Branch: `feature/v2-006-attendance-v2` (local only, not pushed) | Base: `development` (`e796eee3`) | Worktree: `.tmp/v2-006-attendance`
Status: LOCAL CONSOLIDATED REVIEW, TWO P1 FIXES AND ALL VERIFICATION COMPLETE; STOPPED AT Q8; FINANCIAL ACTIVATION OFF; NO PR

## Guardrails

- `main` / `development` untouched; Production no contact; hosted DEV no migrations without separate authorization (Q8).
- One feature branch for all batches; ONE final PR only after the independent review. Do not close #254.
- Existing Neon attendance preserved. Payroll and Tips calculations and confirmed records unchanged.
- R2 records Q1/Q4/Q6/Q9/Q9b decisions as approved (README §15). Activation, Q8, Q5/Q7 and staged closure remain unapproved; do not invent rules or activate native financial processing.
- Local disposable Supabase only (`supabase_db_restaurant-roster`, port 54322). `npx supabase db reset --local` + `npx supabase test db --local` is the recipe; keep `.env.development.local` out of the cwd. Do not use `npm run db:types` (`--linked`).
- Worktree build: `CI=1 npx next build --webpack`. No Python on this box; use node for scripted edits.
- Do NOT push the branch without owner approval: the Vercel Preview would build against hosted DEV, which lacks migrations 83/84.
- The Playwright harness commits fixtures that cannot be deleted (undeletable ledger); reset the local DB before running the count-sensitive pgTAP files (0059, 0062).

## Part 1 — Batch A gate

- [x] Preserve Antigravity WIP `378ee9e`; independent audit, 14 findings fixed; pgTAP 0073 108/108; Batch A checkpoint `3428e5a`.

## Part 2 — Batch B

- [x] V2-006.004 Manager Corrections (`b5dcba6`), V2-006.005 Reporting (`76099f9`), docs (`ac1ade1`), browser acceptance 39/39 (`8593684`).

## Part 3 — Batch C (this session)

- [x] Git/provenance verified (HEAD `8593684`, clean worktree, `origin/development` still `e796eee`, 84 local migrations, branch unpushed).
- [x] Owner-approval check: none exists for Q1-Q8 (issue #254 has no decision) -> policy-gate mode.
- [x] Payroll and Tips contracts audited (README §13.3): Payroll keyed by `neon_user_id`; Tips has no hours formula.
- [x] **P1 fix** (`a76e00a`): restore membership-strict `getCurrentUser`; new `getAttendanceEntryUser`; tests lock the boundary.
- [x] V2-006.006 canonical contract + native adapter + policy gate: `domain/financial-source.ts` (60 tests, mutation-checked).
- [x] Native reader (authority before read, consistent snapshot, malformed row fails the read): `data/native-financial-data.ts` (21 tests).
- [x] Read-only readiness action + manager-only "Preview only" panel (no hours, no money) (14 + 7 tests).
- [x] Tips roster + Allocation board source-aware for the verified location (`3dea698`, `5ccb4b2`).
- [x] V2-006.007 external compatibility: `evaluateExternalRow` translator, parity-tested against `aggregateHours`; Neon reader untouched; no new Neon path.
- [x] pgTAP 0075 (54): financial isolation, no TRUNCATE, confirmed rows byte-identical across real corrections (`e45f74e`).
- [x] Concurrency: 150 reads during 40 corrections, 0 torn reads, version 41, 40 events (README §13.9).
- [x] Consolidated verification: Vitest 3,784; pgTAP 77 files / 2,929; Prettier, ESLint, tsc, `next build --webpack`; Playwright 39/39.
- [x] Documentation (README §13, STATUS, docs/STATUS.md) and this tracker.
- [x] Independent security and financial review R1 (README §14): PARTIAL — no P0/P1; P2 stale-tab read binding fixed (b4d056e, reviewer-authored); native-only Payroll identity + consumption ledger proposed in NATIVE_PAYROLL_IDENTITY_ARCHITECTURE.md (Q9).
- [x] Owner decisions Q1/Q4/Q6/Q9/Q9b recorded in R2; Q8 remains separately gated.
- [ ] Hosted DEV migration gate (Q8): backup, rehearsal, apply 83 and 84, authenticated smoke, reconciliation.
- [ ] Activation prerequisites (README §13.7): Payroll contract for native employees, duplicate-consumption ledger, Q6 workflow, mode-change cutoff contract.
- [ ] Single final PR to `development` after review and gates.

## Current State & Next Step

R1 independent review is complete (README §14; HEAD b4d056e + docs). There is no half-finished file. Next, in order: (1) owner answers Q1, Q4, Q6, Q8 and the new Q9/Q9b (README §13.2, §14.5; architecture in NATIVE_PAYROLL_IDENTITY_ARCHITECTURE.md); (2) only then the hosted DEV migration gate and the single PR; (3) native financial activation needs Q9 implemented in its own approved, reviewed change. Do not rerun the full suites without new code. Do not push, open a PR, or start V2-007 / Inventory UX.

## Final consolidated closeout — 2026-11-10 (local complete; supersedes the sequence above)

Q1/Q4/Q6/Q9/Q9b decisions are recorded in the existing R2 handoff. Q8,
financial activation, Production, backend enforcement and staged closure remain
unapproved. Missing Q8 does not block local review, fixes or verification.

- [x] Verify clean feature worktree at `54d968b`, 17 commits ahead; preserve other worktrees.
- [x] Verify remote development `e796eee3`, main `5e5b7747`; feature remote/PR absent; #254 open without comments.
- [x] Independently inspect R2 migration, financial actions, grants/RLS and actual authenticated behavior.
- [x] Complete focused second review of R1-F1 (`b4d056e`): source/unit plus actual two-tab browser 3/3, with distinct other-location attendance and readiness.
- [x] Reproduce confirmed findings, add failing regression coverage and make narrow fixes.
- [x] Run consolidated local migration, database, concurrency, application and real-browser verification.
- [x] Record exact evidence and update existing handoff and feature documentation (committed with this local closeout; exact SHA in final response/private handoff).
- [ ] Q8: hosted DEV backup/recovery/rehearsal/migration/acceptance (approval required).
- [ ] Owner-accepted staged closeout, one PR and exact-head CI/merge (all gates required).

Data: native Payroll identity and append-only session consumption; historical
Neon/Payroll/Tips must remain unchanged. Authorization: verified subjects,
organization/location membership, explicit grants/RLS, no direct ledger writes.
UI: reporting/correction/location/readiness and existing Neon Payroll, including
denied/empty/error and desktop/tablet/mobile states. Risks: duplicate identity pay,
privileged trigger bypass, stale correction consumption and source transition.
Tests: pgTAP, actual local JWTs, concurrency harness, Vitest/module coverage,
format/lint/types/build and focused local Supabase-backed browser acceptance.

Current step: STOPPED at the explicit Q8 gate after local closeout. Clean local replay to 86, full pgTAP
78 files/3,079, full Vitest 3,837 (7 skips), actual-JWT 12/12, concurrency 25/25,
check and production webpack build, Attendance browser 42 cases (39 + 3 focused
two-tab) and Payroll browser 15/15 passed. Generated local types match the
committed definitions. One contaminated pgTAP attempt was
discarded and repeated alone after reset. No hosted writes, push, PR, merge or
operational activation authorized.

Final local cleanup replayed all 86 migrations and removed the synthetic fixtures:
zero Auth users, Payroll periods and attendance sessions. Financial activation
is OFF and backend enforcement STAGED. Final GitHub gate check: #254 still has
zero comments, no feature PR/remote, development/main refs unchanged. Q8 and
staged acceptance remain unapproved; do not repeat this review without code changes.
