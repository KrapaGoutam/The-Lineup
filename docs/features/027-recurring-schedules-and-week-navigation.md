# Feature 027 — Recurring Schedules & Week Navigation

**Name:** Recurring Schedules & Week Navigation  
**Owner:** Krapa Goutam  
**Status:** complete  
**Issue/PR:** https://github.com/KrapaGoutam/The-Lineup/pull/26

## Classification & Session Scope

- **Category:** FEATURE UPGRADE
- **Modifies vs Adds:** Modifies `src/features/schedules/` (Features 002 and 008) to support recurring shift patterns across date ranges, previous/next week navigation, post-publish shift editing, and recurring shift parsing in bulk CSV imports. Relocates schedule management into Settings.
- **Contradiction Flags:** Post-publish editing of a shift must update the schedule without moving or altering tables on an actively running floor rotation.
- **Session Scope:** Own-session build.

## User Outcome

Managers can quickly build restaurant schedules by setting up recurring shifts (e.g., repeating every Tuesday and Thursday from September 1 through December 31). Managers can navigate forward and backward through weeks to view past or upcoming rosters. Shifts can be edited both in draft state and after a schedule is published. Bulk CSV imports can specify recurring days of the week.

## Scope

- **In:**
  - Week Navigation:
    - Previous and Next week controls with clear date range header (e.g., "Sep 7 – Sep 13, 2026").
    - "Today / Current Week" quick jump button.
  - Recurring Shift Rule:
    - Shift creation modal includes days-of-week checkboxes (Sunday through Saturday).
    - Start date and End date range picker.
    - Generates shift instances for each selected day in the range under a shared `recurrence_group_id`.
  - Post-Publish Shift Editing:
    - Managers can edit shift start/end times, assignees, or remove shifts even after the week schedule is published.
    - Unpublishes/updates cleanly with manager audit logging.
  - Bulk CSV Import Enhancement:
    - CSV format supports a `Days` column (e.g., `Mon,Wed,Fri`) and `EndDate` for creating recurring shifts in bulk.
  - Integration:
    - Schedule module is placed inside Settings (or accessed via direct secondary route).
- **Out:**
  - Automated algorithmic shift scheduling / auto-fill based on server availability.
  - Employee-to-employee shift trades (future feature).

## Acceptance Criteria

- [x] Given a manager in the Schedule view, clicking previous or next week navigates the schedule grid to the corresponding 7-day window. (New: `Previous week`/`Next week` buttons were already drawn but had no `onClick` at all — wired to a `stepWeek` helper backed by a client-triggered `getScheduleContextForWeekAction` in real mode and a pure client-side filter of the already-complete in-memory `shifts` set in demo mode. A "Today" quick-jump button appears only once browsed away from the initial week. Live-verified across a month boundary ("Aug 31–Sep 6").)
- [x] Given a manager creating a shift, selecting multiple days (e.g. Fri, Sat) with a date range generates the corresponding recurring shifts across those weeks. (New: day-of-week checkboxes + `expandRecurringDates` filtering `createShiftInstances`' existing date-range expansion. Requires an end date when any day is checked — refused, not silently defaulted to a single day.)
- [x] Given an already published schedule, a manager can edit an existing shift's timing or assigned staff member, and the change persists immediately. (New `updateShiftAction`/`deleteShiftAction` — RLS already permitted this write regardless of publish status (see Data & Authorization below), so the entire gap was application-layer: no action, no UI. `ShiftBlock` is now a button for a manager, opening a new edit dialog. Live-verified: editing a published shift's assignee and time updates the grid immediately with no separate unpublish step.)
- [x] Given an edited published shift, the audit log records the modification. (Both `updateShiftAction` and `deleteShiftAction` write an `audit_events` row via the existing `writeAuditEvent` helper from Feature 024 — `entity_type: "shift"`, before/after state — no new audit mechanism.)
- [x] Given a CSV import containing recurring day specifications (`Mon;Tue;Wed`), the parser generates the correct series of shifts across the specified date range. (New `days` column, reusing the CSV's existing `to_date` column as the recurring range's end rather than adding a redundant `end_date` — see the naming reconciliation below.)

