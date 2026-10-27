# Tasks V1.1 — Plan

**Status:** planned, not built · **Issues:** #169 (management Today view), #154 (notification scope) · **Base:** `development` after Bar Inventory V1 and the next/zod security bump · **Companion:** `TEST_MATRIX.md` · **Handoff:** `tasks/current-task.md`
**Safety:** `main` and PROD untouched. Migrations go to DEV only. One branch and one PR per phase, merge commits only.

## 1. Outcome

1. The app opens on **Tasks → Today** for every role. An explicitly requested module stays put on refresh.
2. Owner / Manager / Assistant Manager can look at Today as **All Staff**, **My Tasks** or **one person**, and every row says who it belongs to.
3. The notification inbox carries **Opening and Closing operational work only** (#154). Task audit history is untouched.
4. If required Opening work is still open, management gets **server-decided reminders at open, +15 and +30 minutes** in the location's time zone, once each, with a popup that never mutates task state.

Non-goals: Closing reminder timing (none invented), reminder stages after +30, new roles, a scheduling platform, cron, push/SMS/email, staff-facing global reminders, Tips V2.

## 2. Repository truth that shapes the plan

| Fact (verified 2026-10-27)                                                                                                                                                        | Consequence                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| The app is one client shell. `tab` is `useState<AppTab>("allocation")` in `restaurant-operations-app.tsx`; the only routes are `/` and `/r/[slug]`. There are **no module URLs**. | "Deep links respected" and "refresh keeps the module" need a small, explicit mechanism (D-1).       |
| `isTasksManager(designation)` is true for every non-`staff` designation.                                                                                                          | Reuse it; no new role flag.                                                                         |
| A manager's Tasks snapshot already contains every task (RLS `tasks_can_view`); staff only receive what RLS lets them read.                                                        | The management filter is a view over data the viewer may already read. No new server surface (D-2). |
| `operating_hours(location_id, day_of_week, opening_local, closed)` with `locations.opening_local` as fallback; `locations.time_zone`.                                             | The only business-hours source. No second system (D-4).                                             |
| `getTasksSnapshot` already calls idempotent, best-effort RPCs on every load (`checklist_generate_daily`, `task_notifications_sweep`, `task_recurrence_generate`).                 | Reminders follow the same "any member's load triggers an idempotent server sweep" pattern.          |
| `task_notifications` has `unique (recipient_profile_id, dedupe_key)` and `private.tasks_notify` inserts `on conflict do nothing`.                                                 | Dedup needs no new table: the key encodes location, service date and stage (D-4).                   |
| There is no `required` flag on checklist items.                                                                                                                                   | "Required Opening tasks" = every non-cancelled item of today's Opening instances (D-6).             |
| `task_events` is append-only and carries `completed` / `reopened` with timestamps.                                                                                                | State at a past instant is reconstructible, which catch-up needs (D-4).                             |

## 3. Decisions

**D-1 Landing and module addressing.** Initial `tab` becomes `"tasks"`. An optional `?tab=<module>` query (allocation, schedule, tasks, team, attendance, barInventory, tips, payroll, settings) is read once on mount and mirrored with `history.pushState` on module change plus a `popstate` listener, so refresh keeps the module and back/forward behave. A module the role may not open (for example `barInventory` for staff) falls back to Tasks. The Tasks section accepts `&section=opening|closing|mine|…` for the reminder CTA. No new routes, no redirects, no middleware change. _This is the one place the owner's wording ("deep links remain") assumed URLs that do not exist; the query parameter is the smallest way to honour the intent._
Mobile dock highlight follows `tab`, so a default launch highlights Tasks.

**D-2 Management Today scope.** Scope state `{ all | mine | person(id) }`, management only, default `all`. Staff never get the control and their snapshot cannot contain coworker tasks because RLS is the gate; the client is not trusted. Staff-name rule per row: `individual` → the assignee; `multiple` → names joined; `all_team` → "Whole team"; `anyone` → "Anyone". Nothing is invented; "Completed by" stays a separate fact. The person scope matches **named assignees only**; shared work is not attributed to a person. Layout follows the issue: Opening · General · Closing groups for the service date, overdue first. Selector is a native `<select>` (keyboard and phone friendly).

**D-3 Notification narrowing (#154).** One gate inside `private.tasks_notify`: a notification is stored only when its source is operational (`checklist_available`, `opening_reminder`, or a task whose `kind` is `opening`/`closing`). Everything for `kind = 'task'` is suppressed.

| Type                    | Normal task                                                                 | Opening / Closing |
| ----------------------- | --------------------------------------------------------------------------- | ----------------- |
| `assigned`/`reassigned` | suppressed                                                                  | kept (as today)   |
| `completed` (for you)   | suppressed                                                                  | kept (as today)   |
| `due_soon`/`overdue`    | suppressed (sweep targets only `kind='task'`, so the sweep becomes a no-op) | n/a               |
| `checklist_available`   | n/a                                                                         | kept              |
| `opening_reminder`      | n/a                                                                         | new (T-4)         |

`task_events` and `tasks_emit` are not touched, so audit history is unchanged. Existing stored notifications are not deleted. The TypeScript demo engine mirrors the gate so demo mode and DB agree (shared vectors).

**D-4 Opening reminders (server-authoritative).**

- New RPC `task_opening_reminders_sweep(p_organization_id, p_location_id)`, called from `getTasksSnapshot` after `checklist_generate_daily`. Caller must be an active member (`tasks_begin`); recipients are computed on the server, never supplied.
- `service_date` = today in `locations.time_zone`. Opening instant = `(service_date + opening_local) AT TIME ZONE time_zone`, where `opening_local` comes from `operating_hours` for that weekday, else `locations.opening_local`. A `closed` day emits nothing. Stage instants are `opening + 0 / 15 / 30 minutes` as absolute instants, so DST cannot shift the +15/+30 gap.
- Stages `OPEN`, `OPEN_PLUS_15`, `OPEN_PLUS_30`. **No stage exists after +30.**
- A stage is emitted only if (a) its instant has passed, (b) at that instant at least one Opening item was incomplete (reconstructed from `task_events`), (c) at least one item is incomplete **now**, and (d) it has not been emitted for that recipient. This gives: completed before +15 → no +15/+30; reopened at T+20 → +15 stays skipped (it was complete at its instant) and +30 may emit; app closed until T+40 → every missed stage that was truly incomplete is persisted once (catch-up).
- Recipients: active memberships with Owner / Manager / Assistant Manager. Staff receive no global reminder in V1.1 (they already see the Opening checklist itself).
- Dedup key: `opening_reminder:<location_id>:<service_date>:<STAGE>` per recipient, enforced by the existing unique index. Repeated RPCs, reloads, two tabs, reconnects and retries are no-ops.
- New enum value `opening_reminder` (its own migration; PostgreSQL cannot use an added enum value in the same transaction). Body carries the incomplete count at the stage instant.
- Safety: `security definer`, `set search_path = ''`, membership checked through `private.tasks_begin`, org/location validated, no client-supplied profile ids.
- Client wake-up: the controller's existing 30 s clock refreshes the snapshot when `now` crosses a stage instant (the snapshot exposes `openingAt`). This is only a wake-up; the server still decides.

**D-5 Popup and catch-up.** `OpeningReminderPrompt` mounted in the app shell (visible on any module), built on `components/ui/dialog.tsx`, never `alert()`. It shows the **newest unread** `opening_reminder` for today's service date; older stages stay in the notification history. **View Opening Tasks** marks the stage notifications read and navigates to Tasks → Opening. **Dismiss** only marks them read (`task_notifications_mark_read`), so a second tab drops the popup on its next refresh/focus and no task state changes. Copy per the owner brief (T+0 "Opening tasks are not complete", T+15 "still incomplete", T+30 "overdue").

**D-6 "Required" Opening work** = all non-cancelled Opening instance items for the service date. A real `required` flag is a possible later enhancement, not V1.1.

## 4. Phases

| Phase | Branch (from latest `development`)      | Scope                                                                                                                                             | Migration |
| ----- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| T-0   | `docs/tasks-v1-1-plan`                  | This plan, `TEST_MATRIX.md`, handoff, roadmap/status                                                                                              | no        |
| T-1   | `feature/tasks-v1-1-default-landing`    | D-1: default Tasks, `?tab=` addressing, e2e helper updates for the new default                                                                    | no        |
| T-2   | `feature/tasks-v1-1-management-today`   | D-2: scope selector, staff names, grouped Today, staff-privacy tests                                                                              | no        |
| T-3   | `feature/tasks-v1-1-notification-scope` | D-3: `tasks_notify` gate (+ TS mirror), vectors, pgTAP                                                                                            | yes       |
| T-4   | `feature/tasks-v1-1-opening-reminders`  | D-4: enum value, sweep RPC, snapshot wiring, pgTAP (time zones, DST, dedupe, replay)                                                              | yes (2)   |
| T-5   | `feature/tasks-v1-1-reminder-popup`     | D-5: shell popup, catch-up, CTA, multi-tab, demo-mode parity, browser tests                                                                       | no        |
| T-6   | `docs/tasks-v1-1-final-gate`            | Hosted DEV validation, full three-project run, review, report, roadmap/status; then development integration gate and release-readiness assessment | no        |

T-3 and T-4 touch the same function family; T-3 merges first and T-4 branches from it. Each phase ends with targeted tests, the phase regression, exact-head CI (local head = PR head = CI-tested SHA), a merge commit and a handoff update.

## 5. Rollout, migration, rollback

- Migrations are additive (enum value, one function replaced, one function added). DEV only; PROD is a separate approved release task.
- Rollback: redeploy the previous `tasks_notify` body and drop the sweep RPC; the extra enum value and any stored reminder rows are harmless. The client falls back to Tasks-only if the sweep RPC is missing because the call is best-effort and logged.
- The one user-visible behaviour change is the default landing page; it is announced in the report because many e2e specs assumed Table Allocation.

## 6. UI states and accessibility

Selector: labelled `<select>`, 44 px target, works at 390 px, announces scope change via the list heading. Empty states: "No tasks for this view." Loading and error reuse the Tasks shell. Popup: focus moves into the dialog, Escape = Dismiss, CTA is a button, copy reads without visual context, no motion beyond the existing dialog. Light/dark use existing tokens.

## 7. Unresolved / owner veto welcome

1. D-1 introduces `?tab=` (no URLs existed). 2. D-3 keeps `assigned`/`completed` notifications for Opening/Closing items; say so if only `checklist_available` should remain. 3. D-4 sends reminders to management only. 4. D-6 treats every Opening item as required.
