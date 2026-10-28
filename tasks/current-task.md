# Current task — Recipes V1 R-1

Status: IN PROGRESS. Branch: `feature/recipes-v1-r1-core`; base: `c3e44536c8dc39023eac81b1d5795ce7e145b9a9`. See `docs/features/recipes-v1/R1_HANDOFF.md` for continuation state.

- [x] Fetch, verify clean state, fast-forward development, and create R-1 branch.
- [x] Protect the existing R1-A foundation migration, draft test, and handoff in pushed recovery checkpoint `0d7d4fa`; reproduce the 16 draft assertions in a rolled-back local transaction.
- [ ] Complete the controlled import and expanded database tests, then run clean local replay and regenerate types before any DEV mutation.
- [ ] Implement and verify database, RLS, and controlled importer.
- [ ] Implement and verify Recipes navigation, list, search, and detail.
- [ ] Validate hosted DEV, clean synthetic data, run final gates, and review scope.
- [ ] Commit, push, open PR, verify exact-head CI, and merge to development.

PROD and main untouched; R-2 and Part 2 not started.

---
# Current Task Handoff

## Current cycle

Recipes V1

```text
Cycle:                      Recipes V1
Previous Production release: COMPLETE (main 9e0be4b)
Recipes R-0:                COMPLETE      (PR #221 merged; docs only)
Recipes R-1:                NEXT (NOT STARTED)
Recipes R-2:                PLANNED (NOT STARTED)
Part 2:                     ON HOLD
main:                       CURRENT PRODUCTION (untouched)
PROD:                       UNCHANGED (R-0 touched nothing)
```

