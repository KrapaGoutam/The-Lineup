# Tasks V1 — Plan

**Status:** building (T1) · **Branch:** `feature/tasks-v1` (from `development` @ `ead4e8b`) · **Tracking:** parent #136, milestone "Tasks V1", T1–T8 = #137–#144, Project #4.
**Companion docs:** `ACCEPTANCE_CRITERIA.md`, `TEST_MATRIX.md`, `IMPLEMENTATION_REPORT.md`. Agent handoff: `tasks/current-task.md`.

## 1. Purpose

Frontline restaurant work that is not table rotation: cleaning, restocking, opening and closing checklists, one-off manager requests. Tasks is the second primary operating module next to Table Rotation. Staff see what they must do now; managers assign, review progress, and can check work off on someone's behalf without falsifying who it was assigned to.

## 2. Navigation

- `Table Rotation` and `Tasks` are the two visually dominant tabs in the shell (desktop sidebar/top tier, mobile dock). `Schedule`, `Team`, `Attendance`, `Tips`, `Payroll`, `Settings` stay visible and reachable but render in the secondary tier (Tips moves from primary to secondary; no tab is hidden).
- Tasks subtabs: `Today` (default) · `My Tasks` · `Opening` · `Closing` · `Assigned` (manager+) · `Manage` (manager+: templates, recurring series, handoff).
- Hidden tabs are a UX affordance only; every manager capability is enforced by RLS/RPC.

## 3. Role mapping (no role migration)

The database role is `memberships.roles app_role[]`; the user-facing label is the Feature 014 _designation_ (`src/features/auth/domain/passcode.ts`).

| Business label    | DB role(s)        | Designation         | Tasks capability                                 |
| ----------------- | ----------------- | ------------------- | ------------------------------------------------ |
| Owner             | `owner`           | `owner`             | manager+                                         |
| Manager           | `general_manager` | `manager`           | manager+                                         |
| Assistant Manager | `shift_manager`   | `assistant_manager` | manager+ (identical to Manager, per Feature 014) |
| Staff             | `host`, `server`  | `staff`             | staff                                            |