## UX Contract

- **Entry point:** **Already satisfied, no work needed.** Feature 023
  already added a `QuickLinkCard` in `settings-page.tsx`
  (`id="settings-schedule"`, title "Schedule",
  `onClick={() => onGoToTab("schedule")}`) — the exact Settings entry
  point this spec asks for. Schedule stays its own primary nav tab (a
  deliberate Feature 021 decision); `src/app/schedule` is not a real
  Next.js route in this SPA-shaped app, so a literal direct URL
  `/schedule` was never buildable and isn't attempted.
- **Desktop:** 7-day schedule grid with week pager bar on top.
- **Mobile:** Horizontal scrollable calendar day strips or day-by-day accordion.

## Data & Authorization

- **Tables/columns:**
  - Adds `is_recurring BOOLEAN NOT NULL DEFAULT FALSE` to `shifts`.
  - **Correction, found reading the schema directly, not assumed:**
    `shifts.series_id uuid` already exists (added by an earlier,
    unrelated migration, `20260905125418_operational_modules.sql`) and
    was completely unused anywhere in application code — exactly the
    column this spec's `recurrence_group_id` describes. Reused as-is
    (kept its existing name) rather than adding a second,
    redundantly-named uuid column for the identical purpose.
- **Grants/RLS:** **Correction, found reading the migration directly,
  not assumed.** `schedule_periods`, `shifts`, and `shift_assignments`
  already each have a permissive `for all` policy for
  owner/general_manager/shift_manager with **no draft/published
  distinction at the RLS layer at all** — the "published" restriction
  only ever existed on the SELECT side (what a non-manager can see).
  This feature's post-publish editing acceptance criterion therefore
  required zero new RLS policy — only a new action and UI. All
  organization members retain read access to published shifts only,
  unchanged.
- **Concurrency:** Transaction-safe insertion when bulk-generating recurring shift dates.

## Implementation Map

- **Correction, file names verified against what's actually in the
  repo, not assumed** (`schedule-grid.tsx` and `shift-form-dialog.tsx`
  named below do not exist; the real component is
  `schedule-workspace.tsx`, which contains both the grid and the
  inline "Add shift" card):
- `src/features/schedules/components/schedule-workspace.tsx`: Week pager
  controls, the 7-day grid, day-of-week checkboxes + date range inputs
  in the "Add shift" card, and the clickable `ShiftBlock` that opens
  the edit dialog for a manager.
- `src/features/schedules/components/shift-edit-dialog.tsx`: Post-publish
  (and pre-publish) shift edit/delete dialog.
- `src/features/schedules/domain/recurring-shifts.ts`: Date generation
  math based on day-of-week masks.
- `src/features/schedules/actions/schedule-actions.ts`: Week-scoped
  read action plus post-publish `updateShiftAction`/`deleteShiftAction`.
- `src/features/schedules/domain/parse-schedule-csv.ts`: Recurring days
  CSV parsing.

## Test Plan

- Unit: Generating recurring shift dates across leap years, month boundaries, and daylight saving shifts; CSV parsing unit tests. (`recurring-shifts.test.ts`, `shift-planning.test.ts`, `parse-schedule-csv.test.ts`, `schedule-workspace.test.ts` — the last one a regression suite for a real, pre-existing week-header timezone bug found live-testing this feature, unrelated to recurrence itself.)
- E2E: Manager creates recurring shift, navigates weeks, edits post-publish, and verifies display. (`tests/e2e/recurring-schedules.spec.ts`, 6 tests, run across all three Playwright projects — also covers the "end date required" validation, delete's confirm gate, and confirming a server never gets the edit affordance.)
