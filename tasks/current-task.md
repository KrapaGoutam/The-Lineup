# PR #135 Reconciliation — Agent Handoff

Current task: PR #135 (DEV Preview / CI Reliability) is reconciled with `development` three times (latest: the #153 cross-view fix); waiting on exact-head CI and the owner Preview smoke.

## TASK-014 fix (separate from PR #135)

- Status: DONE and merged into `development`.
- Issue: #151 (closed, Project #4 Done). Fix branch: `fix/tasks-handoff-time-dependent-e2e`. Fix PR: #152. Fix merge commit: `63fdbe0`.
- Root cause: TASK-014 carried the overdue demo task (due yesterday 16:00) to the panel's default target, today. The product keeps the 16:00 due time, so after 16:00 restaurant-local it is overdue again and stays listed. The product is correct; the test had a wall-clock-dependent expectation.
- Second wall-clock dependency found by the same CI run: `getByText("Ended")` also matched the header countdown "Day ended" outside service hours (two Floor end-existing tests in `table-rotation-multi-view.spec.ts`). Fixed with `{ exact: true }`.
- Fix: test-only. TASK-014 carries to restaurant-today + 1 (taken from the "New due date" input's own `min`, plus one calendar day). Reproduced before the fix on unchanged development at 23:15 CDT (expected 0, received 1); passed after at 23:16 CDT; PR #152 CI (application, browser-smoke, Vercel) green at ~23:35 CDT. No product code changed.

## PR #135 state

Branch: `infra/dev-preview-ci-reliability`
HEAD: see `git log -1` (second merge of `origin/development` at `63fdbe0`, then this handoff commit)
Previous heads: `1030dde` (original), `9a71cf5` (first reconciliation; its Preview and browser-smoke are NOT the final gate)
Development head: `63fdbe0`. Main head (untouched): `3403058`.
Merges from development: `1d03050` (at `56bacb6`) and the TASK-014 merge (at `63fdbe0`). Plain merges, no rebase, no force-push.

INFRA-A: 🟡 Preview/Development → DEV verified read-only (demo=false, no Neon, no PROD ref); Production → PROD, unchanged; Preview smoke awaits the owner
INFRA-B: ✅ Database CI via `scripts/ci/supabase-run.mjs` (start/reset/test); `deploy-migrations` only on push to `main`
INFRA-C: ✅ `check-nonprod-env` + `check-tracked-local-paths` in the `application` job
INFRA-D: 🟡 docs/tracking current; final "merged" wording after the PR merges

Environment: Preview → DEV · Development → DEV · Production → PROD · PROD ref in non-prod: none · Production vars changed: NO

CI on the final head: see PR #135 checks (results are recorded in the PR comment and final report). Expected: application, browser-smoke, Database, Vercel pass; deploy-migrations skipped.

Owner Preview gate: REQUIRED (Vercel Authentication on; no bypass; the smoke must use the Preview built from the FINAL PR head).
Owner smoke list: Preview opens · login page · synthetic DEV user sign-in · Table Allocation · Tasks · Schedule · Team · data clearly DEV-backed · no Production data

PR #135: open, not merged · #133: open / Review · Project #4: Review · Milestone: Platform / CI Reliability (stays open)

development merged (PR #135): NO (PR #152 merged into development)
main merged: NO
DEV touched: NO (read-only)
PROD touched: NO

## Current State & Next Step

- Exact next action: on the owner's explicit `Preview owner smoke PASS`, re-check the PR head and CI, then `gh pr merge 135 --merge` (merge commit). Then verify development contains the PR and main does not, close #133 / Project #4, and open `docs/dev-preview-ci-final-closeout` from latest development for the final wording.
- Next separate task after merge: Release Readiness Review (do NOT merge `development → main` automatically).
- DO NOT: merge to main, touch PROD, change Production Vercel variables, disable Vercel protection or create a bypass, copy PROD Neon into DEV/Preview, force-push, squash/rebase-merge, start Part 2, wait for a "good time of day" to get green CI, `git add -A` / `git add .`, stage `docs/testing/` or `*.code-workspace`.

## Cross-View Integrity (#153) — MERGED into development

PR #156, merge commit `aaf11f0` (exact-head CI green: application, browser-smoke, Database, Vercel; deploy-migrations skipped). Branch `fix/table-allocation-cross-view-integrity`. Report/evidence: `docs/features/table-allocation-cross-view-integrity/IMPLEMENTATION_REPORT.md`.

- Identity: the owner's "Table 1" has no `dining_tables` row (free-text label); `T1` is id 19 — never aliased. Off-map = registered-unpositioned or free-text, shown in all five views.
- One shared occupied-table flow (Transfer / End + Assign / Cancel; same-server notice); atomic via `board_assign(..., p_end_whole_assignment)`; stale clients get PT409.
- Migration `20261026090000_table_allocation_conflict_resolution.sql` applied to DEV only (recorded); PROD untouched.
- Tests: Vitest 663, demo Playwright 489 (45-scenario matrix x 3 viewports), pgTAP 588, hosted DB 50, hosted production-build UI 29.
- X6 (this branch): `development` merged into `infra/dev-preview-ci-reliability` (plain merge, no rebase, no force-push). Needs exact-head CI + a NEW Preview + the owner's final smoke (see owner smoke list above, plus: off-map labelling, occupied-table dialog once, Servers ended history).
