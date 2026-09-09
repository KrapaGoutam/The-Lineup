# Feature 025 — Attendance Reporting & Filters

**Name:** Attendance Reporting & Filters  
**Owner:** Krapa Goutam  
**Status:** approved  
**Issue/PR:**

## Classification & Session Scope

- **Category:** FEATURE UPGRADE
- **Modifies vs Adds:** Modifies `src/features/attendance/` components (from Features 018 and 019) to add month/year navigation, calendar day computation, print stylesheets, multi-select export, and single-user summary cards.
- **Contradiction Flags:** The mockup displays "Name (Designation)" (e.g. "Anil (Server)" and "Anil (Host)"). This is strictly for visual presentation and disambiguation. **All records and filters key strictly on the manual `attendance_identity_links` UUID pairings from Feature 019 — never on name strings.**
- **Session Scope:** Own-session build.

## User Outcome

Managers and servers get an enhanced view of raw clock-in attendance records. Users can navigate across months (e.g. "September / 2026") with a dedicated month/year picker, view calendar-computed weekdays (Mon, Tue, etc.) alongside dates, review single-user summary metrics (`Days Worked`, `Total Hours`, `Avg per Day`), and print records for one, selected, or all employees with clean print formatting.

## Scope

- **In:**
  - Month and year navigation header styled per reference Section 2e ("September / 2026 / Print").
  - Dynamically computed Day column (e.g. "Wed", "Sun") calculated from the shift date using the restaurant's local timezone (`America/Chicago`).
  - Single-user summary dashboard view:
    - 3 top stat cards: `Days Worked` (count), `Total Hours` (sum in hours with 1 decimal place), and `Avg per Day` (mean hours per worked day).
    - Daily shift detail table with start/end times, auto-closed status (amber), and open shift warning (red).
  - Multi-select print support:
    - Print trigger offering "Print current employee", "Print selected employees", or "Print all employees".
    - Dedicated print CSS (`@media print`) rendering clean tabular reports without navigation bars or buttons.
  - Mobile representation (Section 2f): touch-friendly employee dropdown, month pager, compact stat cards, and scrollable card ledger.
- **Out:**
  - Bulk CSV import for attendance logs (scoped out).
  - Modifying raw clock-in timestamps automatically (all edits are manual audit records).
  - Deriving or modifying payroll amounts inside the attendance tab.

## Acceptance Criteria

- [x] Given the attendance screen, the user can select any month and year (Jan–Dec, 2024–present), and the ledger updates to show shifts within that month. (New: `attendance-month-nav.tsx` — prev/next steppers plus month/year `<select>`s, clamped at January 2024 and the restaurant's real current month. `resolvePeriodRange`'s new `"month"` variant does the actual date-range resolution, shared with `this-month`/`previous-month` via one internal `monthRange` helper.)
- [x] Given any shift record in the table, a Day column displays the accurate calendar weekday ("Mon", "Tue", etc.) matching the date in the restaurant's timezone. (New on desktop — the mobile ledger already computed this via a private helper; promoted to a shared, unit-tested `calendarWeekday` in the new `domain/attendance-metrics.ts`, used by both. Every weekday used in a test assertion was independently verified against a real `Date` computation, not asserted from memory.)
- [x] Given a selected employee, the summary stat cards accurately display `Days Worked`/`Total Hours`/`Avg per Day`. (The math already existed inline in `PersonSection` — extracted into a named, tested `computeAttendanceSummary` per this spec's own Implementation Map. Subtitles added under each tile matching the mockup's own text ("of N days in `<Month>`", an excluded-rows note, "across days actually worked").)
- [x] Given a manager clicking "Print", they can choose between printing the active person, a checked subset, or all rostered employees, resulting in clean formatted print pages. (New: `attendance-print-dialog.tsx` + a printable area reusing Payroll's own `print:hidden`/`print:block` + scoped `@media print` isolation technique — the only existing print precedent in this app. Live-verified with a real browser: `window.print()` invoked with the printable area's actual text content containing exactly the chosen people, for all three choices.)
- [x] Given an unlinked server, they cannot view other employees' records or summary cards. (Unchanged, Feature 019's own invariant — reconfirmed this feature never weakens it: a `self`-scoped viewer's Print button skips the choice dialog entirely rather than exposing who else exists to print, live-verified the printed content contains only their own record.)

**Reconciliation, resolved with the user before implementation began**: this spec originally listed CSV bulk import as in scope, requiring committed records to land in a Supabase `attendance_records` table. Two things made that impossible as specced: Feature 018 confirmed live that this app's Neon connection is read-only (a direct `INSERT` returned `permission denied for table users`), and `docs/PRD.md`'s explicit MVP carve-out for attendance says "no write path into it, no clock-in/out capability built here." No Supabase `attendance_records` table exists anywhere in this codebase either — the real data source is Neon, read via `src/features/attendance/data/attendance-data.ts` (Feature 018). Presented as a three-way choice (a new Supabase-owned import table / defer CSV import / get real Neon write access); the user chose to defer CSV import entirely for this build. See `tasks/current-task.md`'s own Reconciliation 1 for the full record.

## UX Contract

- **Entry point:** Desktop top/secondary nav "Attendance", mobile "More" sheet > "Attendance".
- **Desktop:** Split view or wide layout per Section 2e: Person selector + Month/Year bar on top, 3 stat tiles, followed by the daily log table.
- **Mobile:** Vertical stack per Section 2f: Large employee selector, month navigation with print icon, 3 horizontal stat cards, followed by vertical shift items.

