# Current Task Handoff

## Current cycle

Tasks V1.1 — **T-1 COMPLETE**. **T-2 COMPLETE** (Management Today, #169). **T-3 COMPLETE** (Notification narrowing, #154; PR #207, tested head `2fef134e84c6966ea1c60e66d5e390d8c456f283` (= local = remote = PR head = CI-tested SHA; application, browser-smoke, Database `migrations-and-policies` and Vercel green; `deploy-migrations` skipped on a PR), merge commit `3a442a6` (two parents: `f4f1aae` + `2fef134`)). **T-4 (Opening reminder server/database engine) is COMPLETE** (#154; PR #209, tested head `f48ea31fc58db8c9ae562404de8147ff979d7d5a` (= local = remote = PR head = CI-tested SHA; application, browser-smoke, Database `migrations-and-policies` and Vercel green; `deploy-migrations` skipped on a PR), merge commit `796cff3` (two parents: `175ca05` + `f48ea31`)). **T-5 (Opening reminder popup + catch-up UX) is COMPLETE** (#154; PR #211, tested head `9bf227922174b69f29ce256185b852f52379e305` (= local = remote = PR head = CI-tested SHA; application, browser-smoke and Vercel green; Database path-gated, no `supabase/**` change), merge commit `53c94d2` (two parents: `bfea042` + `9bf2279`)). **T-6 is NEXT / NOT STARTED**, Recipes SHELVED. · Part 2 ON HOLD · `main` UNTOUCHED · PROD UNTOUCHED. Vendor Order Drafts V1 is complete (VOD-4 GO, #190 closed).

## Current phase

T-5 — Opening reminder popup + catch-up UX (#154): **COMPLETE** (Claude Code Cloud, Sonnet 5.5). Branch `feature/tasks-v1-1-reminder-popup` from `origin/development` @ `bfea042f40289f42335e1d76e320b820ceeaab21`; PR #211, tested head `9bf227922174b69f29ce256185b852f52379e305` (= local = remote = PR head = CI-tested SHA; application, browser-smoke and Vercel green; Database path-gated, no `supabase/**` change), merge commit `53c94d2` (two parents: `bfea042` + `9bf2279`). No migration, `supabase/**` unchanged. Next phase: **T-6 final gate, a NEW Claude Code LOCAL WINDOWS session (Sonnet 5.5, high)**: real host-tablet WebKit, hosted DEV, full matrix, DB/security verification. T-6 NOT STARTED; Recipes SHELVED; Part 2 ON HOLD; `main` UNTOUCHED; PROD UNTOUCHED.

Previous phase line (T-4):

T-4 — Opening reminder server/database engine (PLAN D-4, #154): **COMPLETE** (PR #209, merge `796cff3`). Next phase: T-5 popup + catch-up UX, a NEW session. T-5 NOT STARTED, T-6 NOT STARTED, Recipes SHELVED, Part 2 ON HOLD.

## Execution

T-4: Claude Code **Local Windows** (Sonnet 5.5, high effort), real local Supabase stack. Two additive migrations (`20261028100000`, `20261028100100`), applied to hosted DEV only together with T-3's `20261028090000` (DEV 51 -> 54 = local 54). PROD never targeted. Local DB container `supabase_db_opmujepkemwcdxxorhfd` is the LOCAL stack on :54322 (named after the linked ref); always pass `--local`.

## Branch / base

- T-4: branch `feature/tasks-v1-1-opening-reminders` from `development` @ `175ca0590b25962dbf63d878f7cfecfb2295f4f9`; PR #209, tested head `f48ea31fc58db8c9ae562404de8147ff979d7d5a` (= local = remote = PR head = CI-tested SHA; application, browser-smoke, Database `migrations-and-policies` and Vercel green; `deploy-migrations` skipped on a PR), merge commit `796cff3` (two parents: `175ca05` + `f48ea31`); `development` HEAD after merge `796cff3` (before this docs sync)
- T-3: branch `feature/tasks-v1-1-notification-scope` from `f4f1aae26fdcf95d7d6b960eafb624ca05bcaa27`; PR #207, tested head `2fef134e84c6966ea1c60e66d5e390d8c456f283` (= local = remote = PR head = CI-tested SHA; application, browser-smoke, Database `migrations-and-policies` and Vercel green; `deploy-migrations` skipped on a PR), merge commit `3a442a6` (two parents: `f4f1aae` + `2fef134`); `development` HEAD after merge `3a442a6` (before this docs sync)
- T-2: branch `feature/tasks-v1-1-management-today` from `c6f309eae5c674e71b3906ff1b26faae0440ca22`; PR #205, tested head `c2ef864` (= local = remote = PR head = CI-tested SHA; application, browser-smoke and Vercel green; database workflow path-gated, no `supabase/**` change), merge commit `46ea022` (two parents); `development` HEAD after merge `46ea022`
- T-1 (done): PR #203 tested `1e3e4b1`, merge `cf3ae39`; docs PR #204, merge `c6f309e`
- Issue: #169 (tracking) · Project #4 (card update not performed: Projects tooling unavailable in this session)
- Issue: #154 (T-3 tracking) · T-4 COMPLETE · T-5 COMPLETE · T-6 NEXT / NOT STARTED · Part 2: ON HOLD · `main`: UNTOUCHED · PROD: UNTOUCHED

## Phase ledger

```text
Vendor Order Drafts V1 COMPLETE (VOD-0..VOD-4, #190 closed)
Tasks T-0 plan COMPLETE (#189)
Tasks T-1 COMPLETE (PR #203, tested 1e3e4b1, merge cf3ae39)
Tasks T-2 COMPLETE (PR #205, tested c2ef864, merge 46ea022)
Tasks T-3 COMPLETE (PR #207, tested 2fef134, merge 3a442a6)
Tasks T-4 COMPLETE (PR #209, tested f48ea31, merge 796cff3) · Tasks T-5 COMPLETE (PR #211, tested 9bf2279, merge 53c94d2) · T-6 NEXT / NOT STARTED
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
- [x] T-4 built and validated (Local Windows): branch `feature/tasks-v1-1-opening-reminders` from `175ca05`. Steps: audit -> enum migration -> sweep migration -> pgTAP 0042 -> local DB run -> repo gates -> DEV -> PR. Update this list as each step passes.
  - [x] audit (notify gate, hours/timezone, events, can_work)
  - [x] migrations `20261028100000_tasks_v1_1_opening_reminder_type.sql` (enum) + `20261028100100_tasks_v1_1_opening_reminders.sql` (payload col, extended `private.tasks_notify`, `private.tasks_profile_can_access_location`, `private.tasks_opening_reminders_run(org, loc, now)`, `public.task_opening_reminders_sweep(org, loc)`) written and applied to LOCAL Supabase (`supabase start`; container `supabase_db_opmujepkemwcdxxorhfd` is LOCAL on :54322)
  - [x] pgTAP `0042_tasks_v1_1_opening_reminders.test.sql` 108/108; full local `supabase test db --local` 41 files green before 0042 (1189 tests). Mutation-checked: removing the advisory lock fails the concurrency asserts.
  - [x] TS: `domain/opening-reminder.ts`, mapper `payload`, gate mirror, snapshot calls the sweep, regenerated `database.generated.ts`; Vitest tasks 118/118, tsc clean
  - [x] tests/real on DEV: `tasks-v1.db.real` 12/12 + new `tasks-opening-reminders.db.real` 7/7 (0 reminder rows left); npm run check, Vitest 1629/1629, normal build (env pinned to DEV, 0 PROD refs) and empty-Supabase-env build green; Playwright desktop + server-mobile 57/57 each; host-tablet WebKit = known sign-in gap (not PASS)
  - [x] docs: PLAN, TEST_MATRIX, IMPLEMENTATION_REPORT, ROADMAP, STATUS, backlog
  - [x] commit explicit paths, push, PR #209 -> development, exact-head CI green (application, browser-smoke, Database, Vercel), MERGE COMMIT `796cff3`, post-merge docs sync PR
- [x] T-5 (popup + catch-up UX, client wake-up, demo-mode emitter): COMPLETE (PR #211, merge `53c94d2`). Steps: selector (pure) -> server action (sweep + own reminders + authoritative count) -> shell prompt component + wake -> demo fixtures -> tests -> gates -> docs -> PR. Update as each step passes.
  - [x] base verified, branch created, handoff marked IN PROGRESS
  - [x] pure selector + copy + live count: `src/features/tasks/domain/opening-reminder-popup.ts` (+ test)
  - [x] demo twin of the sweep: `domain/opening-reminder-engine.ts` (+ test); demo reminders opt-in via `?demoReminders=1`
  - [x] server read model + actions: `data/opening-reminder-prompt-data.ts`, `getOpeningReminderPromptAction`, `acknowledgeOpeningReminderAction`
  - [x] wake gate + hook + dialog + shell mount (`hooks/wake-gate.ts`, `hooks/use-opening-reminder-prompt.ts`, `components/opening-reminder-prompt.tsx`, `opening-reminder-sources.ts`, `restaurant-operations-app.tsx`)
  - [x] tests: Vitest 1687/1687 (+58); Playwright `tests/e2e/opening-reminder-popup.spec.ts` (10 tests; `page.clock.install`, `?demoReminders=1`); desktop + server-mobile 134/134 with tasks, management-today, default-landing, dashboard; Chromium iPad emulation 28/28 (not WebKit); host-tablet WebKit NOT RUN (webkit binary absent)
  - [x] check, normal build and empty-Supabase-env build green; docs (PLAN D-5 as built, TEST_MATRIX, IMPLEMENTATION_REPORT, ROADMAP, STATUS, backlog) updated
  - [x] committed, pushed, PR #211 -> development, exact-head CI green on `9bf2279` (browser-smoke was cancelled once by a job timeout on first-test page loads, not reproducible locally (full desktop suite 289/289 cold), passed on the single re-run), MERGE COMMIT `53c94d2`, #154 commented, post-merge docs sync (this change)
- [ ] T-6 (final gate): NEW session, Local Windows. NOT STARTED. Resume point: read `docs/features/tasks-v1-1/PLAN.md` §4 T-6 and `TEST_MATRIX.md`; run real host-tablet WebKit, hosted DEV (incl. `tests/real` and real-mode UI specs, which may now meet the popup), full three-project run, DB/security verification.

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
- Do not start Part 2; T-6 only, in a new session (after T-5 is merged).
- Do not touch `main` or PROD.
- Do not use `git reset --hard`, `git clean -fd`, force-push, squash merge, or rebase merge.
- Do not merge on stale, partial, or red CI.
- `next dev` rewrites the `AGENTS.md` heading; never commit that change (`git checkout AGENTS.md`).