- **Phase:** Recipes V1 R-0 (COMPLETE) — Claude Code Cloud, Sonnet 5.5, high, NEW session. Objective: an implementation-ready contract (PRD, plan, data model, security, UI/UX, source mapping, test matrix, R-1/R-2 implementation plan) so R-1 and R-2 can build without making product decisions.
- **Branch:** `docs/recipes-v1-r0-planning` (from `development`, PR #221 into `development`, MERGE COMMIT). Tested head `f01ace87c83f412bd450342846aa5ba6021d69b3` (= local = remote = PR head = CI-tested SHA; application, browser-smoke and Vercel green; Database path-gated, no `supabase/**` change). Merge commit `26cceaf78cda08d20a04cdea16b0978e21626a3b` (parents `73ebc21` + `f01ace8`). Tracking issue #220; Project #4 update NOT PERFORMED (Projects tooling unavailable).
- **Base SHA:** `73ebc210d97778db238b26acbee82481190560ea` (= `origin/development` at start; `origin/main` = `9e0be4b4eb7b7be2f32a6e57c9b773d7cf776b05`).
- **Safety flags:** docs only · no application code · no migration · no Storage bucket · no seed/recipe data · no DEV database touched · PROD NOT touched · `main` NOT touched · R-1 / R-2 / Part 2 NOT started · no `development -> main`.
- **Plan folder:** `docs/features/recipes-v1/` (`PRD.md`, `PLAN.md`, `DATA_MODEL.md`, `SECURITY_AND_ROLES.md`, `UI_UX_PLAN.md`, `SOURCE_MAPPING.md`, `TEST_MATRIX.md`, `IMPLEMENTATION_PLAN.md`, `STORAGE_PLAN.md`).
- **Exact next action:** R-1 in a NEW Codex session (GPT-5.6 Sol, high) using the prompt at the end of `docs/features/recipes-v1/PLAN.md`. Do not start R-2. Do not merge `main`. Do not touch PROD.

### R-0 step checklist (interruption-safe; check off as each is written and reviewed)

- [x] sync verified (`development` = `origin/development` = `73ebc21`), branch created, handoff marked IN PROGRESS
- [x] `PRD.md`
- [x] `DATA_MODEL.md`
- [x] `SECURITY_AND_ROLES.md`
- [x] `STORAGE_PLAN.md`
- [x] `UI_UX_PLAN.md`
- [x] `SOURCE_MAPPING.md`
- [x] `TEST_MATRIX.md`
- [x] `IMPLEMENTATION_PLAN.md`
- [x] `PLAN.md` (decision register, review checklist, Codex build prompt)
- [x] `docs/ROADMAP.md`, `docs/STATUS.md`, `tasks/backlog.md` updated
- [x] tracking issue created: #220 (Project #4 update NOT PERFORMED — Projects tooling unavailable in this session)
- [x] docs checks green (`prettier --check`, tracked-path check), diff inspected: zero app code, zero migrations
- [x] commit, push, PR #221 -> `development`, exact-head CI green, MERGE COMMIT `26cceaf`, merge SHA recorded (this sync)

## Previous cycle (Tasks V1.1 and Production release 2026-10-28)

Tasks V1.1 — **T-1 COMPLETE**. **T-2 COMPLETE** (Management Today, #169). **T-3 COMPLETE** (Notification narrowing, #154; PR #207, tested head `2fef134e84c6966ea1c60e66d5e390d8c456f283` (= local = remote = PR head = CI-tested SHA; application, browser-smoke, Database `migrations-and-policies` and Vercel green; `deploy-migrations` skipped on a PR), merge commit `3a442a6` (two parents: `f4f1aae` + `2fef134`)). **T-4 (Opening reminder server/database engine) is COMPLETE** (#154; PR #209, tested head `f48ea31fc58db8c9ae562404de8147ff979d7d5a` (= local = remote = PR head = CI-tested SHA; application, browser-smoke, Database `migrations-and-policies` and Vercel green; `deploy-migrations` skipped on a PR), merge commit `796cff3` (two parents: `175ca05` + `f48ea31`)). **T-5 (Opening reminder popup + catch-up UX) is COMPLETE** (#154; PR #211, tested head `9bf227922174b69f29ce256185b852f52379e305` (= local = remote = PR head = CI-tested SHA; application, browser-smoke and Vercel green; Database path-gated, no `supabase/**` change), merge commit `53c94d2` (two parents: `bfea042` + `9bf2279`)). **T-6 (final gate) is COMPLETE — GO** (#154, #169; PR #213, tested head `75c964b10a9c319cd76e84eaa753b647b3a12e4c` (= local = remote = PR head = CI-tested SHA; application, browser-smoke and Vercel green; Database path-gated, no `supabase/**` change), merge commit `711a683` (two parents: `deee02b` + `75c964b`); Local Windows, Sonnet 5.5, high). **Tasks V1.1 engineering phases T-1 through T-6 are complete.** Next: final Tasks V1.1 audit / release-readiness review, then explicit owner approval before any `development -> main`. Recipes SHELVED. · Part 2 ON HOLD · `main` UNTOUCHED · PROD UNTOUCHED. Vendor Order Drafts V1 is complete (VOD-4 GO, #190 closed).

## Production release (2026-10-28): DEPLOYED

Owner-approved, Local Windows (Sonnet 5.5, high). 13 PROD migrations applied first (41 -> 54, head `20261028100100`), then PR #216 merged by merge commit: **`main` = `9e0be4b`** (parents `d08eb4e` + `94e5e3e`). Vercel Production success, main CI green, `deploy-migrations` failed at `supabase link` (known #111, no effect). Record: `docs/releases/release-readiness-2026-10-28/PRODUCTION_RELEASE.md`. **Pending: the owner's authenticated Production smoke (needs their PIN); then close #169 and #168 (and #164).** Recipes NOT started; Part 2 ON HOLD. `development` is intentionally 1 commit behind `main` (the release merge commit): do not merge `main` back. Next product work: Recipes V1 R-0, only on owner instruction.

## Release-readiness audit (2026-10-28): CONDITIONAL GO

Audit only, Local Windows (Sonnet 5.5, high). Audited `main` `d08eb4e` vs `development` `efd7d4c` (code state; the docs-merged SHA is recorded below once the audit PR merges). Docs: `docs/releases/release-readiness-2026-10-28/` (`GO_NO_GO.md` first). 13 additive pending migrations, PROD read-only history = `main` (41, head `20261026120000`), no destructive migration, no new security issue. Conditions C1–C6 (owner decisions on AC-EXP-4 and contrast; backup/PITR point; Vercel Production confirmed; same-day PROD preflight; migrations applied and verified on PROD BEFORE the merge plus exact-head release-PR checks; owner accepts #111 / #113 / #106 / #164). **Next: the controlled Production release, a NEW session, only after explicit owner approval. `development -> main` NOT performed. PROD NOT written (one read-only migration-history SELECT). Recipes and Part 2 NOT started.** After a successful Production verification: close #169 and #168.

## Current phase

T-6 — Final validation / release-readiness gate (#154, #169): **COMPLETE — GO** (Claude Code Local Windows, Sonnet 5.5). PR #213, merge `711a683`. Real host-tablet WebKit 289/289, desktop 289/289, server-mobile 287 + 2 intentional skips; pgTAP 42 files / 1297; hosted DEV parity 54 and `tests/real` Tasks 19/19; TS-050 PASS; real-mode popup spec 3/3; Vitest 1689/1689; one hydration-marker race fixed. DEV touched (controlled tests, cleaned); PROD NOT touched; no PROD migration; `main` UNTOUCHED; Recipes and Part 2 NOT started. **Next phase: final Tasks V1.1 audit / release-readiness review, a NEW session. Do not merge `main` and do not start Recipes without explicit owner approval.**

Previous phase line (T-5):

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
- Issue: #154 (T-3 tracking) · T-4 COMPLETE · T-5 COMPLETE · T-6 COMPLETE (GO) · Part 2: ON HOLD · `main`: UNTOUCHED · PROD: UNTOUCHED

## Phase ledger

```text
Vendor Order Drafts V1 COMPLETE (VOD-0..VOD-4, #190 closed)
Tasks T-0 plan COMPLETE (#189)
Tasks T-1 COMPLETE (PR #203, tested 1e3e4b1, merge cf3ae39)
Tasks T-2 COMPLETE (PR #205, tested c2ef864, merge 46ea022)
Tasks T-3 COMPLETE (PR #207, tested 2fef134, merge 3a442a6)
Tasks T-4 COMPLETE (PR #209, tested f48ea31, merge 796cff3) · Tasks T-5 COMPLETE (PR #211, tested 9bf2279, merge 53c94d2) · Tasks T-6 COMPLETE — GO (PR #213, tested 75c964b, merge 711a683)
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
- [x] T-6 (final gate): COMPLETE — GO (Local Windows). Branch `feature/tasks-v1-1-final-gate` from `deee02b`; PR #213, tested head `75c964b10a9c319cd76e84eaa753b647b3a12e4c` (= local = remote = PR head = CI-tested SHA; application, browser-smoke and Vercel green; Database path-gated, no `supabase/**` change), merge commit `711a683` (two parents: `deee02b` + `75c964b`); #154 commented and closed, #169 commented (left open until release); post-merge docs sync (this change). Gate log under `## T-6 progress`. **Next: final Tasks V1.1 audit / release-readiness review (a NEW session); DO NOT merge `main` without explicit owner approval.**

- [x] base verified (local = origin/development = `deee02b`), branch created, handoff marked IN PROGRESS
- [x] real host-tablet WebKit (webkit-2359 present) reproduced the sign-in failure: root cause = `data-hydrated` marker outside the app's Suspense boundary (fast `fill()` reset by hydration on `/r/<slug>`); fixed in `restaurant-operations-app.tsx` / `layout.tsx`, regression test `hydration-marker.test.tsx`; 1 failure in 66 before, 0 in 110 after
- [x] local Supabase `db reset --local` (54 migrations) + full pgTAP: 42 files / 1297 assertions PASS
- [x] hosted DEV (target proven DEV, never PROD): migrations identical to repo (54); `tests/real` Tasks 19/19 (12 + 7); TS-050 PASS, 0 leftovers; security-definer / grants audit clean; new real-mode popup spec `tests/real/ui/opening-reminder.real.spec.ts` 3/3 (DEV `opening_local` restored to 11:00, 0 reminder rows) + `tasks.real.spec.ts` 3/3
- [x] production build, DEV-pinned, demo mode: desktop 289/289, host-tablet WebKit 289/289 (also 289/289 on the default dev-server config), server-mobile 287 + 2 intentional skips
- [x] `npm run check` clean; Vitest 1689/1689; normal build PASS; empty-Supabase-env build PASS (`/` static); `.next` scans show 0 PROD refs
- [x] docs: PLAN, TEST_MATRIX, IMPLEMENTATION_REPORT (T-6), ROADMAP, STATUS, backlog
- [x] commit explicit paths, push, PR #213 -> development, exact-head CI green (application, browser-smoke, Vercel; Database path-gated), MERGE COMMIT `711a683`, #154 commented and closed, #169 commented, post-merge docs sync

DEV touched: YES (controlled tests: hosted suites, real-mode UI, read-only catalog queries; all cleaned) · PROD touched: NO · PROD migrations: NO · main: UNTOUCHED

## Exact next command

```bash
git fetch origin && git status -sb && git log --oneline -5 origin/development
```

## Read first

1. `tasks/current-task.md`
2. `docs/features/recipes-v1/PLAN.md` (decision register and the Codex build prompt), then `DATA_MODEL.md`, `SECURITY_AND_ROLES.md`, `IMPLEMENTATION_PLAN.md`
3. `docs/features/recipes-v1/TEST_MATRIX.md` (RC-001 ...) for the phase being built

## DO NOT

- Before pushing any phase, run `NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= npm run build` too: CI has no env files, so `/` is prerendered statically there but dynamic with the local `.env.development.local`.
- Do not start Part 2; T-6 only, in a new session (after T-5 is merged).
- Do not touch `main` or PROD.
- Do not use `git reset --hard`, `git clean -fd`, force-push, squash merge, or rebase merge.
- Do not merge on stale, partial, or red CI.
- `next dev` rewrites the `AGENTS.md` heading; never commit that change (`git checkout AGENTS.md`).
- Recipes V1: R-0 is documentation only. Do not start R-1 or R-2 in the R-0 session; no Recipes application code, migration, Storage bucket or seed data. Part 2 stays ON HOLD.
