# Tasks V1 — Implementation Report

Living document; updated at each phase checkpoint. Plan: `PLAN.md`. Criteria: `ACCEPTANCE_CRITERIA.md`. Scenarios: `TEST_MATRIX.md`.

## 1. Environment & safety

- Branch `feature/tasks-v1` from `development` @ `ead4e8b`. PR #135 is not present and was not touched.
- DEV Supabase `opmujepkemwcdxxorhfd` only. PROD `ftadewtkjlaotfdvtjcv` untouched; no Tasks migration applied to PROD. `NEON_DATABASE_URL` blank for every DEV process.

## 2. Phase log

| Phase                            | State        | Commit      | Notes                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | ------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tracking + docs scaffold         | done         | —           | Milestone "Tasks V1" (#6), parent #136, T1–T8 #137–#144 linked as sub-issues, all in Project #4                                                                                                                                                                                                                                                               |
| T1 Domain / DB / permissions     | done (local) | see git log | pgTAP 26 files / 466 assertions pass; independent schema/RLS review applied                                                                                                                                                                                                                                                                                   |
| T2 Navigation + Today + My Tasks | done         | see git log | Vitest 453+ pass; e2e tasks.spec 12/12 (3 viewports); dashboard/tips e2e 78/78; manager dialogs (create/edit/reassign/cancel/history) shipped here and reused by T3                                                                                                                                                                                           |
| T3 Assigned management view      | done         | see git log | Assigned (scope, person/priority/category/type/date, status chips, per-person progress), Manage → Unfinished work handoff; e2e tasks.spec 24/24 across 3 viewports                                                                                                                                                                                            |
| T4 Opening / T5 Closing          | done         | see git log | Migration `20261025100000_tasks_v1_checklists.sql` (template save/archive, idempotent `checklist_generate_daily`); pgTAP 0027 (40); one engine for both kinds; templates CRUD in Manage; Previous days (staff 7 d / managers 30 d); e2e 36/36 across 3 viewports                                                                                              |
| T6 Recurrence                    | done         | see git log | Migration `20261025110000_tasks_v1_recurrence.sql` (series create/update/stop, lazy idempotent materialization, 14-day horizon); pgTAP 0028 (31); supported: daily, weekdays, weekly, selected weekdays, monthly; ends never/date/count; **custom intervals deferred**; edit scopes: this occurrence (task edit) and this-and-future (series edit); e2e 39/39 |
| T7 Notifications                 | done         | see git log | Migration `20261025120000_tasks_v1_notifications.sql` (idempotent due-soon/overdue sweep, mark read); event-driven rows from T1/T4; inbox dialog + Tasks tab badge (decorative count, button name unchanged); pgTAP 0029 (14); e2e 42/42                                                                                                                      |
| T8 Validation / release gate     | not started  |             |                                                                                                                                                                                                                                                                                                                                                               |

## 3. Final schema

Migration `20261025090000_tasks_v1_foundation.sql` (T1). Tables: `task_categories`, `tasks`, `task_assignments`, `task_events`, `task_notifications`, `task_recurrence_rules`, `task_recurrence_assignees`, `checklist_templates`, `checklist_template_items`, `checklist_template_item_assignees`, `checklist_instances`. RPCs: `task_create`, `task_update`, `task_assign`, `task_set_status`, `task_complete`, `task_reopen`, `task_cancel`, `task_carry_forward`. Later phases add checklist, recurrence and notification RPCs in their own migrations.

**T1 independent review (read-only sub-agent) — findings and disposition**

| Finding                                                                                  | Disposition                                                         |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `template_item_id ON DELETE SET NULL` blocked by the immutability trigger                | fixed (trigger allows the null transition)                          |
| Reads bypassed the `tasks_can_access_location` seam                                      | fixed (tasks, instances, templates, rules policies)                 |
| Any worker could reopen any completion                                                   | fixed (manager or original completer only)                          |
| `template_item_id` without an instance; instance kind vs task kind                       | fixed (CHECK + trigger)                                             |
| Composite tenant FKs for event/notification instance links; org-delete cascades          | fixed                                                               |
| `task_carry_forward` lock order; TRUNCATE guard; unneeded EXECUTE on `tasks_is_assignee` | fixed                                                               |
| Window-only (no date) tasks never overdue                                                | accepted: no due date means never overdue; documented               |
| Hard-deleting a member who created tasks is blocked by actor FKs                         | accepted: members are deactivated, never hard-deleted (Feature 017) |

## 4. Deferrals

_None recorded yet. Planned deferrals: custom recurrence intervals, per-organization categories, "Everyone on shift" assignment, automatic shift handoff, optional manager verification, per-assignee completion for shared tasks, push/email/SMS._

## 5. Evidence

_Filled per phase._
