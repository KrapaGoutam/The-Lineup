# Current Task: Feature 025 — Attendance Reporting & Filters

**Active Spec:** `docs/features/025-attendance-reporting-and-filters.md`
**Branch:** `feature/025-attendance-reporting-and-filters` (stacked on
`feature/028-table-allocation-unrestricted-editing`)
**Status:** In progress
**Assigned Agent:** Claude Code (explicit implementer, per user request)

## 🎯 Objective

Upgrade `src/features/attendance/` (Features 018/019's existing Neon-backed
report) with real month/year navigation, a calendar Day column, per-person
`Days Worked`/`Total Hours`/`Avg per Day` stat cards, and multi-select
print support, matching `design-system-reference.html`'s sections `2e`
(desktop) and `2f` (mobile) — the only actual mockup found in this repo;
`docs/features/025-attendance-reporting-and-filters.md`'s own text
references to "Section 2e/2f" point here. CSV bulk import is **out of
scope for this build** (see Reconciliation 1).

## 📖 Investigation findings

**Reconciliation 1 — CSV import removed from scope (resolved with the
user before writing this file):** The original spec said CSV import
should "commit records to `attendance_records`." Two things make that
impossible as written:

1. Feature 018 confirmed **live**, not assumed, that this app's Neon
   connection is read-only: a direct `INSERT` against the real Neon
   database returned `permission denied for table users`, and Feature
   018's own Data section states plainly, "this app has no write access
   to Neon (the connection string is read-only) and adds no Neon-side
   schema."
2. `docs/PRD.md`'s explicit MVP carve-out for attendance says: "read-only
   display of already-existing attendance data from a separate external
   system (Feature 018) ... no write path into it, no clock-in/out
   capability built here." A Supabase-side `attendance_records` table
   also does not exist anywhere in this codebase — the spec's own Data &
   Authorization section (`restaurant_id`, `work_date`, `profile_id`
   columns) describes a table that was never built; the real, only
   attendance data source is Neon's `users`/`attendance` tables, read via
   `src/features/attendance/data/attendance-data.ts`.

Presented this to the user as a three-way choice (new Supabase-owned
import table / defer CSV import / get real Neon write access). **User
chose to defer**: the live prompt was updated to explicitly say "CSV
bulk import for attendance records is strictly scoped OUT." This task
file, and the rest of this build, reflects that updated scope. The
spec file's own Scope/Acceptance-Criteria/Implementation-Map/Test-Plan
text still shows the old CSV bullets — corrected in Step 7 (Docs), not
here, matching this repo's established practice of correcting a spec
in place once the real build reveals what's accurate.

**Reconciliation 2 — what's already built vs. what's real work (read
`attendance-report.tsx`/`attendance-report.ts`/`attendance-actions.ts`
in full before assuming anything was missing):**

Already fully implemented (Features 018/019), unchanged by this
feature:

- Neon read layer (`attendance-data.ts`), the three-way `all`/`self`/
  `unlinked` access model (`resolveAttendanceAccess`), name
  disambiguation (`buildDisplayLabels`), the day/week/month **rolling**
  dashboard tiles (`DashboardTiles` — Feature 019's own explicit
  acceptance criterion, distinct from Feature 025's month-scoped stat
  cards below and left untouched), `aggregateHours`'s null-hours
  exclusion handling, the mobile card ledger's date-parsing pattern
  (`mobileDateParts`, being promoted into a shared, tested domain
  function below rather than rewritten), and the Auto-closed
  (amber)/Open shift (red) badges — colors already match the mockup's
  `--warnLine`/`--warn` and `--dangerLine`/`--danger` tokens exactly.
- `Days worked`/`Total hours`/`Avg per day` **math** — already computed
  inline in `PersonSection` (`daysWorked = rows.length -
excludedRowCount`, `avgPerDay = total / daysWorked`). Not missing
  logic, just not yet a named, independently unit-tested pure function
  living where the spec's own Implementation Map says it should
  (`domain/attendance-metrics.ts`) — extracted, not reinvented.

Real gaps — the actual work of this feature:

1. **No real month/year navigation.** The existing `PeriodPicker` is a
   `this-month` / `previous-month` / `custom-range` dropdown — it can
   never jump to, say, March 2025 directly the way the mockup's
   `< September > 2026` stepper bar does. New `{ type: "month"; year;
month }` variant added to the existing `AttendancePeriodSelection`
   union (`domain/attendance-report.ts`) rather than a parallel type,
   since `resolvePeriodRange` already is the one place every period
   resolves through, in both the component and the Server Action's own
   zod validation.
