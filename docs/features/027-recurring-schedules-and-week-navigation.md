# Feature 027 — Recurring Schedules & Week Navigation

**Name:** Recurring Schedules & Week Navigation  
**Owner:** Krapa Goutam  
**Status:** approved  
**Issue/PR:**

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

- [ ] Given a manager in the Schedule view, clicking previous or next week navigates the schedule grid to the corresponding 7-day window.
- [ ] Given a manager creating a shift, selecting multiple days (e.g. Fri, Sat) with a date range generates the corresponding recurring shifts across those weeks.
- [ ] Given an already published schedule, a manager can edit an existing shift's timing or assigned staff member, and the change persists immediately.
- [ ] Given an edited published shift, the audit log records the modification.
- [ ] Given a CSV import containing recurring day specifications (`Mon;Tue;Wed`), the parser generates the correct series of shifts across the specified date range.

## UX Contract

- **Entry point:** Settings > Schedule management card, or direct URL `/schedule`.
- **Desktop:** 7-day schedule grid with week pager bar on top.
- **Mobile:** Horizontal scrollable calendar day strips or day-by-day accordion.

## Data & Authorization

- **Tables/columns:**
  - Adds `recurrence_group_id UUID NULL` and `is_recurring BOOLEAN DEFAULT FALSE` to `shifts` table.
- **Grants/RLS:** Manager/owner write access; all organization members have read access to published shifts.
- **Concurrency:** Transaction-safe insertion when bulk-generating recurring shift dates.

## Implementation Map

- `src/features/schedules/components/schedule-grid.tsx`: Week pager controls and grid.
- `src/features/schedules/components/shift-form-dialog.tsx`: Days-of-week checkboxes and date range pickers.
- `src/features/schedules/domain/recurring-shifts.ts`: Date generation math based on day-of-week masks.
- `src/features/schedules/actions/schedule-actions.ts`: Post-publish update actions.
- `src/features/schedules/domain/parse-schedule-csv.ts`: Recurring days CSV parsing.

## Test Plan

- Unit: Generating recurring shift dates across leap years, month boundaries, and daylight saving shifts; CSV parsing unit tests.
- E2E: Manager creates recurring shift, navigates weeks, edits post-publish, and verifies display.
