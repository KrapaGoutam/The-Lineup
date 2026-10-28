# Current Task Handoff

## Current cycle

Tasks V1.1 — **T-1 COMPLETE**. **T-2 COMPLETE** (Management Today, #169). **T-3 COMPLETE** (Notification narrowing, #154; PR #207, tested head `2fef134e84c6966ea1c60e66d5e390d8c456f283` (= local = remote = PR head = CI-tested SHA; application, browser-smoke, Database `migrations-and-policies` and Vercel green; `deploy-migrations` skipped on a PR), merge commit `3a442a6` (two parents: `f4f1aae` + `2fef134`)). **T-4 (Opening reminder server/database engine) is NEXT / NOT STARTED.** · Part 2 ON HOLD · `main` UNTOUCHED · PROD UNTOUCHED. Vendor Order Drafts V1 is complete (VOD-4 GO, #190 closed).

## Current phase

T-3 — Notification narrowing (#154, PLAN D-3): COMPLETE. Next phase: T-4 Opening reminder server/database engine (PLAN D-4), a NEW session from the then-current `origin/development`; it extends the `tasks_notify` gate with `opening_reminder`.

## Execution

Claude Code Cloud (Sonnet 5.5, high effort, new session). T-3 shipped one additive migration (`20261028090000`) to `development`; no hosted DEV run; PROD never targeted.

## Branch / base

- T-3: branch `feature/tasks-v1-1-notification-scope` from `f4f1aae26fdcf95d7d6b960eafb624ca05bcaa27`; PR #207, tested head `2fef134e84c6966ea1c60e66d5e390d8c456f283` (= local = remote = PR head = CI-tested SHA; application, browser-smoke, Database `migrations-and-policies` and Vercel green; `deploy-migrations` skipped on a PR), merge commit `3a442a6` (two parents: `f4f1aae` + `2fef134`); `development` HEAD after merge `3a442a6` (before this docs sync)
- T-2: branch `feature/tasks-v1-1-management-today` from `c6f309eae5c674e71b3906ff1b26faae0440ca22`; PR #205, tested head `c2ef864` (= local = remote = PR head = CI-tested SHA; application, browser-smoke and Vercel green; database workflow path-gated, no `supabase/**` change), merge commit `46ea022` (two parents); `development` HEAD after merge `46ea022`
- T-1 (done): PR #203 tested `1e3e4b1`, merge `cf3ae39`; docs PR #204, merge `c6f309e`
- Issue: #169 (tracking) · Project #4 (card update not performed: Projects tooling unavailable in this session)
- Issue: #154 (T-3 tracking) · T-4 NEXT / NOT STARTED · Part 2: ON HOLD · `main`: UNTOUCHED · PROD: UNTOUCHED

## Phase ledger

```text
Vendor Order Drafts V1 COMPLETE (VOD-0..VOD-4, #190 closed)
Tasks T-0 plan COMPLETE (#189)
Tasks T-1 COMPLETE (PR #203, tested 1e3e4b1, merge cf3ae39)
Tasks T-2 COMPLETE (PR #205, tested c2ef864, merge 46ea022)
Tasks T-3 COMPLETE (PR #207, tested 2fef134, merge 3a442a6)
Tasks T-4 NEXT / NOT STARTED · T-5..T-6 NOT STARTED
Part 2 (multi-org / multi-location / attendance) ON HOLD
Final Development Gate NOT STARTED · main UNTOUCHED · PROD UNTOUCHED
```

## T-3 result

- Gate in `private.tasks_notify` (migration `20261028090000_tasks_v1_1_notification_scope.sql`): stores a notification only for `checklist_available` or a task of `kind` opening/closing in the same organization; every `kind = 'task'` notification is dropped; fails closed. `task_events` and stored notifications untouched. Demo engine mirrors it (`isOperationalNotification`). Detail: `IMPLEMENTATION_REPORT.md` (T-3).
- **Finding for T-4:** no caller ever emitted Opening/Closing assigned/reassigned/completed (RPCs guard on `kind = 'task'`); the only operational notification stored is `checklist_available`. The gate admits the others if emitted. `opening_reminder` is not in the gate yet: T-4 adds the enum value (own migration) and extends the gate.
- Evidence: Vitest 1606/1606; pgTAP 0041 19/19 (+0026, 0029 updated, 0027/0028 unchanged; run locally on PG16 with a stubbed Supabase harness) and the CI Database job green; Tasks/landing/dashboard/management-today Playwright 57/57 on desktop, server-mobile and Chromium-iPad emulation; check, build and empty-Supabase-env build green. Not run: real `host-tablet` WebKit (T-6), hosted DEV and `tests/real/tasks-v1.db.real.test.ts` (updated, not executed). Project #4 update NOT PERFORMED — Projects tooling unavailable.

## T-2 result

- Management Today: `Show tasks for` select (All Staff / My Tasks / person by profile id) for Owner, Manager, Assistant Manager; Opening / General / Closing groups; staff name on each row; staff unchanged. Detail: `docs/features/tasks-v1-1/IMPLEMENTATION_REPORT.md` (T-2).
- Evidence: Vitest 1586/1586; `management-today.spec.ts` 7/7 on desktop and server-mobile; Tasks + default-landing + dashboard regression 57/57 desktop, server-mobile and Chromium-emulated iPad; check, build and the empty-Supabase-env build green. WebKit (host-tablet) was not installable in the cloud container and CI runs only `--project=desktop` browser-smoke, so **real `host-tablet` WebKit was not run for T-2** (Chromium iPad emulation only); T-6 should run it.

## Current State & Next Step

- [x] T-2 implemented, validated, exact-head CI green, merged (`46ea022`), docs synced
- [x] T-3 implemented, validated, exact-head CI green, merged (`3a442a6`), docs synced
- [ ] T-4 in a NEW session: `feature/tasks-v1-1-opening-reminders-server` from the then-current `origin/development` (two migrations; DEV only). NOT STARTED.

## Exact next command

```bash
git fetch origin && git status -sb && git log --oneline -5 origin/development
```

## Read first

1. `tasks/current-task.md`
2. `docs/features/tasks-v1-1/PLAN.md` (D-2, phase table) and `TEST_MATRIX.md` (TS-010..TS-017)
3. `docs/features/tasks-v1-1/IMPLEMENTATION_REPORT.md` (T-1)

## DO NOT

- Before pushing any phase, run `NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= npm run build` too: CI has no env files, so `/` is prerendered statically there but dynamic with the local `.env.development.local`.
- Do not start Part 2; T-4 only, in a new session.
- Do not touch `main` or PROD.
- Do not use `git reset --hard`, `git clean -fd`, force-push, squash merge, or rebase merge.
- Do not merge on stale, partial, or red CI.
- `next dev` rewrites the `AGENTS.md` heading; never commit that change (`git checkout AGENTS.md`).
