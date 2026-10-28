# Current Task Handoff

## Current cycle

Tasks V1.1 — **T-1 COMPLETE**. **T-2 COMPLETE** (Management Today, #169). **T-3 (notification narrowing, #154) IN PROGRESS** on `feature/tasks-v1-1-notification-scope` (base `development` @ `f4f1aae26fdcf95d7d6b960eafb624ca05bcaa27`). **T-4 NOT STARTED.** · Part 2 ON HOLD · `main` UNTOUCHED · PROD UNTOUCHED. Vendor Order Drafts V1 is complete (VOD-4 GO, #190 closed).

## Current phase

T-3 — Notification narrowing (#154, PLAN D-3): IN PROGRESS. Gate in `private.tasks_notify` (one migration) + TypeScript demo-engine mirror + tests. T-4 NOT STARTED (do not start).

## Execution

Claude Code Cloud (Sonnet 5.5, high effort, new session). No hosted DEV, no migration. PROD never targeted.

## Branch / base

- T-2: branch `feature/tasks-v1-1-management-today` from `c6f309eae5c674e71b3906ff1b26faae0440ca22`; PR #205, tested head `c2ef864` (= local = remote = PR head = CI-tested SHA; application, browser-smoke and Vercel green; database workflow path-gated, no `supabase/**` change), merge commit `46ea022` (two parents); `development` HEAD after merge `46ea022`
- T-1 (done): PR #203 tested `1e3e4b1`, merge `cf3ae39`; docs PR #204, merge `c6f309e`
- Issue: #169 (tracking) · Project #4 (card update not performed: Projects tooling unavailable in this session)
- T-3: IN PROGRESS · branch `feature/tasks-v1-1-notification-scope` · base `development` @ `f4f1aae26fdcf95d7d6b960eafb624ca05bcaa27` · tracking #154 · T-4 NOT STARTED · Part 2: ON HOLD · `main`: UNTOUCHED · PROD: UNTOUCHED

## Phase ledger

```text
Vendor Order Drafts V1 COMPLETE (VOD-0..VOD-4, #190 closed)
Tasks T-0 plan COMPLETE (#189)
Tasks T-1 COMPLETE (PR #203, tested 1e3e4b1, merge cf3ae39)
Tasks T-2 COMPLETE (PR #205, tested c2ef864, merge 46ea022)
Tasks T-3 NEXT / NOT STARTED · T-4..T-6 NOT STARTED
Part 2 (multi-org / multi-location / attendance) ON HOLD
Final Development Gate NOT STARTED · main UNTOUCHED · PROD UNTOUCHED
```

## T-2 result

- Management Today: `Show tasks for` select (All Staff / My Tasks / person by profile id) for Owner, Manager, Assistant Manager; Opening / General / Closing groups; staff name on each row; staff unchanged. Detail: `docs/features/tasks-v1-1/IMPLEMENTATION_REPORT.md` (T-2).
- Evidence: Vitest 1586/1586; `management-today.spec.ts` 7/7 on desktop and server-mobile; Tasks + default-landing + dashboard regression 57/57 desktop, server-mobile and Chromium-emulated iPad; check, build and the empty-Supabase-env build green. WebKit (host-tablet) was not installable in the cloud container and CI runs only `--project=desktop` browser-smoke, so **real `host-tablet` WebKit was not run for T-2** (Chromium iPad emulation only); T-6 should run it.

## Current State & Next Step

- [x] T-2 implemented, validated, exact-head CI green, merged (`46ea022`), docs synced
- [ ] T-3 IN PROGRESS (this session): migration `20261028090000_tasks_v1_1_notification_scope.sql`, `task-engine.ts` mirror, vitest + pgTAP + e2e updates, docs. Next step: see the checkboxes below, then push and open the PR.

## T-3 progress (this session)

- [x] Migration `20261028090000_tasks_v1_1_notification_scope.sql` (gate in `private.tasks_notify`; sweep count fixed)
- [x] `task-engine.ts` mirror (`isOperationalNotification`) + `notifications.test.ts` (Vitest 1606/1606)
- [x] pgTAP: new `0041`, updated `0026`, `0029` (local PG16 harness; 0039 needs dblink, unrelated)
- [x] e2e `tasks.spec.ts` notification test + `tests/real/tasks-v1.db.real.test.ts` updated
- [x] check, build, empty-Supabase-env build green; Playwright 57/57 desktop, server-mobile, Chromium-iPad
- [x] Docs: IMPLEMENTATION_REPORT, TEST_MATRIX, PLAN, ROADMAP, STATUS, backlog
- [ ] Commit, push, PR to `development`, exact-head CI, merge commit, post-merge docs sync (`docs/tasks-v1-1-t3-post-merge-sync`), #154 comment
- T-4 NOT STARTED. Do not start it in this session.

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
- Do not start Part 2; T-3 only, in a new session.
- Do not touch `main` or PROD.
- Do not use `git reset --hard`, `git clean -fd`, force-push, squash merge, or rebase merge.
- Do not merge on stale, partial, or red CI.
- `next dev` rewrites the `AGENTS.md` heading; never commit that change (`git checkout AGENTS.md`).
