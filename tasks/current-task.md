# Tasks V1 — Current Task / Agent Handoff

Branch: `feature/tasks-v1`
HEAD: see `git log -1` · PR #145 `feature/tasks-v1` → `development` (OPEN, not merged)
Base development SHA: `ead4e8b` (merge of PR #132)

Parent GitHub issue: #136 · Milestone: "Tasks V1" (#6) · Project #4: parent + T1–T8 (Module=Platform, Work Type=Feature, Priority=P1)

Docs: `docs/features/tasks-v1/` — `PLAN.md`, `ACCEPTANCE_CRITERIA.md`, `TEST_MATRIX.md`, `IMPLEMENTATION_REPORT.md`. Roadmap `docs/ROADMAP.md`, status `docs/STATUS.md`, backlog `tasks/backlog.md`.

## Current phase

- T1 ✅ Domain / DB / permissions (#137) — `ab7dc72`
- T2 ✅ Navigation + Today + My Tasks (#138) — `dd96d23`
- T3 ✅ Assigned + manual handoff (#139) — `27a30c6`
- T4 ✅ Opening (#140) and T5 ✅ Closing (#141) — `ec7052a`
- T6 ✅ Recurrence (#142) — `a984914`
- T7 ✅ Notifications (#143) — `09a3bbb`
- T8 ✅ Validation / release gate (#144) — evidence below; PR/CI/merge state is in the PR

Completed: everything above. In progress: PR review + CI, then merge commit into `development`. Not started: nothing in scope.

## Architecture decisions

- **Role mapping:** manager+ = DB roles `owner | general_manager | shift_manager` (Owner / Manager / Assistant Manager); staff = `host | server`. Membership-only checks (`private.tasks_is_manager`), never `organizations.created_by` (#106).
- **Assignment semantics:** `individual | multiple | all_team | anyone`. Staff see a normal task only if assigned or team/anyone; opening/closing items are visible to all members. Completion by assignee(s) or manager+; assignment rows are never touched by completion.
- **Multiple-assignee semantics:** default shared-once; "each person required" fans out N individual tasks sharing `group_id` (`task_create(p_each_person)`). `task_assignments` is per-person so native per-assignee completion stays possible.
- **Daily checklist semantics:** template → `checklist_instances` (unique template+date) → `tasks` rows (`kind` opening|closing); one engine; idempotent `checklist_generate_daily` (today/tomorrow, any active member); template edits never rewrite an existing day.
- **Recurrence semantics:** rule → ordinary `tasks` rows unique on `(recurrence_rule_id, occurrence_date)`; lazy 14-day materialization; edit = this occurrence or this-and-future (untouched future only); stop keeps history; no custom intervals.
- **Notification semantics:** `task_notifications`; event-driven rows from RPCs; due-soon/overdue by idempotent `task_notifications_sweep`; deduped; unread inbox + Tasks tab badge; no push/email/SMS.
- **Consistency:** database + Server Actions authoritative; snapshot replaced after every mutation; refetch on mount/focus/failure; **no Realtime** (#134 untouched).
- **Demo mode:** pure engine (`task-engine.ts`, `checklist-engine.ts`, `recurrence.ts`) mirrors the RPC rules; state held in the app shell.
- **PostgREST gotcha:** RPCs need every argument present (send explicit `null`).

## Migrations

`20261025090000_tasks_v1_foundation`, `20261025100000_tasks_v1_checklists`, `20261025110000_tasks_v1_recurrence`, `20261025120000_tasks_v1_notifications`.

- DEV applied: **YES** (`opmujepkemwcdxxorhfd`, recorded in `supabase_migrations.schema_migrations`; test data cleaned)
- PROD applied: **NO** — never; they reach PROD only via owner-approved `development → main`

## Files changed

`supabase/migrations/2026102509…2026102512*`, `supabase/tests/database/0026…0029`, `src/types/database.generated.ts`, `src/features/tasks/**`, `src/components/restaurant-operations-app.tsx`, `tests/e2e/tasks.spec.ts`, `tests/e2e/dashboard.spec.ts`, `tests/real/tasks-v1.db.real.test.ts`, `tests/real/ui/tasks.real.spec.ts`, `docs/features/tasks-v1/*`, `docs/ROADMAP.md`, `docs/STATUS.md`, `tasks/*`.
Uncommitted: none expected (only the untracked `The Lineup.code-workspace` and `docs/testing/`, which must never be staged).

## Tests

- Passed: pgTAP 29 files / 553 assertions (Tasks 0026–0029 = 166); Vitest 56 files / 482 (+3 controller tests); `format:check` · `lint` · `typecheck`; `npm run build` pinned to DEV (0 PROD refs in `.next`); Playwright demo suite 339/339 (desktop, host-tablet, server-mobile); hosted DEV RPC/RLS 12/12; hosted DEV browser 3/3.
- Failing: none. Blocked: none (hosted suites need local ignored credentials; not a CI job).
- Browser: `tests/e2e/tasks.spec.ts` (14 scenarios × 3 viewports) + `tests/real/ui/tasks.real.spec.ts`. Database: pgTAP + `tests/real/tasks-v1.db.real.test.ts`. CI: see PR.

## GitHub / docs state

- Issues #137–#143 closed (Done in Project #4); #144 and parent #136 close when the PR merges. Milestone "Tasks V1" closes only after merge.
- Roadmap: ACTIVE Tasks V1 (ready to merge) · PARKED PR #135 · P1 RELEASE BLOCKER #134 · NEXT #109 · PART 2 multi-org/branches/modules/internal attendance · PART 3 MCP/AI.
- Backlog: Tasks deferrals added (custom intervals, per-org categories, "everyone on shift", auto handoff, manager verification, per-assignee completion, push/email/SMS, Realtime signal, hosted suites in CI); carried-over items listed unchanged.

## State flags

PR: `feature/tasks-v1 → development` · development merged: NO (until CI green + review) · main merged: NO · DEV touched: YES (migrations + hosted suites, cleaned) · PROD touched: NO · Running processes: local Supabase stack (Docker); no dev server.

## Exact next command / task

1. CI on PR #145 (2026-10-25): `application` ✔ · `browser-smoke` ✔ · Vercel ✔ · `Database` ✘ ×2 (runs 40172808040) at `supabase start` with `toomanyrequests` — external registry limit, db:reset/db:test never ran in CI. **Waiting for the owner**: re-run later / add registry auth, or explicitly accept the exception (as for PR #131). Re-check with `gh pr checks 145`. If `Database` fails at `supabase start` with `toomanyrequests`, that is the known registry limit (PR #135 fix is parked): record it accurately, do not weaken the job, and report to the owner.
2. If green: merge with a **merge commit** (`gh pr merge --merge`), verify `origin/development` contains Tasks V1 and `origin/main` does not.
3. Post-merge: update #136/#144, Project #4, milestone, docs; close milestone only when everything in scope is closed; any doc commit goes on a `docs/tasks-v1-closeout` branch → PR to `development`.
4. STOP. Do not merge `development → main`; #134 blocks production promotion.

Read first: `docs/features/tasks-v1/IMPLEMENTATION_REPORT.md`.

## DO NOT

Touch PROD · merge to `main` · modify PR #135 · fix #134 here · `git add .` / `-A` · stage `docs/testing/` or `The Lineup.code-workspace` · edit an applied migration (add a new one) · claim PASS for an unrun check.

## How to resume locally

`NEON_DATABASE_URL=` blank for every DEV process. Local DB: `npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,mailpit,realtime,storage-api,postgres-meta,supavisor`, `npx supabase db reset`, `npx supabase test db`. Hosted suites: start `NEON_DATABASE_URL= npm run dev`, then `npm run test:real` / `npm run test:real:ui` (stop the dev server before demo e2e).
