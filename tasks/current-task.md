# Current Task: Feature 027 — Recurring Schedules & Week Navigation

**Active Spec:** `docs/features/027-recurring-schedules-and-week-navigation.md`
**Branch:** `feature/027-recurring-schedules-and-week-navigation` (stacked
on `feature/025-attendance-reporting-and-filters`)
**Status:** In progress
**Assigned Agent:** Claude Code (explicit implementer, per user request)

## 🎯 Objective

Upgrade `src/features/schedules/` (Features 002/008) with real week
navigation (today's Prev/Next buttons are inert), day-of-week recurring
shift generation, the ability to edit or delete a shift at all (there is
currently no edit/delete action anywhere, published or not), and CSV
`days` support for recurring bulk import.

## 📖 Investigation findings (read every relevant file in full first)

**Already true, no work needed — "relocate schedule management into
Settings":** Feature 023 already added a `QuickLinkCard` in
`settings-page.tsx` (`id="settings-schedule"`, title "Schedule",
`onClick={() => onGoToTab("schedule")}`) — the exact "Settings entry
point" the spec asks for. Schedule itself stays its own primary nav tab
(a deliberate Feature 021 decision, see that component's own comment) —
`src/app/schedule` is not a real Next.js route in this SPA-shaped app, so
"direct URL `/schedule`" isn't literally buildable and isn't attempted;
the quick-link is the real entry point already built. Nothing to do
here.

**Implementation Map file names, corrected against what's actually
there** (same class of correction as Features 024/025/028): the spec
names `schedule-grid.tsx` and `shift-form-dialog.tsx` — neither exists.
The real component is `schedule-workspace.tsx` (both the grid and the
inline "Add shift" card live there, `ShiftEditor`/`ScheduleWorkspace`).
`recurring-shifts.ts`, `schedule-actions.ts`, and `parse-schedule-csv.ts`
are named correctly and match real files.

**Real gaps — read the actual code, not assumed:**

1. **Week navigation doesn't exist.** The Prev/Next week buttons are
   already drawn in `schedule-workspace.tsx` (lines ~448-453) but have
   no `onClick` at all. `weekDates`/`monthDates` are a frozen
   `useState` in `restaurant-operations-app.tsx`
   (`const [weekDates] = useState(...)`, no setter ever called) sourced
   from `getScheduleContext`'s hardcoded "today" window. No "Today"
   button exists either.
2. **There is no shift edit or delete action at all**, in either
   direction, published or draft. `schedule-actions.ts` has exactly
   three exports: `addShiftAction`, `publishScheduleAction`,
   `saveScheduleConfigAction`. `ShiftBlock` is a plain, non-interactive
   `<div>`. The spec frames this as "post-publish editing" (implying
   pre-publish editing already exists) — it doesn't; this is "any shift
   editing," a bigger gap than the spec's own framing suggests.
3. **Confirmed non-issue, not something to build**: the spec's own
   contradiction flag says editing a published shift "must not move or
   reassign tables on an actively running floor rotation." Read the
   schema directly — `shifts` has zero foreign keys to
   `rotation_members`/`table_rotation_entries`/`service_sessions`, and
   vice versa. Scheduling and the live floor board (Features 003/011/028)
   are structurally independent data models; editing a shift cannot
   possibly touch the rotation board's tables. No guard code needed —
   documented here so this isn't silently dropped, but confirmed by
   reading the schema, not assumed.
4. **RLS already permits the write side of #2 — confirmed by reading
   the migration, not assumed.** `schedule_periods`, `shifts`, and
   `shift_assignments` already each have a permissive `for all` policy
   (`<table>_write_manager`, `20260905065702_initial_schema.sql`) for
   owner/general_manager/shift_manager, with **no draft/published
   distinction at the RLS layer at all** — the "published" restriction
   only ever existed for the SELECT side (what a non-manager can see).
   The entire gap is application-layer: no action, no UI. This feature
   adds zero new RLS policies for editing/deleting a shift.
5. **`createShiftInstances` only expands a plain consecutive date
   range** (`expandDateRange`, every day from `fromDate` to `toDate`)
   for one shift kind — no day-of-week mask. The spec's day-of-week
   recurrence is genuinely new domain logic.
6. **CSV `end_date` reconciliation**: the CSV already has a `to_date`
   column that does exactly what a spec'd `end_date` column would (the
   range's last day) — adding a second, redundantly-named column would
   let a file disagree with itself. `days` is added as the one new
   column; `to_date` is reused as the recurring range's end, not
   duplicated.
7. **DST is already handled, one layer down — confirmed by reading
   `zonedWallTimeToInstant`'s own doc comment**, not reinvented. Once a
   recurring shift's calendar dates are generated (pure date-only
   math, no timezone involved), each instance's `service_date` +
   `startLocal` + the location's timeZone already goes through
   `zonedWallTimeToInstant` in `addShiftAction`, which has its own
   extensively-documented ambiguous/nonexistent-wall-time handling
   around a transition. The new date-generation math needs no
   DST-awareness of its own; only a regression test confirming a
   DST-transition date is correctly included/excluded by the
   weekday-mask filter is new here.
8. **`shifts.series_id uuid` already exists and is completely unused —
   found while writing Step 2's migration, not assumed from the spec.**
   Added by `20260905125418_operational_modules.sql`, this is exactly
   the column the spec's `recurrence_group_id` describes. Grepped the
   whole codebase: it appears nowhere outside `database.generated.ts`.
   Reused as-is (kept its existing name, not renamed — renaming an
   existing column is strictly riskier than leaving it, for zero
   behavioral gain) rather than adding a second, redundantly-named uuid
   column for the identical purpose. Only `is_recurring boolean` is
   genuinely new.
9. **Demo mode's `shifts` state is already the complete, unbounded set**
   for the whole session (`initialScheduleContext` is `null` in demo
   mode, so `shifts` starts at `[]` and only ever grows via manual
   adds/CSV commits — no date-range query ever limits it the way real
   mode's `getScheduleContext` does). Week navigation in demo mode is
   therefore a pure client-side filter of already-loaded data, no fetch
   — unlike real mode, which only ever loaded the initial week+month
   union and needs a new client-triggered action for any other week
   (the same `AttendanceReport`/`AllocationWorkspace` pattern this
   session already built twice).

## 🔒 Non-negotiable constraints

- Editing/deleting a shift never touches `rotation_members`,
  `table_rotation_entries`, `service_sessions`, or any other floor/board
  table — confirmed structurally impossible above, reconfirmed by never
  importing from `src/features/allocation/` anywhere in this feature's
  diff.
- Every shift update/delete writes an `audit_events` row (reusing
  `src/features/team/data/audit-log.ts`'s `writeAuditEvent`, the
  existing generic mechanism — no new audit table).
- Recurring generation stays capped by `expandDateRange`'s existing
  62-day range limit (unchanged, inherited for free).
- CSV `days` is additive and optional — a file with no `days` column
  keeps behaving exactly as today (every consecutive day in the range).
- No RLS changes for shifts/schedule_periods/shift_assignments writes
  (already correct, see Investigation #4). The only migration is the two
  new `shifts` columns.

## 🛠️ Implementation Steps

- [x] **Step 1: This task file** — populate and commit before any app
      code.
- [x] **Step 2: Migration — reuse `series_id`, add `is_recurring`**
  - [x] New migration: `alter table public.shifts add column
is_recurring boolean not null default false;` — `series_id uuid`
        already exists (Investigation #8), reused as the recurrence
        group id rather than adding a redundant new column.
  - [x] New pgTAP test (`0017_shifts_recurrence.test.sql`, 8
        assertions): `is_recurring` exists with the right type/default/
        not-null; `series_id` confirmed still uuid and still nullable;
        an owner can insert three shifts sharing one `series_id` in a
        single multi-row insert (proves the "transaction-safe bulk
        insertion" requirement is already true — one multi-row
        `insert()` is atomic by Postgres's own construction, no new RPC
        needed); a plain server is still rejected by RLS on insert
        (regression-confirms Investigation #4's manager-only write
        policy is genuinely unchanged by this migration, not just
        assumed).
  - [x] `src/lib/demo-data.ts`: `DemoShift` gains `seriesId?: string`
        and `isRecurring?: boolean` (optional, backward compatible with
        every existing literal; named `seriesId` in TypeScript to match
        the real DB/generated-types column name, not a renamed concept).
  - [x] `npm run db:reset && npm run db:test` — clean reset (Docker
        Desktop had stopped between sessions; started it, waited for the
        db container's own health check, then reset cleanly), 17/17
        pgTAP files, **210/210 assertions** (up from 202). Full gate:
        `npm run check`, `npm test` (214/214, unchanged — no TS-level
        tests in this step), `npm run build` all pass.
  - [x] Commit.
- [x] **Step 3: Domain — recurring date generation**
  - [x] New `domain/recurring-shifts.ts`: `WEEKDAY_TOKENS` (Sun-first,
        matching `Date.getUTCDay()`'s own 0=Sun convention — deliberately
        NOT the grid's Mon-first display order, matching the spec's own
        "Sunday through Saturday" checkbox wording), `parseWeekdayToken`,
        `parseWeekdayList` (splits on `;`/`,`, case-insensitive, throws
        with a row-usable message on an unknown token), and
        `expandRecurringDates({ fromDate, toDate, daysOfWeek })` —
        reuses `expandDateRange` from `shift-planning.ts` (not
        reimplemented) and filters to the given weekdays.
  - [x] `domain/shift-planning.ts`: `createShiftInstances` gained an
        optional `dates?: string[]` override — when present, used
        instead of internally calling `expandDateRange(fromDate,
toDate)`, every other validation/time-resolution rule unchanged.
        Backward compatible (every existing caller omits it). New
        exported `addDays(date, delta)` (generalizes the existing
        private `nextDate`, now implemented in terms of it), to be
        reused by the week navigator in Step 5.
  - [x] `domain/recurring-shifts.test.ts` (new, 17 tests): weekday
        parsing (valid tokens, case-insensitivity, unknown-token error,
        `;`/`,`/mixed all accepted, dedup+sort); date expansion across a
        month boundary, a leap year (Feb 29 2028), a real DST
        spring-forward (America/Chicago 2026-03-08) and fall-back
        (2026-11-01), multiple selected weekdays in one call, an empty
        result, and confirmation the existing 62-day cap still applies
        (delegated, not bypassed) — every expected date/weekday pair
        independently computed via a real `Date` in Node before being
        written into the test, not asserted from memory.
  - [x] `domain/shift-planning.test.ts`: new cases for the `dates`
        override (including that custom-time validation still runs) and
        for `addDays` (positive/negative/month/year boundaries).
  - [x] Full gate: `npm run check`, `npm test` (**238/238**, up from
        214, 33/33 files), `npm run build` all pass.
  - [x] Commit.
- [ ] **Step 4: CSV `days` column**
  - [ ] `domain/parse-schedule-csv.ts`: `CsvRowInput` gains `days: string`
        (optional column — absent header means every row's `days` reads
        `""`). When non-empty, `parseWeekdayList` resolves it and the
        row's instances come from `createShiftInstances({ ...,
dates: expandRecurringDates(...) })` instead of the plain
        `fromDate`/`toDate` expansion; an empty resulting date list (the
        range matches none of the selected weekdays) is a row error, not
        a silent zero-shift success. `CSV_TEMPLATE` gains the column
        (with an example recurring row) and header validation stays
        permissive (an optional column, not required).
  - [ ] `domain/parse-schedule-csv.test.ts`: recurring rows (`Mon;Wed;Fri`
        and `Mon,Wed,Fri` both accepted), an unknown day token, a range
        matching no selected weekday, and a non-recurring row (no
        `days`) still behaving exactly as before.
  - [ ] `components/csv-import-panel.tsx`: `commit()` tags each
        recurring row's resulting `DemoShift`s with one freshly
        generated `seriesId` (`crypto.randomUUID()`) and
        `isRecurring: true`; non-recurring rows unchanged
        (`isRecurring: false`, no series id). Dates column in the
        preview table shows the resolved day count for a recurring row,
        not just the raw from/to text.
  - [ ] Full gate.
  - [ ] Commit.
- [ ] **Step 5: Week navigation**
  - [ ] `data/schedule-data.ts`: extract the shared shift-row-mapping
        logic (the `shiftRows -> DemoShift[]` block) into its own
        exported function so the new week action and the existing
        Server Component load call the identical mapping — one place,
        not two copies that could drift (matches this session's
        established DRY precedent, e.g. Feature 025's `resolvePeriodRange`
        refactor).
  - [ ] `actions/schedule-actions.ts`: new
        `getScheduleContextForWeekAction({ restaurantSlug,
weekStartDate })` — client-triggered, re-derives the caller's own
        organization/location server-side (never trusts a client-supplied
        id, matching every other Feature 025/028 navigator action this
        session built), returns that week's `weekDates` + shifts.
  - [ ] `components/schedule-workspace.tsx`: new props
        (`restaurantSlug`, `organizationId`, `demoMode`). New
        `viewWeekStart` state (defaults to the initial week's Monday).
        Prev/Next wired to `addDays(±7)`; "Today" resets to the initial
        week. Demo mode: pure client-side filter of the full `shifts`
        prop by the viewed week's dates, no fetch. Real mode, viewing the
        initial week: unchanged (`weekDates`/`shifts` props, already
        reactive via `revalidatePath`). Real mode, browsing elsewhere: a
        local fetch via the new action, with loading/error states
        matching this app's established pattern; a `weekReloadKey`
        re-triggers that fetch after a same-week add/edit/delete so a
        mutation while browsing a non-today week doesn't go stale.
  - [ ] `restaurant-operations-app.tsx`: thread the three new props
        through to `ScheduleWorkspace`.
  - [ ] Live Playwright smoke test: Prev/Next move the header date range
        and the grid; Today returns to the original week; a manager can
        add a shift while viewing a browsed (non-today) week and see it
        appear without navigating back.
  - [ ] Full gate.
  - [ ] Commit.
- [ ] **Step 6: Recurring shift creation UI**
  - [ ] `components/schedule-workspace.tsx`'s `ShiftEditor`: adds a
        "Repeat on" row of 7 checkboxes (Sun..Sat, per
        `WEEKDAY_TOKENS`). None checked: unchanged existing behavior
        (single continuous range, `toDate` optional). Any checked:
        `toDate` becomes required (client-side validation, a clear inline
        error otherwise) and submission calls
        `expandRecurringDates`/`createShiftInstances({ dates })`
        instead of the plain range. One `seriesId` generated per
        submission, tagged onto every resulting `DemoShift`
        (`isRecurring: true`).
  - [ ] `actions/schedule-actions.ts`: `addShiftAction` writes
        `series_id`/`is_recurring` from the submitted shifts (both
        already optional on `DemoShift`, `null`/`false` when absent —
        no behavior change for non-recurring submissions).
  - [ ] Live Playwright smoke test: create a Tue/Thu recurring shift
        across a real multi-week range, confirm every generated
        instance lands on the right weekday, in the right count, and
        that a plain single-day add (no days checked) is unaffected.
  - [ ] Full gate.
  - [ ] Commit.
- [ ] **Step 7: Post-publish (and pre-publish) shift editing**
  - [ ] `actions/schedule-actions.ts`: new `updateShiftAction` (assignee,
        shift kind label, start/end time, note — deliberately NOT the
        service date itself, out of the spec's literal scope; moving a
        shift to a different day is delete + recreate) and
        `deleteShiftAction`. Both re-derive the actor via
        `getCurrentUser`, both write an `audit_events` row via
        `writeAuditEvent` (`entity_type: "shift"`,
        `action: "update_shift"`/`"delete_shift"`, before/after state),
        both work identically regardless of the shift's
        `schedule_periods.status` (Investigation #4 — no new gate to add,
        RLS already allows it). Return `ActionResult<null>` — the caller
        already holds every field it just submitted and applies the
        edit optimistically itself (the same pattern `addShiftAction`'s
        own caller already uses), rather than round-tripping a refetch.
  - [ ] New `components/shift-edit-dialog.tsx`: person/kind/start/end/note
        fields pre-filled from the clicked shift, "Save," and a two-step
        "Delete shift" → "Confirm delete" control (matching this app's
        established destructive-action pattern, e.g. team's dialogs).
  - [ ] `schedule-workspace.tsx`: `ShiftBlock` becomes a button for a
        manager (unchanged, read-only for a server), opening the new
        dialog.
  - [ ] `restaurant-operations-app.tsx`: new `updateShift`/`deleteShift`
        handlers (demo + real dual branch, mirroring `addShifts`), each
        patching both the parent's own `shifts` state and (when
        applicable) `ScheduleWorkspace`'s locally-fetched browsed-week
        state so an edit/delete is visible immediately regardless of
        which week is on screen.
  - [ ] Live Playwright smoke test: publish a week, edit an already-published
        shift's time and assignee, confirm the change renders immediately
        with no separate "unpublish" step; delete a shift and confirm it
        disappears; confirm a server never sees the edit affordance at
        all.
  - [ ] **Decision, stated not assumed**: no dedicated fake-Supabase-builder
        unit test for `updateShiftAction`/`deleteShiftAction`
        (`publishScheduleAction`'s own test file exists specifically
        because its version-numbering arithmetic is subtle and bug-prone
        — these two actions are comparatively mechanical field writes);
        covered instead by live testing, the e2e suite (Step 8), and
        pgTAP's RLS confirmation (Step 2).
  - [ ] Full gate.
  - [ ] Commit.
- [ ] **Step 8: E2E** (`tests/e2e/recurring-schedules.spec.ts`, new file)
  - [ ] Week navigation: Prev/Next/Today.
  - [ ] Creating a recurring shift across multiple days generates the
        right instances.
  - [ ] Editing a shift after publishing persists and is visible
        immediately; a server never sees the edit control.
  - [ ] Run across all three Playwright projects.
  - [ ] Full gate.
  - [ ] Commit.
- [ ] **Step 9: Docs**
  - [ ] `docs/features/027-recurring-schedules-and-week-navigation.md`:
        correct the Implementation Map file names, note the
        already-satisfied Settings entry point, note the `end_date`→
        `to_date` naming reconciliation, check off every acceptance
        criterion with a note on what was found already-true vs. newly
        built.
  - [ ] Update `docs/STATUS.md` Feature Matrix + Health Gate line.
  - [ ] Commit.
- [ ] **Step 10: Final gate, push, open PR (base:
      `feature/025-attendance-reporting-and-filters`), paste real gate
      output + PR link here.**

## 🗂️ File list

- `tasks/current-task.md` (this file)
- `supabase/migrations/<ts>_shifts_recurrence.sql` (new)
- `supabase/tests/database/00XX_shifts_recurrence.test.sql` (new)
- `src/lib/demo-data.ts` (`DemoShift` fields)
- `src/features/schedules/domain/recurring-shifts.ts` (new)
- `src/features/schedules/domain/recurring-shifts.test.ts` (new)
- `src/features/schedules/domain/shift-planning.ts` (`dates` override,
  `addDays`)
- `src/features/schedules/domain/shift-planning.test.ts`
- `src/features/schedules/domain/parse-schedule-csv.ts` (`days` column)
- `src/features/schedules/domain/parse-schedule-csv.test.ts`
- `src/features/schedules/components/csv-import-panel.tsx` (recurrence
  tagging)
- `src/features/schedules/data/schedule-data.ts` (shared row mapping,
  week-scoped read)
- `src/features/schedules/actions/schedule-actions.ts`
  (`getScheduleContextForWeekAction`, `updateShiftAction`,
  `deleteShiftAction`, `addShiftAction` recurrence columns)
- `src/features/schedules/components/schedule-workspace.tsx` (week nav,
  recurring checkboxes, clickable `ShiftBlock`)
- `src/features/schedules/components/shift-edit-dialog.tsx` (new)
- `src/components/restaurant-operations-app.tsx` (new props/handlers)
- `tests/e2e/recurring-schedules.spec.ts` (new)
- `docs/features/027-recurring-schedules-and-week-navigation.md`
- `docs/STATUS.md`

## Current State & Next Step

Steps 1-3 done and committed. Next: Step 4 (CSV `days` column support).