## Data & Authorization

- **Correction, found reading the actual code rather than assumed**: no
  `attendance_records` table (with `restaurant_id`/`work_date` columns)
  exists anywhere in this codebase, in Supabase or otherwise. Feature
  018 established the real, only data source: Neon's `users(id,
full_name, role, phone, created_at, is_active)` and `attendance(id,
user_id, date, clock_in, clock_out, hours_worked, auto_clocked_out)`
  tables, read exclusively through `src/features/attendance/data/attendance-data.ts`.
  Live-confirmed in Feature 018 that this app's Neon connection is
  read-only (a direct `INSERT` returned `permission denied for table
users`) — this feature adds no write path and no Neon-side schema.
- **Tables/columns:** Neon `attendance`, filtered by `user_id = ANY(...)`
  and `date >= month_start AND date <= month_end` (the new month/year
  navigator's own range, resolved by `resolvePeriodRange`'s `"month"`
  variant). The Supabase-side `attendance_identity_links` table
  (Feature 019) is the only thing this feature reads from Supabase, and
  only to resolve `profile_id -> Neon user_id` for a `self`-scoped
  viewer.
- **Grants/RLS:**
  - Managers/owners can view all active Neon users and every person's
    records for the currently browsed month (`getAttendanceUsersAction`/
    `getAttendanceReportAction`, unchanged from Features 018/019).
  - Servers can only query records linked to their own authenticated
    profile ID via `attendance_identity_links` — enforced server-side by
    `resolveAttendanceAccess`, never by client-supplied `userIds`.
- **Identity Rule:** Strict foreign key from `attendance_identity_links`
  to a Neon `user_id`. Zero string-based name matching — "Name
  (Designation)" (`buildDisplayLabels`) is display text only.

## Implementation Map

- `src/features/attendance/components/attendance-report.tsx`: Main reporting interface, month/year selector, stat tiles.
- `src/features/attendance/components/attendance-print-dialog.tsx`: Multi-select print modal & print CSS.
- `src/features/attendance/domain/attendance-metrics.ts`: Pure functions for `Days Worked`, `Total Hours`, and `Avg per Day`.

## Test Plan

- Unit: Accurate calendar weekday calculation across month boundaries and leap years; metrics computation tests.
- E2E: Month switching, summary stat metrics, and print dialog interactions across viewports.

## Evolution in Feature 030 (Corporate Letterhead & Statement Integration)

In **Feature 030** (`docs/features/030-combined-timesheet-payroll-statement.md`), Attendance Reporting received print and integration enhancements:

1. **Corporate Letterhead Print Templates**:
   - Shared `<ReportLetterhead>` component: "The Monk's Indian Fusion - Webster" heading with an embedded, offline-safe inline SVG crest.
   - Document metadata header displaying Employee Name, Designation, Report Period, and Generation Timestamp.
   - Comprehensive shifts table with calendar weekdays, in/out timestamps, auto-closed warnings, and total hours summary.
   - Verification signature blocks: "Employee Signature" and "Authorized Manager Signature" with date lines for legal and administrative compliance.
2. **1-Employee-Per-Page Print Pagination**:
   - Enforced via the shared `.print-page-break` CSS class (`src/app/globals.css`), applied to `PrintableReport`'s per-employee wrapper.
   - Prevents awkward mid-shift page splits and ensures clean single-sheet filing per employee.
3. **Combined Monthly Statement Action**:
   - Added a "Monthly Statement" action button beside "Print" in both single-employee and all-employee views.
   - Triggers the Combined Monthly Timesheet & Payroll Statement dialog, bridging attendance clock-ins with gross wages, adjustments, and disbursement status.
4. **Dropdown Contrast Fix**:
   - Explicit popover theme tokens (`bg-popover text-popover-foreground [&>option]:bg-popover [&>option]:text-popover-foreground`) applied to employee, month, and year selectors to ensure dark-mode contrast.

## Bug Fix Pass on Feature 030 (found testing PR #29)

Two of the four live bugs fixed in Feature 030's bug-fix pass
(`tasks/current-task.md`'s own "Bug Fix Pass" section) landed here:

1. **Pure vector print output, no raster image.** The letterhead
   originally used an external `<img src="https://www.monkswebster.com/
assets/img/logo-light.png">` (`crossOrigin="anonymous"`) -- a real
   reliability bug, since that fails outright offline or against an
   unreachable/hotlink-blocked host. `PrintableReport` now uses the
   shared `<ReportLetterhead>`'s embedded inline SVG instead; the
   printed timesheet table is tagged `.print-timesheet-table` for the
   shared hidden-line/`user-select: text` styling.
2. **Dynamic PDF filename.** The print-triggering effect (fired once
   `printJob` state commits) now routes through
   `triggerPrintWithFilename` (`src/lib/print-utils.ts`) instead of a
   bare `window.print()` -- `document.title` becomes `"<Name>
Attendance Report <Mon> <Year>"` for a single employee or `"Staff
attendance Report <Mon> <Year>"` for a roster print, live-verified
   both via a real browser and in `tests/e2e/payroll-timesheet-
overhaul.spec.ts`.

Live-verifying this pass also surfaced (and fixed) a real regression it
introduced in `tests/e2e/attendance-reporting.spec.ts`: 3 pre-existing
tests asserted `printCallCount` synchronously right after a print
click, which now loses the race against `triggerPrintWithFilename`'s
internal `setTimeout` (needed so `document.title` actually commits
before the print dialog reads it) -- fixed with a poll helper.
