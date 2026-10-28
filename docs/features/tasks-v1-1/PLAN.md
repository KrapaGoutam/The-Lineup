# Tasks V1.1 — Plan

**Status:** T-0 plan merged; T-1 COMPLETE; T-2 COMPLETE (PR #205, merge `46ea022`); T-3 COMPLETE (PR #207, merge `3a442a6`); T-4 COMPLETE (PR #209, merge `796cff3`); T-5 popup + catch-up UX (branch `feature/tasks-v1-1-reminder-popup`; see §3 D-5 _As built in T-5_); T-6 not started · **Owner decisions 1–4 LOCKED (2026-10-27)** — see §3 · **Issues:** #169 (management Today view), #154 (notification scope) · **Base:** `development` after Bar Inventory V1 and the next/zod security bump (PR #188) · **Companion:** `TEST_MATRIX.md` · **Handoff:** `tasks/current-task.md`
**Safety:** `main` and PROD untouched. Migrations go to DEV only. One branch and one PR per phase, merge commits only.
**Sequencing:** Tasks \_code\* (T-1 onward) starts only after Bar Inventory — Vendor Order Drafts V1 is complete (owner order, 2026-10-27). This plan is documentation only.

## 1. Outcome

1. The app opens on **Tasks → Today** for every role. An explicitly requested module stays put on refresh.
2. Owner / Manager / Assistant Manager can look at Today as **All Staff**, **My Tasks** or **one person**, and every row says who it belongs to.
3. The notification inbox carries **Opening and Closing operational work only** (#154). Task audit history is untouched.
4. If required Opening work is still open, **server-decided reminders** go out at open, +15 and +30 minutes in the location's time zone, once each per recipient, with a popup that never mutates task state. Management (Owner / Manager / Assistant Manager) is always eligible; staff are eligible **only for Opening work they are already authorized to work**, and only ever see their own work (D-4).

Non-goals: Closing reminder timing (none invented), reminder stages after +30, new roles, a scheduling platform, cron, push/SMS/email, any reminder that reveals coworker-only work or counts, a `required` flag on checklist items (future backlog), Tips V2.

## 2. Repository truth that shapes the plan

| Fact (verified 2026-10-27)                                                                                                                                                                    | Consequence                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The app is one client shell. `tab` is `useState<AppTab>("allocation")` in `restaurant-operations-app.tsx`; the only routes are `/` and `/r/[slug]`. There are **no module URLs**.             | "Deep links respected" and "refresh keeps the module" need a small, explicit mechanism (D-1).                                                                  |
| `isTasksManager(designation)` is true for every non-`staff` designation.                                                                                                                      | Reuse it; no new role flag.                                                                                                                                    |
| A manager's Tasks snapshot already contains every task (RLS `tasks_can_view`); staff only receive what RLS lets them read.                                                                    | The management filter is a view over data the viewer may already read. No new server surface (D-2).                                                            |
| `tasks_can_view`: managers, any non-`task` kind (Opening/Closing), `all_team`/`anyone`, or assignee. `tasks_can_work`: managers, `all_team`/`anyone`, or assignee. Both key off `auth.uid()`. | Staff _see_ every Opening item but may only _work_ their own. Reminder eligibility uses the **work** rule; the sweep needs a profile-parameterised copy (D-4). |
| `operating_hours(location_id, day_of_week, opening_local, closed)` with `locations.opening_local` as fallback; `locations.time_zone`.                                                         | The only business-hours source. No second system (D-4).                                                                                                        |
| `getTasksSnapshot` already calls idempotent, best-effort RPCs on every load (`checklist_generate_daily`, `task_notifications_sweep`, `task_recurrence_generate`).                             | Reminders follow the same "any member's load triggers an idempotent server sweep" pattern.                                                                     |
| `task_notifications` has `unique (recipient_profile_id, dedupe_key)` and `private.tasks_notify` inserts `on conflict do nothing`.                                                             | Dedup needs no new table: the key encodes location, service date and stage (D-4).                                                                              |
| There is no `required` flag on checklist items.                                                                                                                                               | "Required Opening tasks" = every non-cancelled item of today's Opening instances (D-6).                                                                        |
| `task_events` is append-only and carries `completed` / `reopened` with timestamps.                                                                                                            | State at a past instant is reconstructible, which catch-up needs (D-4).                                                                                        |

## 3. Decisions

**D-1 Landing and module addressing — Decision 1, APPROVED.** The app has no per-module URLs, so this adds the smallest mechanism that gives a default Tasks landing, refresh preservation and shareable module addressing. **No router rewrite, no new module routes, no middleware change, no redirects.**

| URL                            | Result                                                |
| ------------------------------ | ----------------------------------------------------- |
| `/`                            | Tasks → Today                                         |
| `/?tab=tasks`                  | Tasks                                                 |
| `/?tab=allocation`             | Table Allocation                                      |
| `/?tab=schedule`               | Schedule                                              |
| `/?tab=bar-inventory`          | Bar Inventory                                         |
| `/r/[slug]?tab=<module>`       | the same roster/location route, the requested module  |
| missing or invalid `tab`       | Tasks → Today                                         |
| a module the role may not open | Tasks → Today (for example `bar-inventory` for staff) |

Accepted values (kebab-case, URL-facing): `tasks`, `allocation`, `schedule`, `team`, `attendance`, `bar-inventory`, `tips`, `payroll`, `settings`. Internally `AppTab` keeps `barInventory`; a single map converts both ways. The initial `tab` state becomes `"tasks"`. The parameter is read once on mount, then mirrored with `history.pushState` (pathname preserved, so `/r/[slug]` stays `/r/[slug]`) on module change plus a `popstate` listener, so refresh keeps the module and back/forward behave. The Tasks section accepts an optional `&section=opening|closing|mine|…` for the reminder CTA. Mobile dock highlight follows `tab`, so a default launch highlights Tasks.

**D-2 Management Today scope.** Scope state `{ all | mine | person(id) }`, management only, default `all`. Staff never get the control and their snapshot cannot contain coworker tasks because RLS is the gate; the client is not trusted. Staff-name rule per row: `individual` → the assignee; `multiple` → names joined; `all_team` → "Whole team"; `anyone` → "Anyone". Nothing is invented; "Completed by" stays a separate fact. The person scope matches **named assignees only**; shared work is not attributed to a person. Layout follows the issue: Opening · General · Closing groups for the service date, overdue first. Selector is a native `<select>` (keyboard and phone friendly).

**D-3 Notification narrowing (#154) — Decision 2, APPROVED.** Ordinary `kind = 'task'` work stops producing inbox noise; useful Opening/Closing operational notifications stay. One gate inside `private.tasks_notify`: a notification is stored only when its source is operational (`checklist_available`, `opening_reminder`, or a task whose `kind` is `opening`/`closing`). Everything for `kind = 'task'` is suppressed. **Do not confuse** the user-facing notification inbox (narrowed here) with task audit/event history (`task_events`, untouched).

| Type                    | Normal task                                                                 | Opening / Closing |
| ----------------------- | --------------------------------------------------------------------------- | ----------------- |
| `assigned`/`reassigned` | suppressed                                                                  | kept (as today)   |
| `completed` (for you)   | suppressed                                                                  | kept (as today)   |
| `due_soon`/`overdue`    | suppressed (sweep targets only `kind='task'`, so the sweep becomes a no-op) | n/a               |
| `checklist_available`   | n/a                                                                         | kept              |
| `opening_reminder`      | n/a                                                                         | new (T-4)         |

`task_events` and `tasks_emit` are not touched, so audit history is unchanged. Existing stored notifications are not deleted. The TypeScript demo engine mirrors the gate so demo mode and DB agree (shared vectors).

**D-4 Opening reminders (server-authoritative) — recipients per Decision 3.**

- New RPC `task_opening_reminders_sweep(p_organization_id, p_location_id)`, called from `getTasksSnapshot` after `checklist_generate_daily`. Caller must be an active member (`tasks_begin`); recipients are computed on the server, never supplied. No cron: the sweep is idempotent, multi-tab safe and catch-up capable like the existing due-soon sweep; if T-4 finds it is not, that is raised before building anything else.
- `service_date` = today in `locations.time_zone`. Opening instant = `(service_date + opening_local) AT TIME ZONE time_zone`, where `opening_local` comes from `operating_hours` for that weekday, else `locations.opening_local`. A `closed` day emits nothing. Stage instants are `opening + 0 / 15 / 30 minutes` as absolute instants, so DST cannot shift the +15/+30 gap.
- Stages `OPEN`, `OPEN_PLUS_15`, `OPEN_PLUS_30`. **No stage exists after +30.**
- A stage is emitted for a recipient only if (a) its instant has passed, (b) at that instant at least one **required item in that recipient's scope** was incomplete (reconstructed from `task_events`, not from current status), (c) at least one such item is incomplete **now**, and (d) it has not been emitted for that recipient. This gives: completed before +15 → no +15/+30; reopened at T+20 → +15 stays skipped (it was complete at its instant) and +30 may emit; app closed until T+40 → every missed stage that was truly incomplete is persisted once (catch-up). The current status is never used to back-fill a stage that was complete at its own instant.
- **Required item** = every non-cancelled Opening item of the service date (D-6). Cancelled items never count as incomplete.
- **Recipients and scope (Decision 3; the earlier management-only proposal is rejected):**
  - _Management_ — active Owner / Manager / Assistant Manager (`owner`, `general_manager`, `shift_manager`). Scope = every required Opening item at the location.
  - _Staff_ — an active staff member is a recipient **only if** they are already authorized to work at least one incomplete required Opening item (assignee, or `all_team`/`anyone`; the `tasks_can_work` rule). Scope = only those items. Their reminder body and count are computed from that scope; coworker-only items, counts and details never appear. A staff member with no such item gets nothing, even when management does.
  - Eligibility is decided inside the sweep by a profile-parameterised helper (the existing `tasks_can_work` keys off `auth.uid()`, which is the caller, not the recipient) and goes through the same location-access seam `tasks_can_access_location`. Privacy is enforced in the data written, not by hiding UI: a staff recipient's stored notification contains nothing about work outside their scope. Assignments are read as of the moment the stage is emitted.
- Dedup key: `opening_reminder:<location_id>:<service_date>:<STAGE>` per recipient, enforced by the existing unique index. Repeated RPCs, reloads, two tabs, reconnects and retries are no-ops.
- New enum value `opening_reminder` (its own migration; PostgreSQL cannot use an added enum value in the same transaction). Body carries the recipient's own incomplete count at the stage instant.
- Safety: `security definer`, `set search_path = ''`, membership checked through `private.tasks_begin`, org/location validated, no client-supplied profile ids.
- Client wake-up: the controller's existing 30 s clock refreshes the snapshot when `now` crosses a stage instant (the snapshot exposes `openingAt`). This is only a wake-up; the server still decides. **Moved to T-5** (UI): T-4 ships the engine and the `OPENING_REMINDER_OFFSET_MINUTES` contract only.
- **As built in T-4 (amendments):** stage ids are lowercase `open`, `plus_15`, `plus_30` (the dedupe key and `payload.stage` use them; `OPEN`/`OPEN_PLUS_*` above are the same stages); the key is `opening_reminder:<location_id>:<service_date>:<stage>`; the reminder carries a machine-readable `payload` (`stage`, `service_date`, `location_id`, `stage_at`, `incomplete_count` at the stage instant, `incomplete_now`) in a new `task_notifications.payload` column and **no** `task_id` / `checklist_instance_id` (the gate rejects any); an advisory transaction lock per location serialises overlapping sweeps; the evaluator is `private.tasks_opening_reminders_run(org, loc, now)` with an injected clock and the public RPC passes `clock_timestamp()`. The late-evaluation rule is unchanged: a truly missed stage is stored once on catch-up, a stage complete at its own instant is never back-filled.

**D-5 Popup and catch-up.** `OpeningReminderPrompt` mounted in the app shell (visible on any module), built on `components/ui/dialog.tsx`, never `alert()`. It shows the **newest unread** `opening_reminder` for today's service date; older stages stay in the notification history. **View Opening Tasks** marks the stage notifications read and navigates to Tasks → Opening. **Dismiss** only marks them read (`task_notifications_mark_read`), so a second tab drops the popup on its next refresh/focus and no task state changes. Copy per the owner brief (T+0 "Opening tasks are not complete", T+15 "still incomplete", T+30 "overdue").

- **As built in T-5 (amendments; T-4 database semantics are unchanged, no migration):**
  - **History vs popup (the locked decision).** T-4 may legitimately keep several catch-up rows (a first look at 09:34 on still-open work stores `open`, `plus_15` and `plus_30`). That is notification history and is never deleted, collapsed or rewritten. The popup is a presentation decision: **it shows only the newest still-actionable unread reminder (`plus_30` > `plus_15` > `open`), one dialog, never three in a row.** Older rows stay in the inbox and stay unread.
  - **Selection** is the pure `selectOpeningReminderPopup` (`domain/opening-reminder-popup.ts`): own `opening_reminder` rows, today's service date and this location only, nothing when no Opening work is incomplete now, unread only, highest stage by the payload's stage id (never title text). A stage at or below one the person already acknowledged is _superseded_: it stays unread but never pops, otherwise dismissing `plus_30` would surface `plus_15` on the next refresh. A later, higher stage still pops. This replaces the earlier wording "marks the stage notifications read": Dismiss and the CTA acknowledge **only the shown notification** and never silently mutate older rows.
  - **Actionability** is read from live Tasks data, not from the stored payload: the server counts today's incomplete Opening items inside the caller's own work scope (management: all; staff: only what they may work) and returns that number only. Completed or cancelled work after the reminder was stored means no popup; the row is untouched.
  - **Acknowledge** reuses `task_notifications_mark_read` (thin action `acknowledgeOpeningReminderAction`, ids only, own rows only). Dismiss, the close button, Escape and the backdrop are the same acknowledgement. The CTA acknowledges, then navigates (see below). No second persistence model; reload, another tab and reconnect converge on the database read state.
  - **Wake-up** (client; no timing logic): mount (sign-in / first authenticated load), tab visible, window focus, back online, and a 60 s heartbeat while visible, all through one gate (5 s minimum spacing, one request in flight; monotonic clock). Each wake calls `getOpeningReminderPromptAction({ restaurantSlug })` which runs `checklist_generate_daily`, then `task_opening_reminders_sweep(org, loc)` (tenant only: the browser never names a stage, recipient or time) and reads back the caller's own reminders. A failed wake keeps the last state, logs, and retries on the next trigger.
  - **Copy:** management "Opening Tasks Are Ready / Need Attention" with the live item count; staff "Opening Task Reminder" with no number and no names. Stage badge text (Opening / Still open / Needs attention) plus accent / warning / danger tone; no elapsed-time claim.
  - **CTA** _View Opening Tasks_ (staff: _View My Opening Tasks_) acknowledges, remounts Tasks on **Today** and sets `tab` through the T-1 helper, so `/` stays `/` and `/r/<slug>?…` keeps its path and other parameters. No `section` parameter and no new route. Mounted in the app shell so it reaches the person on any module; signing out unmounts it and drops its state.
  - **Demo mode** has a demo twin of the sweep (`domain/opening-reminder-engine.ts`: same stages, same judged-at-the-stage-instant rule, same per-recipient scope and dedupe key, demo location opens 09:00) so Playwright exercises the real popup path. It is **opt-in with `?demoReminders=1`** so the ordinary demo and every unrelated demo test are not interrupted by a modal that depends on the time of day. Production code consumes only server results.

**D-6 "Required" Opening work — Decision 4, APPROVED.** Every non-cancelled Opening checklist item is required for completion and reminder evaluation; cancelled items never count as incomplete. No `required`/`optional` schema flag is added in V1.1. Required/optional checklist items is recorded in `tasks/backlog.md` as future work.

## 4. Phases

| Phase | Branch (from latest `development`)      | Scope                                                                                                                                                                                            | Migration |
| ----- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| T-0   | `docs/tasks-v1-1-plan`                  | This plan, `TEST_MATRIX.md`, handoff, roadmap/status                                                                                                                                             | no        |
| T-1   | `feature/tasks-v1-1-default-landing`    | D-1: default Tasks, `?tab=` addressing, e2e helper updates for the new default **(COMPLETE)**                                                                                                    | no        |
| T-2   | `feature/tasks-v1-1-management-today`   | D-2: scope selector, staff names, grouped Today, staff-privacy tests **(COMPLETE; branch name as run)**                                                                                          | no        |
| T-3   | `feature/tasks-v1-1-notification-scope` | D-3: `tasks_notify` gate (+ TS mirror), vectors, pgTAP **(COMPLETE; migration `20261028090000`)**                                                                                                | yes       |
| T-4   | `feature/tasks-v1-1-opening-reminders`  | D-4: enum value, sweep RPC, snapshot wiring, pgTAP (time zones, DST, dedupe, replay) **(COMPLETE; PR #209, merge `796cff3`; branch name as run; migrations `20261028100000`, `20261028100100`)** | yes (2)   |
| T-5   | `feature/tasks-v1-1-reminder-popup`     | D-5: shell popup, catch-up (newest actionable only), CTA, dismiss, client wake-up, multi-tab, demo-mode parity, browser tests **(branch name as run; no migration)**                             | no        |
| T-6   | `docs/tasks-v1-1-final-gate`            | Hosted DEV validation, full three-project run, review, report, roadmap/status; then development integration gate and release-readiness assessment                                                | no        |

T-3 and T-4 touch the same function family; T-3 merges first and T-4 branches from it. Each phase ends with targeted tests, the phase regression, exact-head CI (local head = PR head = CI-tested SHA), a merge commit and a handoff update.

## 5. Rollout, migration, rollback

- Migrations are additive (enum value, one function replaced, one function added). DEV only; PROD is a separate approved release task.
- Rollback: redeploy the previous `tasks_notify` body and drop the sweep RPC; the extra enum value and any stored reminder rows are harmless. The client falls back to Tasks-only if the sweep RPC is missing because the call is best-effort and logged.
- The one user-visible behaviour change is the default landing page; it is announced in the report because many e2e specs assumed Table Allocation.

## 6. UI states and accessibility

Selector: labelled `<select>`, 44 px target, works at 390 px, announces scope change via the list heading. Empty states: "No tasks for this view." Loading and error reuse the Tasks shell. Popup: focus moves into the dialog, Escape = Dismiss, CTA is a button, copy reads without visual context, no motion beyond the existing dialog. Light/dark use existing tokens.

## 7. Unresolved questions and decisions

None. The four decisions (D-1 `?tab=`, D-3 keep Opening/Closing operational notifications, D-4 management plus authorized staff, D-6 every non-cancelled Opening item is required) are locked by the owner. Future, not V1.1: a `required`/`optional` checklist flag; revisiting staff eligibility if Part 2 location access narrows `tasks_can_access_location`.
