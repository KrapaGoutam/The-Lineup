# Attendance manual entry and corrections — IN PROGRESS

## Independent review checkpoint — 2026-11-11

- [x] Verify isolated feature worktree at `ac079488`, base `d09b6c4`, original migration hash and preserved V2-006 task archive; leave unrelated worktrees untouched.
- [x] Review privileged RPC, app flow, grants/RLS, idempotency, time and financial boundary; reproduce and fix the post-midnight open-entry retry and bulk row-isolation defects.
- [x] Correct nullable RPC type and add explicit bulk overnight end date and accessible row labels.
- [x] Run focused local pgTAP 282/282, Attendance Vitest 356/356, `npm run check`, webpack production build and diff check.
- [x] Commit the scoped review fixes locally as `459ee222c05a39ea13d77e3e35df64817c7fe78a`; no remote feature branch or PR was created.
- [x] Run actual local JWT role/tenant/concurrency, source-mode, frozen-month and direct-forgery acceptance with normal Auth users; see private `LOCAL_ACCEPTANCE_2026-11-11.md`.
- [x] Run real local desktop Chromium, WebKit tablet/mobile browser flows for saved shifts, correction, bulk partial success, DST, future, wrong location and revocation.
- [ ] Complete dedicated keyboard Enter/touch tap rerun; intermittent local `PGRST303 JWT issued at future` interrupted this check. Earlier browser navigation worked by click on touch-capable WebKit devices.
- [ ] Obtain new owner authorization for the exact DEV migration/backup/recovery/acceptance/Preview/PR scope after local acceptance passes. No such record found on 2026-11-11.
- [ ] Reverify final migration hash, fresh backup and isolated recovery/rehearsal; then migrate DEV and complete hosted authenticated/Preview acceptance and manifest cleanup under the new authorization.
- [ ] Push existing branch, open one PR to `development`, require exact-head CI/review and normal merge. Keep `main`, Production, Neon, #254 and V2-007 untouched.

Current state: LOCAL READY for the exercised flows; hosted integration blocked by absent new owner authorization. The private handoff has actual Auth/browser receipts and the residual keyboard/touch limitation. Hosted DEV last read-only ledger 86, activation OFF, enforcement STAGED. No hosted write, push or PR.

Branch `feature/attendance-manual-entry`; isolated worktree `.tmp/attendance-manual-entry`; base `origin/development` `d09b6c4600e46653710a8e92a507415af78c5d77`. Root checkout and other worktrees are preserved. Source feature: `docs/features/attendance-manual-entry.md`. Private handoff: `.tmp/attendance-manual-entry-handoff/`.

- [x] Verify development tip, read project instructions, V2-006 closeout, and inspect Attendance contracts.
- [x] Write capability inventory and bounded feature spec with data, auth, UI, risks and tests.
- [x] Implement one vertical Attendance slice: audited explicit-time creation, strict local time, manager action and reviewed single/bulk UI.
- [x] Run targeted unit, database, real-browser and concurrency checks.
- [x] Run consolidated `npm run check`, `npm run test`, `npm run build`; inspect security, tenant scope and accessibility diff.
- [x] Commit reviewed local implementation; prepare hosted DEV recovery/compatibility package. Hosted writes require new owner approval.
- [ ] Push and open one Attendance PR when binding and gates allow; merge only after exact-head CI and required review.

Native financial activation OFF; backend enforcement STAGED. No Production, main, Neon, Kiosk or V2-007 work. Inventory Dates-tab local work may start on its own branch from current development while hosted Attendance approval is pending; integration remains separate.

---

## Completed V2-006 Closeout Archive (Merged in PR #321)

# The Lineup V2.0 — V2-006 Attendance V2

## Authorized Q8 DEV rollout — 2026-11-10 (active; supersedes prior approval gates)

Owner explicitly approved Q8 DEV-only backup/recovery/rehearsal, the four pending
migrations (expected 82→86), authenticated DEV/browser acceptance, synthetic-only
cleanup, existing feature branch push, one PR to development and protected merge.
Manual first-local-day source switching and scoped manager break classification
are approved, with no additional Shift Manager authority. Staged closure with
financial activation OFF and accurate follow-up issues is approved.

- [x] Verify existing local closeout HEAD `3cca2ed` and clean feature tree; reuse all completed local review evidence.
- [x] Verify explicit DEV identity `opmujepkemwcdxxorhfd`, the-lineup-dev, us-east-2, healthy.
- [x] Verify actual DEV ledger82/latest20261109120000, STAGED baseline and create/verify fresh owner-only DPAPI backup (SHA256 40e5f3cd…f27400f).
- [x] Restore to isolated no-network/RAM-backed PostgreSQL17.11: 111 table counts, all FK checks and canonical functions/policies/grants match DEV. Rehearse exact four migrations with populated locked Payroll, confirmed payment, adjustment, rate and finalized Tips; old-shape financial fingerprints unchanged; ledger86/OFF/STAGED.
- [x] Apply only the verified migration set to DEV; verify ledger, schema/RLS/grants, OFF/STAGED and historical preservation.
- [x] Authenticated DEV API/browser checks 26/26; narrow WebKit overflow repair verified in all three hosted-data viewports plus existing local WebKit scenario 1/1. Vitest 3,837 (7 skips), check and production webpack build PASS.
- [x] Run authenticated DEV and real-browser acceptance 26/26, protected Preview 8/8; clean only both attempts’ manifest-listed synthetic fixtures; original counts/OFF/STAGED/catalog parity restored.
- [x] Push existing feature branch; verify Preview DEV binding; create single PR #321. Application head d4e51e0 passed protected Preview 8/8; final receipt changes documentation only.
- [x] Establish the mandatory final-head CI/review gate and normal development-only merge contract. Actual merge SHA/CI and #254 closure are authoritative in PR #321 and the private handoff; no bypass is permitted.
- [x] Track deferred UI/activation in #319/#320 and update documentation. #254 closure is conditional on the accepted merge recorded in PR #321; parent #248 and milestone #8 remain open.

Never access Production, merge main, enable native financial/backend enforcement,
record real payments, modify confirmed history, expand Q5/Q7 or bypass reviews.
Stop before the affected write/deployment/merge if recovery, compatibility,
security or mandatory CI fails. Current delivery receipt: DEV/Preview/cleanup PASS; PR #321 is the live CI/merge and issue-closure record. This checklist is committed before final CI/merge; the private handoff and GitHub preserve the subsequent exact outcome. Historical execution records below are superseded by this active Q8 section.

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
