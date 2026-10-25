# Tasks V1 — Current Task / Agent Handoff

**Branch:** `feature/tasks-v1` · **HEAD:** see `git log -1` (T1 commit is the first on the branch) · **Base development SHA:** `ead4e8b` (merge of PR #132)
**Parent GitHub issue:** #136 · **Milestone:** "Tasks V1" (#6) · **Project #4:** parent + T1–T8 added (Module=Platform, Work Type=Feature, Priority=P1, Phase=Implementation; Status In Progress for parent+T1, Planned for T2–T8)
**Docs:** `docs/features/tasks-v1/` — `PLAN.md` (decisions), `ACCEPTANCE_CRITERIA.md`, `TEST_MATRIX.md`, `IMPLEMENTATION_REPORT.md`. Roadmap: `docs/ROADMAP.md`.

## Phase checklist

- [x] Tracking: milestone, parent #136, children T1 #137 · T2 #138 · T3 #139 · T4 #140 · T5 #141 · T6 #142 · T7 #143 · T8 #144 (linked as sub-issues)
- [x] Docs scaffold (PLAN / AC / TEST_MATRIX / REPORT)
- [x] **T1 Domain / DB / permissions** — migration `20261025090000_tasks_v1_foundation.sql`, pgTAP `0026_tasks_v1_foundation.test.sql` (79 assertions), regenerated `src/types/database.generated.ts`. Independent schema/RLS review done; fixes applied (see report).
- [x] **T2 Navigation + Today + My Tasks** — Tasks primary tab (Tips moved secondary, mobile dock Allocation/Tasks/More), `src/features/tasks/{domain,data,actions,hooks,components}`, demo engine, create/edit/reassign/cancel/detail dialogs, e2e `tests/e2e/tasks.spec.ts`
- [x] **T3 Assigned** — `assigned-view.tsx`, `handoff-panel.tsx`, Manage tab (manager+); e2e manager flows
- [x] **T4 Opening + T5 Closing** — migration `20261025100000_tasks_v1_checklists.sql`, pgTAP 0027 (40 assertions), `checklist-engine.ts`, `checklist-view.tsx`, `templates-panel.tsx`, `template-dialog.tsx`, Today cards, e2e

## Architecture decisions (details in PLAN.md)

- **Role mapping:** manager+ = DB roles `owner|general_manager|shift_manager` (designations Owner/Manager/Assistant Manager); staff = `host|server`. Membership-only checks (`private.tasks_is_manager`), never `organizations.created_by`.
- **Assignment semantics:** modes `individual | multiple | all_team | anyone`. Staff see a `kind='task'` task only if assigned or mode is team/anyone; opening/closing items are visible to all members. Completion by assignee(s) or manager+; assignment rows are never touched by completion.
- **Multiple-assignee:** default shared-once; "each person required" = `task_create(p_each_person=>true)` fans out N individual tasks sharing `group_id`.
- **Daily checklist:** template → `checklist_instances` (unique template+date) → `tasks` rows (`kind` opening|closing). T4 migration adds the generator; Opening/Closing share one engine.
- **Recurrence:** `task_recurrence_rules` → ordinary `tasks` rows with `(recurrence_rule_id, occurrence_date)` unique; lazy idempotent generation (T6 migration). No `custom` interval in V1.
- **Notifications:** `task_notifications` table + `private.tasks_notify` exist; assign/reassign/complete already emit. T7 adds sweep (due-soon/overdue), checklist-available, mark-read RPC, UI badge.
- **Overdue** derived from trigger-computed `tasks.due_at` (location tz). Reopen is allowed only for manager+ or the original completer.
- **Consistency:** DB + Server Actions authoritative; client refetches after mutation and on focus; **no Realtime** in V1 (#134 untouched).
- **Demo mode:** shell must hold demo Tasks state (pure engine mirroring the RPCs) so Preview/e2e work; planned `task-engine.ts` + `useTasksController`.

## Migrations

- Local applied via `supabase db reset` (36 migrations). **DEV applied: NO** (apply once the migration set is final, before real-mode validation in T8). **PROD applied: NO — never.**

## Files changed so far

`supabase/migrations/20261025090000_tasks_v1_foundation.sql`, `supabase/tests/database/0026_tasks_v1_foundation.test.sql`, `src/types/database.generated.ts`, `src/features/tasks/domain/{task-types,task-rules}.ts`, `docs/features/tasks-v1/*`, `tasks/current-task.md`.

## Tests

- PASS: pgTAP 26 files / 466 assertions (local, Docker). No other suites run yet this branch.
- Browser / DB-hosted / CI: not run yet.

## How to resume

- `NEON_DATABASE_URL=` blank for every DEV process. Local DB: `npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,mailpit,realtime,storage-api,postgres-meta,supavisor` (Docker Desktop; JobQuest containers are unrelated — leave running), `npx supabase db reset`, `npx supabase test db`.
- Stage explicit paths only. Never `git add -A/.`; `docs/testing/` and `The Lineup.code-workspace` are untracked on purpose.
- Gotcha: in Node/JS string `.replace`, `$$` collapses to `$` — never use it to inject SQL dollar quotes.

## State flags

PR: none yet · PR target: `development` · development merged: NO · main merged: NO · DEV touched: NO (this branch) · PROD touched: NO · Running processes: local Supabase stack (started this session).

## Exact next step

T6: migration `20261025110000_tasks_v1_recurrence.sql` — `task_series_create/update/stop` + idempotent `task_recurrence_generate` (14-day horizon, unique (rule, occurrence*date)), pgTAP `0028*\*`; pure `recurrence.ts` (occurrence dates for daily/weekdays/weekly/selected weekdays/monthly + end rules) shared by demo engine and UI preview; recurrence section in task form + Manage "Recurring tasks"; e2e. Then T7 notifications (sweep RPC, mark read, badge), T8 validation.

## DO NOT

Touch PROD · merge to `main` · modify PR #135 · fix #134 here · use `git add .`/`-A` · edit an already-applied migration after it reaches DEV (add a new one) · call a phase PASS without evidence.