2. **No calendar Day column on the desktop table at all** — only Date/
   Clock in/Clock out/Hours. The mobile ledger already computes a
   weekday (`mobileDateParts`), just never shared with the desktop
   table, which the mockup shows with an explicit "Day" column between
   Date and Clock in.
3. **No print capability anywhere in Attendance.** This app has exactly
   one existing print precedent — `payroll-workspace.tsx`'s "Print
   statement" button, its `print:hidden`/`print:block` Tailwind
   isolation, and a scoped `@media print` block hiding everything
   outside one named printable `id`. Reused directly rather than
   inventing a second pattern; extended (not present in Payroll) with an
   actual choice dialog, since Payroll only ever prints the one period
   already on screen.
4. **The "all"-scope browsing UI doesn't match the mockup's actual
   shape.** Today it's an always-visible checkbox multi-select with one
   stacked `PersonSection` per checked person plus a cross-person grand
   total. The mockup (2e) and the spec's own UX Contract ("Person
   selector + Month/Year bar on top, **3 stat tiles**, followed by
   **the** daily log table" — singular, not plural) show exactly one
   person's report at a time, switched via a compact pill
   ("Deepak Rao ▾"). **Decision, not assumed**: the always-on
   multi-select becomes a single-person switcher for normal browsing;
   the checkbox multi-select survives, but moves _inside_ the new print
   dialog, only when "Print selected employees" is chosen — this is
   where "Multi-Select Print Support" actually lives per the spec's own
   section title, not in the browsing view. The cross-person "grand
   total" concept is dropped from the primary view (nothing in the
   mockup shows one); `DashboardTiles`' pre-existing "Selected period"
   tile already covers "this person's currently-browsed-month total"
   once `reportUserIds` naturally narrows to one id.

## 🔒 Non-negotiable constraints

- Hard Separation: nothing here reads, writes, or derives payroll or tip
  split data. Confirmed by never importing from `src/features/payroll/`
  or `src/features/tips/` anywhere in this feature's diff.
- Zero Name Inference: identity resolution stays 100% keyed on
  `attendance_identity_links` (Supabase, Feature 019) → Neon `user_id`.
  "Name (Designation)" (`buildDisplayLabels`) is display text only, never
  touched by this feature's matching logic.
- Privacy: an unlinked server sees nothing (unchanged). A `self`-scoped
  server never sees the person switcher, the "print selected/all"
  options, or any other person's data — the print dialog is only ever
  rendered for `access.scope === "all"`; a `self` viewer's Print button
  prints directly, no dialog, no roster exposure.
- No new Supabase migration, no new pgTAP file — this feature touches
  zero Supabase schema (same as Features 018/019). `npm run db:test`
  still run before every commit per the user's instruction, expected to
  stay at its current count unless a step's own investigation finds
  otherwise.

## 🛠️ Implementation Steps

- [x] **Step 1: This task file** — populate and commit before any app
      code.