Authorization uses **active membership rows only** (`private.tasks_is_manager` / `private.tasks_is_member`), never `organizations.created_by` (the #106 creator bypass in `private.has_org_role` is not consulted).

## 4. Task lifecycle

`OPEN → IN_PROGRESS ↔ BLOCKED → COMPLETED`, and `CANCELLED` from any non-terminal state. A completed task can be _reopened_ (un-checked) by an eligible actor and returns to `OPEN`. `OVERDUE` is **derived, never stored**: `due_at < now()` and status ∈ {open, in*progress, blocked}. `due_at` is computed by a trigger in the location's time zone: `due_date + due_time`; a date-only or window-only task is due at the \_end* of its due date (next local midnight); no due date → never overdue.

## 5. Assignment semantics

`assignment_mode`:

| Mode         | Assignee rows | Who sees it          | Who may work/complete it                       |
| ------------ | ------------- | -------------------- | ---------------------------------------------- |
| `individual` | 1             | assignee + managers  | assignee + managers                            |
| `multiple`   | N ≥ 2         | assignees + managers | any one assignee + managers                    |
| `all_team`   | none          | every active member  | any active member                              |
| `anyone`     | none          | every active member  | any active member ("shared / anyone eligible") |

(Opening/closing items are always visible to every active member so the whole checklist is legible, but only their eligible actors can complete them.) "Everyone on shift" is **deferred** (would couple to Schedule).

### Multiple-assignee completion (V1 exact behavior)

- **Shared once** (default for `multiple`/`all_team`/`anyone`): any eligible actor completes it once; the task is complete for the group. `completed_by`/`completed_at` record who.
- **Each person required**: `task_create(..., p_each_person => true)` fans out into N independent `individual` tasks that share a `group_id`. Each has its own status, completion and history. The schema does not preclude native per-assignee completion later (`task_assignments` is already one row per person).

## 6. Manager completion on behalf

`task_complete` is allowed for the assignee(s) and for manager+; unrelated staff are rejected. It writes `completed_by = auth.uid()` and `completed_at`; **assignments are never touched**, so "Assigned to Bhoomi · Completed by Raj 4:13 PM" is stored as two facts. The same holds for opening/closing items.

## 7. Audit history

`task_events` is append-only (no client write grant; update/delete blocked by trigger). Only manager+ may `SELECT` it (RLS). Event types: `created, assigned, reassigned, edited, started, blocked, unblocked, completed, reopened, cancelled, carried_forward, recurrence_created, recurrence_changed, checklist_generated`. Staff see operational fields only (title, instructions, category, priority, due, status, completed-by/at, completion note) — not the timeline. Event rows are emitted by the trusted RPCs only; rendering never writes events.

## 8. Data model (smallest coherent)

Reused patterns: composite `(id, organization_id)` tenant keys, `(organization_id, profile_id) → memberships` actor FKs, `SECURITY DEFINER … set search_path = ''` RPCs for every mutation, authenticated clients get `SELECT` only. New tables (all RLS, all indexed):

| Table                                                                                    | Purpose                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `task_categories`                                                                        | Global reference list (slug, name, sort). Single DB source; UI reads it with a typed TS fallback. Per-org custom categories deferred.                                                       |
| `tasks`                                                                                  | One row per actionable item: normal task, recurrence occurrence, **and** each daily Opening/Closing item (`kind` = `task`/`opening`/`closing`). One lifecycle/assignment/completion engine. |
| `task_assignments`                                                                       | (task, person) rows; `assigned_by`, `assigned_at`.                                                                                                                                          |
| `task_events`                                                                            | Append-only audit (manager-read).                                                                                                                                                           |
| `task_recurrence_rules` + `task_recurrence_assignees`                                    | Recurrence _definition_; occurrences are ordinary `tasks` rows with `recurrence_rule_id` + `occurrence_date` (unique together).                                                             |
| `checklist_templates` + `checklist_template_items` + `checklist_template_item_assignees` | Reusable Opening/Closing definitions (name, applicable weekdays, items with shared/one/multi/all-team assignment).                                                                          |
| `checklist_instances`                                                                    | One per (template, location, service date). Items materialise as `tasks` rows pointing at the instance.                                                                                     |
| `task_notifications`                                                                     | In-app inbox, per recipient, `read_at`, deduped by `(recipient, dedupe_key)`.                                                                                                               |

Every row carries `organization_id` **and** `location_id` (composite FK to `locations(id, organization_id)`), so Part 2 multi-org/multi-location needs a new membership/location-access seam only (`private.tasks_can_access_location`), not a schema rewrite.

## 9. Daily checklists (hard requirement)

```
checklist_template ─▶ checklist_instance (template, location, service_date UNIQUE)
                          └─▶ tasks rows (kind opening|closing, own status/completion)
```

`generate_daily_checklists(location, date)` is idempotent (unique key) and snapshots template items into `tasks`; editing a template later never rewrites an existing day. Yesterday's checked state cannot leak into today because today's items are different rows. Progress = completed / total items of the instance (cancelled items excluded). Generation is permitted for the location's _today_ and _tomorrow_ only. Opening/Closing is deliberately **not** a recurring Task with a reset checkbox.

## 10. Recurrence

Rule → occurrences. Supported: `daily`, `weekdays`, `weekly`, `selected_weekdays`, `monthly` (day-of-month, clamped to month end); end `never` / `on_date` / `after_count`. `custom` intervals are **out of V1** (documented). Occurrences are materialised lazily within a 14-day horizon by `generate_recurring_tasks` (idempotent; no cron dependency). Edits: _this occurrence only_ (edit the task row) or _this and future_ (updates the rule and replaces not-yet-started future occurrences; completed/started/past occurrences are never touched). _Entire series_ collapses into this-and-future because past history is immutable.

## 11. Notifications

In-app only. Types: `assigned, reassigned, due_soon, overdue, completed, checklist_available`. Written in the same transaction as the triggering RPC (assign/reassign/complete/generate); due-soon/overdue by the idempotent `task_notifications_sweep` which runs on Tasks load. Unread badge on the Tasks tab. No email/SMS/push. Not spammed: no event for edits, status changes or reads.

## 12. Realtime / consistency (#134 is open)

Database + Server Components/Actions are authoritative. After every mutation the client refetches (`router.refresh()` / action-returned snapshot); on tab focus and re-entry it refetches again. Optimistic checkbox state is _transient_ and always replaced by the server result, including on failure. Realtime is **not used in V1** (it may later act only as an invalidation signal → refetch). Tasks does not fix or depend on #134.

## 13. Shift handoff (V1)

Manual: Manage → "Unfinished from earlier days" lists open/in-progress/blocked overdue tasks; manager chooses **Carry forward** (new due date, event `carried_forward`), **Reassign**, or **Cancel**. Automatic handoff on shift change is deferred (depends on Schedule maturity).

## 14. Future-proofing

- _Optional manager verification_ (cash count, temperature log…): add `requires_verification` + `pending_verification` status later; V1 completes straight to `COMPLETED`.
- _Per-assignee completion_, _per-org categories_, _Everyone on shift_, _custom recurrence intervals_, _push/email_ — recorded in the report as deferrals.

## 15. Phases

T1 Domain/DB/permissions (#137) · T2 Navigation + Today + My Tasks (#138) · T3 Assigned (#139) · T4 Opening (#140) · T5 Closing (#141) · T6 Recurrence (#142) · T7 Notifications (#143) · T8 Validation/responsive/release gate (#144). One logical commit (or few) per phase; no merge until T8.

## 16. Risks

- Demo mode (no DB) needs an in-memory Tasks implementation sharing the pure domain rules, else Preview/e2e diverge from real mode.
- Lazy generation depends on someone opening Tasks that day; mitigated by being callable by any active member and by idempotency.
- Database CI on `development` still lacks the PR #135 registry fix; the known `toomanyrequests` failure is documented, not worked around, if it recurs.
- `docs/testing/` and `The Lineup.code-workspace` are untracked and must never be staged.

## 17. Out of scope

Part 2 (org switching, branches, per-location modules, internal Attendance), Part 3 (MCP/AI), push/email/SMS, photo proof, custom recurrence, redesign of other modules, fixing #134/#109/#106.
