# Tasks V1 — Implementation Report

Plan: `PLAN.md` · Criteria: `ACCEPTANCE_CRITERIA.md` · Scenarios: `TEST_MATRIX.md` · Handoff: `tasks/current-task.md`
Tracking: parent #136, milestone "Tasks V1", T1–T8 = #137–#144, Project #4.

## 1. Environment and safety

- Branch `feature/tasks-v1` from `development` @ `ead4e8b`. PR #135 (parked) is not present and was not touched.
- **DEV Supabase `opmujepkemwcdxxorhfd` only.** The four Tasks migrations were applied to DEV (recorded in `supabase_migrations.schema_migrations`) and exercised by the hosted real-mode suites; all test data was removed afterwards (DEV `tasks`, `task_events`, templates and harness orgs verified empty).
- **PROD `ftadewtkjlaotfdvtjcv` untouched.** No Tasks migration, deploy or variable change touched PROD; the production build (all variables pinned to DEV, `NEON_DATABASE_URL` blank) contains 0 references to the PROD ref.
- Tasks migrations reach PROD only when the owner promotes `development → main` (a push to `main` runs the Database workflow's `deploy-migrations`). #134 remains a release blocker for that promotion.

## 2. Phase log

| Phase                            | State | Commit    | Evidence                                                             |
| -------------------------------- | ----- | --------- | -------------------------------------------------------------------- |
| Tracking + docs scaffold         | done  | —         | milestone #6, parent #136, T1–T8 #137–#144 as sub-issues, Project #4 |
| T1 Domain / DB / permissions     | done  | `ab7dc72` | pgTAP 0026 (81); independent schema/RLS review applied               |
| T2 Navigation + Today + My Tasks | done  | `dd96d23` | Vitest; e2e on 3 viewports                                           |
| T3 Assigned + handoff            | done  | `27a30c6` | e2e manager flows                                                    |
| T4 Opening / T5 Closing          | done  | `ec7052a` | pgTAP 0027 (40); one engine; day isolation proven in DB/unit/browser |
| T6 Recurrence                    | done  | `a984914` | pgTAP 0028 (31)                                                      |
| T7 Notifications                 | done  | `09a3bbb` | pgTAP 0029 (14)                                                      |
| T8 Validation / release gate     | done  | `13b7318` | hosted DEV suites 12 + 3; full gate (section 5)                      |

## 3. Final schema

Migrations (forward-only, unreleased): `20261025090000_tasks_v1_foundation`, `…100000_tasks_v1_checklists`, `…110000_tasks_v1_recurrence`, `…120000_tasks_v1_notifications`.

| Table                                                                                    | Purpose                                                                                     |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `task_categories`                                                                        | Global reference list (single DB source; UI has a typed fallback)                           |
| `tasks`                                                                                  | One row per actionable item: normal task, recurrence occurrence, daily Opening/Closing item |
| `task_assignments`                                                                       | (task, person); completion never touches it                                                 |
| `task_events`                                                                            | Append-only audit (trigger-enforced; manager-read RLS; cascades allowed)                    |
| `task_notifications`                                                                     | In-app inbox, per recipient, deduped by `(recipient, dedupe_key)`                           |
| `task_recurrence_rules` / `task_recurrence_assignees`                                    | Series definition                                                                           |
| `checklist_templates` / `checklist_template_items` / `checklist_template_item_assignees` | Reusable Opening/Closing definitions                                                        |
| `checklist_instances`                                                                    | One per (template, date); items are `tasks` rows                                            |

RPCs: `task_create/update/assign/set_status/complete/reopen/cancel/carry_forward`, `checklist_template_save/set_active`, `checklist_generate_daily`, `task_series_create/update/stop`, `task_recurrence_generate`, `task_notifications_sweep/mark_read`. Clients have `SELECT` only; every write is a SECURITY DEFINER RPC (empty `search_path`) that re-derives identity from `auth.uid()` and an **active membership** (never `organizations.created_by`, see #106).

## 4. Behaviour (as built)

- **Role mapping:** manager+ = `owner | general_manager | shift_manager`; staff = `host | server`. No role migration.
- **Assignment modes:** individual, selected people, all team, anyone. "Each person required" fans out into independent individual tasks (`group_id`); default is shared-once. "Everyone on shift" deferred.
- **Manager completion on behalf:** `completed_by`/`completed_at` recorded; assignments unchanged; audit event flags `on_behalf`. Reopen is limited to manager+ or the original completer.
- **History privacy:** `task_events` readable by manager+ only (RLS); staff UI has no timeline.
- **Overdue** is derived from the trigger-computed `due_at` (location time zone); window-only tasks without a date are never overdue; a date-only task is due at the end of that local day.
- **Daily checklists:** idempotent generation for today/tomorrow by any active member; template edits never rewrite an existing day; deactivated assignees degrade gracefully. Previous days: staff 7 days (read-only), managers 30 days.
- **Recurrence:** daily, weekdays, weekly, selected weekdays, monthly (clamped); end never/date/count; lazy 14-day materialization; edits: this occurrence (task edit) or this-and-future (untouched future occurrences only); stopping keeps history.
- **Notifications:** assigned, reassigned, due-soon, overdue, completed, checklist available; deduped sweep; unread inbox + tab badge. No push/email/SMS.
- **Consistency:** database + Server Actions are authoritative. The client replaces its snapshot with every mutation result, refetches on mount/focus/failure and never keeps optimistic state. No Realtime anywhere in Tasks (#134 untouched).
- **Navigation:** Table Allocation and Tasks are the primary tier; Schedule, Team, Attendance, Tip Split, Payroll, Settings remain visible (secondary tier; mobile dock = Allocation / Tasks / More).

## 5. Evidence

| Check                                                                                                         | Result                                                                                        |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `supabase db reset` (local, 39 migrations) + pgTAP (29 files / 553 assertions; Tasks 0026–0029 = 166)         | PASS                                                                                          |
| Independent read-only schema/RLS review (sub-agent); findings fixed                                           | PASS                                                                                          |
| Vitest (56 files / 482 tests: Tasks domain, engine, notifications, component)                                 | PASS                                                                                          |
| `npm run format:check` · `lint` · `typecheck`                                                                 | PASS                                                                                          |
| `npm run build` with every variable pinned to DEV; `.next` has 0 PROD refs                                    | PASS                                                                                          |
| Playwright demo suite, all specs × desktop / host-tablet / server-mobile                                      | PASS 339/339                                                                                  |
| Hosted DEV RPC/RLS suite `tests/real/tasks-v1.db.real.test.ts`                                                | PASS 12/12                                                                                    |
| Hosted DEV browser suite `tests/real/ui/tasks.real.spec.ts` (manager + staff contexts, real passcode sign-in) | PASS 3/3                                                                                      |
| GitHub Actions on PR #145 at `c036cf2` (application, browser-smoke, Database, Vercel)                         | PASS (browser-smoke re-run once after a cancelled runner job; Database passed on its own run) |

A real defect was found only by the hosted suites and fixed: PostgREST requires every RPC argument to be present, so the Server Action now sends explicit `null`s (omitted arguments → `PGRST202`).

## 6. Deferrals (kept open in the backlog, not silently dropped)

Custom recurrence intervals · per-organization custom categories · "Everyone on shift" assignment · automatic shift handoff (V1 is manual carry-forward / reassign / cancel) · optional manager verification (`pending_verification` status) · per-assignee completion for shared tasks (the data model allows it) · push/email/SMS · "entire series" edit scope (collapses into this-and-future because history is immutable) · a Realtime invalidation signal (re-evaluate after #134).

## 7. Remaining risks

- Lazy generation (checklists, recurrence, sweeps) runs when a member opens Tasks; if nobody opens Tasks, nothing is generated until someone does (idempotent catch-up, no data loss).
- The Database CI job on `development` still lacks the PR #135 registry fix; the known `toomanyrequests` failure at `supabase start`, if it recurs, is documented and not worked around.
- The demo-mode engine duplicates the RPC rules in TypeScript; parity is enforced by parallel pgTAP / Vitest / e2e scenarios, not shared code.

## 8. Merge record

PR #145 merged into `development` with a merge commit (`4c393d3`); `origin/main` does not contain it and no `main` workflow ran. Issues #136–#144 and milestone "Tasks V1" are closed; Project #4 items are Done. Deferrals remain in `tasks/backlog.md`. The earlier Database `toomanyrequests` failures on this PR were external registry limits; the Database job later passed without any exception.