- [x] **Step 2: Domain layer — month/year period type + metrics module**
  - [x] `domain/attendance-report.ts`: added `{ type: "month"; year:
number; month: number }` (month 1-12) to `AttendancePeriodSelection`;
        extended `resolvePeriodRange` with a shared internal `monthRange`
        helper, refactored `this-month`/`previous-month` to delegate to
        it too (one source of truth for "the calendar range of month
        N/year Y", not three near-duplicate `Date.UTC` blocks).
  - [x] New `domain/attendance-metrics.ts` (matches the spec's own
        Implementation Map path): `calendarWeekday(isoDate)` and
        `dayOfMonth(isoDate)` (promoted out of the component's
        `mobileDateParts`, same UTC-noon parsing, now shared by both the
        desktop Day column and the mobile ledger), `daysInMonth(year,
month)`, and `computeAttendanceSummary(rows)` → `{ daysWorked,
totalHours, avgPerDay, excludedRowCount }`, wrapping the existing
        `aggregateHours` rather than reimplementing null-handling.
  - [x] `domain/attendance-metrics.test.ts` (new, 15 tests): weekday
        across a month and year boundary and a leap year, each weekday
        assertion verified against a real `Date` computation before being
        written into the test, not asserted from memory;
        `daysInMonth` for 28/29/30/31-day months; `computeAttendanceSummary`
        for a normal set, an all-null set, a mixed set, and an empty set
        (exact `daysWorked`/`avgPerDay`, not just `totalHours`).
  - [x] `domain/attendance-report.test.ts`: new `resolvePeriodRange`
        cases for `{ type: "month" }` — an arbitrary past month
        independent of `todayLocalDate`, a leap-year February, December
        without rolling into next year, and January directly (mirroring
        the existing previous-month rollback test's intent).
  - [x] `actions/attendance-actions.ts`: extended `attendancePeriodSchema`
        (the discriminated union already validating `period` on both
        `getAttendanceReportAction` and any caller) with the `"month"`
        variant, bounded `year` (2024–2100) and `month` (1–12) — a
        malformed value still fails closed to "that attendance request is
        invalid," matching every other branch.
  - [x] Full gate: `npm run check` (prettier/eslint/typecheck all pass),
        `npm test` (32/32 files, **214/214** tests, up from 195), `npm
run build` (pass), `npm run db:test` (**unchanged**, 16/16 files, 202
        assertions — no schema touched, as expected).
  - [x] Commit.
- [x] **Step 3: Month/year navigator + calendar Day column**
  - [x] New `components/attendance-month-nav.tsx` (pure, presentational):
        prev/next chevrons (disabled at the Jan-2024 floor and at the
        current real month, matching the acceptance criterion's
        "2024–present" bound and Feature 028's precedent of clamping a
        navigator at "today" rather than trusting the client to self-limit),
        a month `<select>` (Jan–Dec, future months in the current year
        disabled) and a year `<select>` (2024..current year), all changes
        routed through one `onChange({ year, month })`.
  - [x] `attendance-report.tsx`: replaced `PeriodPicker`'s UI (deleted;
        `resolvePeriodRange`'s other branches are untouched and still
        exported) for both `self` and `all` scopes with
        `AttendanceMonthNav`, defaulting to the restaurant's current real
        month/year (`todayLocalDate`-derived, unchanged source of "today"
        — captured once at mount, same reasoning as Feature 028's own
        date navigator). Also renamed the header to "Attendance" and its
        subtitle to match `design-system-reference.html` section 2e's
        text exactly (was "Attendance Report" / a different sentence).
  - [x] Added a Day column to the desktop table (`Date | Day | Clock in |
Clock out | Hours`, matching the mockup's exact column order) and
        switched the mobile ledger's date parts to the new shared
        `calendarWeekday`/`dayOfMonth` instead of the local
        `mobileDateParts` (deleted).
  - [x] `PersonSection`: stat tiles wired to `computeAttendanceSummary`
        instead of the inline math; subtitles added under each tile
        matching the mockup's own text shape ("of N days in September"
        via `daysInMonth`, an excluded-rows note under Total Hours reusing
        the existing singular/plural phrasing already used elsewhere in
        this file, "across days actually worked" under Avg per Day); the
        table/mobile footer's "Total" label now reads "`<Month>` total"
        (e.g. "September total"), matching the mockup exactly.
  - [x] **Real regression found and fixed**: the existing
        `tests/e2e/dashboard.spec.ts` test ("an unlinked server can open
        Attendance...") asserted the old heading text "Attendance
        Report" — updated to "Attendance" (`exact: true`) to match the
        renamed header.
  - [x] Live Playwright smoke test (demo mode, real browser via the MCP
        Playwright tool, not just imagined): signed in as the demo
        manager, opened Attendance, confirmed the month/year nav renders
        with September selected and "Next month"/Oct–Dec correctly
        disabled at the real-today ceiling, confirmed the desktop Day
        column shows the correct weekday for every demo row (Wed/Tue/
        Thu/Sat/Sun, each independently verified against a real `Date`
        computation, not assumed), confirmed the three stat-tile hints
        render with the right text and numbers. Clicked "Previous
        month": every section correctly re-rendered for August (Fri/Thu
        Day-column values, both independently verified; "of 31 days in
        August"; "August total"), "Next month" became enabled, and
        October/November/December became selectable again once no
        longer the current year+month.
  - [x] Full gate: `npm run check`, `npm test` (214/214, unchanged count
        — Step 3 added no new unit tests of its own, reusing Step 2's),
        `npm run build`, plus the two existing attendance e2e scenarios
        in `dashboard.spec.ts` re-run directly and confirmed passing
        after the heading-text fix.
  - [x] Commit.
- [x] **Step 4: Single-person switcher for the `all` scope**
  - [x] `attendance-report.tsx`: replaced the always-on checkbox
        multi-select, its N stacked `PersonSection`s, and the grand-total
        block with one active-person `Select` (styled as a pill matching
        `AttendanceMonthNav`'s own container) and exactly one
        `PersonSection`, defaulting to the first person alphabetically by
        display label. `activePersonId` state replaced the old
        `selectedIds: Set<number>`; the default (and a correction if a
        previously-active id ever stops existing in a fresh list) is
        applied during render — this file's own established pattern
        (`syncedContext` elsewhere in it), not a separate effect, so
        there's never a render where the list is ready but nobody is
        shown. `reportUserIds` narrows to `[activePersonId]`;
        `DashboardTiles`' "Selected period" tile keeps working unchanged,
        now naturally meaning "this one person, this browsed month" (live
        confirmed: switching from Anil (Host) to Deepak Rao moved the
        tile from 8h to 16.3h, matching `PersonSection`'s own total
        exactly).
  - [x] Confirmed (read, not assumed) neither existing attendance e2e
        scenario in `tests/e2e/dashboard.spec.ts` ("an unlinked
        server..."/"a manager can link attendance...") depends on the
        removed multi-select/grand-total shapes — both exercise `self`/
        `unlinked` scope only, re-ran directly and both still pass
        unmodified.
  - [x] Live Playwright smoke test (real browser, MCP tool): as manager,
        confirmed the switcher defaults to "Anil (Host)" (alphabetically
        first by display label — "Host" < "Server"), switched to "Deepak
        Rao (Server)" and confirmed the whole section (stat tiles, table
        rows, "Selected period" dashboard tile) updated to his data.
        Signed out, signed in as the demo server (Mia, unlinked by
        default in a fresh session) and confirmed the Attendance tab
        shows the unchanged unlinked state with no Employee switcher and
        no month nav at all — `self`/`unlinked` scopes are untouched by
        this step, confirmed live rather than only by reading the diff.
  - [x] Full gate: `npm run check`, `npm test` (214/214, unchanged --
        this step touched no domain logic), `npm run build`, both
        existing attendance e2e scenarios re-run directly and passing.
  - [x] Commit.
- [x] **Step 5: Multi-select print support**
  - [x] New `components/attendance-print-dialog.tsx`: rendered only for
        `access.scope === "all"`. Three radio choices ("Print current
        employee" / "Print selected employees" / "Print all employees");
        choosing "selected" reveals a checkbox list sourced from the same
        `sortedActiveUsers` list the switcher already has (this is where
        the old multi-select UI actually ends up living, per
        Reconciliation 2). Confirm resolves to a `number[]` of target Neon
        user ids and closes.
  - [x] `attendance-report.tsx`: a header "Print" button next to
        `AttendanceMonthNav` in both scopes. `self` scope: prints
        directly (`setPrintJob` from already-loaded data, then
        `window.print()` — no dialog, matches Payroll's own
        no-choice-needed precedent). `all` scope: opens the dialog; on
        confirm (`printPeople`), fetches (reusing the existing
        `getAttendanceReportAction`, which already accepts multiple
        `userIds`) each target person's rows for the _currently browsed_
        month, renders them into one printable area (Payroll's exact
        `print:hidden`/`print:block` and scoped `@media print` visibility
        trick, one named id `attendance-print-area`), then a `useEffect`
        keyed on the new `printJob` state calls `window.print()` only
        after that state has actually committed to the DOM — the same
        reasoning payroll-workspace.tsx doesn't need (it prints
        already-rendered content) but this feature does, since "print
        all" may target people who were never rendered on screen at all.
        Printable content uses plain text status labels
        ("Auto-closed"/"Open shift"), never a colored `Badge`.
  - [x] `unlinked` scope: no Print button — nothing to print (unchanged,
        that branch never gained one).
  - [x] Live Playwright smoke test (real browser, MCP tool, `window.print`
        stubbed to count calls rather than actually invoke the OS
        dialog — matching this app's established live-testing discipline
        for anything a browser automation tool can't literally drive):
        as manager, opened the print dialog (defaulted correctly to
        "Print current employee (Anil (Host))"), chose "Print all
        employees," confirmed `window.print` was called exactly once and
        the printable area's actual text content contained all 5
        employees' full sections (stats + rows), including Zoya Khan's
        correct "No attendance recorded for this period." row, and that
        the dialog closed. Linked Mia's attendance via Team, signed in as
        her, confirmed her Print button prints directly with **no**
        dialog and the printable content contains only her own linked
        record ("Anil (Server)") — the privacy invariant holds under
        actual print, not just in the primary view.
  - [x] Full gate: `npm run check`, `npm test` (214/214, unchanged),
        `npm run build` all pass.
  - [x] Commit.
- [x] **Step 6: E2E** (`tests/e2e/attendance-reporting.spec.ts`, new file
      — the two pre-existing attendance scenarios stay in
      `dashboard.spec.ts`, untouched)
  - [x] Month switching updates the ledger and the three stat cards to
        different, known demo values (September's populated stat tiles
        vs. August's explicit zero-attendance state for the same
        person).
  - [x] The Day column matches the real weekday for a known demo date —
        both the desktop table and, separately, the mobile card ledger's
        own day-digit/weekday spans (same `calendarWeekday`/`dayOfMonth`
        functions behind both, checked in whichever shape actually
        renders per viewport).
  - [x] Print dialog: current/selected/all all correctly invoke
        `window.print()` (stubbed) with the right people included in the
        printable area's actual text content, including a refusal (no
        print, an inline error) when "selected" is chosen with nothing
        checked; a `self`-scoped server's Print button never shows a
        dialog and the printed content never contains another person's
        name.
  - [x] Ran across all three Playwright projects (desktop, host-tablet,
        server-mobile) — **12/12 pass**. `host-tablet`'s pre-existing
        WebKit sign-in gap (already recorded — see memory) did not
        recur; every scenario passed there too, including the slowest
        (21.6s, still well under timeout).
  - [x] **Two real test-authoring bugs found and fixed by actually
        running the suite, not assumed correct from reading the code**:
        (1) the month-switching test wrongly expected a "Days worked"
        stat-tile hint to appear for August, when `PersonSection` only
        renders the stat-tiles grid at all when `rows.length > 0` —
        fixed to assert the September-only hint's absence instead. (2)
        both table-shaped assertions initially assumed the desktop
        `<table>` (hidden via `hidden sm:block`, not removed from the
        DOM) wouldn't interfere on the `server-mobile` project — it did,
        causing a strict-mode ambiguity on "Wed" matching both the
        hidden `<td>` and the visible mobile ledger's `<span>`. Fixed
        with viewport-aware branches, scoping the mobile assertions to
        the ledger's own `.sm\:hidden` container — the exact precedent
        `tests/e2e/dashboard.spec.ts` already set for this identical
        desktop/mobile dual-render situation.
  - [x] Full gate: `npm run check`, `npm test` (214/214, unchanged),
        `npm run build`, `npm run db:test` (16/16, 202 assertions,
        unchanged) all pass. Re-ran the full `dashboard.spec.ts` suite
        (desktop): 25/25, no regression from any step in this feature.
  - [x] Commit.
- [ ] **Step 7: Docs**
  - [ ] `docs/features/025-attendance-reporting-and-filters.md`: correct
        the Scope/Acceptance Criteria/Implementation Map/Test Plan CSV
        bullets to explicitly say CSV import is out of scope for this
        build, with the reconciliation reasoning (read-only Neon,
        confirmed live in Feature 018; PRD's explicit carve-out) inline,
        not silently deleted. Check off every remaining acceptance
        criterion with a note on what was already built vs. newly built.
  - [ ] Update `docs/STATUS.md` Feature Matrix + Health Gate line.
  - [ ] Commit.
- [ ] **Step 8: Final gate, push, open PR (base:
      `feature/028-table-allocation-unrestricted-editing`), paste real
      gate output + PR link here.**

## 🗂️ File list

- `tasks/current-task.md` (this file)
- `src/features/attendance/domain/attendance-report.ts` (new `"month"`
  period type)
- `src/features/attendance/domain/attendance-report.test.ts`
- `src/features/attendance/domain/attendance-metrics.ts` (new)
- `src/features/attendance/domain/attendance-metrics.test.ts` (new)
- `src/features/attendance/actions/attendance-actions.ts` (zod schema)
- `src/features/attendance/components/attendance-month-nav.tsx` (new)
- `src/features/attendance/components/attendance-print-dialog.tsx` (new)
- `src/features/attendance/components/attendance-report.tsx` (month nav,
  Day column, single-person switcher, print wiring)
- `tests/e2e/attendance-reporting.spec.ts` (new)
- `docs/features/025-attendance-reporting-and-filters.md` (CSV scope
  correction, checkboxes)
- `docs/STATUS.md` (milestone update)

## Current State & Next Step

Steps 1-6 done and committed. Next: Step 7 (docs — CSV-scope correction
in the feature spec, check off remaining acceptance criteria,
`docs/STATUS.md`).
