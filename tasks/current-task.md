# Current Task: Wave 3 (Part 1) — Attendance "All" Tweak + Feature 029 (Tips from Clocked-In Attendance)

**Active Specs:**

- Phase 0: ad hoc request (no spec doc), described directly in the user's
  kickoff message — see `## 📖 Investigation findings` below for how it
  was resolved against the real `attendance-report.tsx`.
- Phase 1: `docs/features/029-tips-from-clocked-in-attendance.md`

**Branch:** `feature/029-tips-from-clocked-in-attendance` (stacked on
`feature/027-recurring-schedules-and-week-navigation`)
**Status:** Complete — PR #27 open (https://github.com/KrapaGoutam/The-Lineup/pull/27)
**Assigned Agent:** Claude Code (explicit implementer, per user request)

## 🎯 Objective

Phase 0: give a manager/owner an "All" option in Attendance's per-person
switcher, showing every active team member's records for the browsed
month at once, with aggregate stat cards and a clean combined print.

Phase 1 (Feature 029): let a manager preset a tip interval's participant
checkboxes from whoever is _currently_ clocked in per the real attendance
system, instead of always defaulting to a hardcoded first-four guess —
while never weakening the fact that a saved/finalized tip split is
already, structurally, immune to any later attendance edit.

## 📖 Investigation findings (read every relevant file in full first)

1. **Attendance's "all" access scope already exists, but only ever shows
   one person at a time.** Feature 025 replaced an older always-on
   checkbox multi-select with a single-person `<Select>` switcher
   (`activePersonId`) — see that feature's own Reconciliation 2. Phase 0
   adds a literal `"all"` value to that same switcher rather than
   reintroducing the old multi-select or building a second UI: one
   dropdown, one new option, one new branch in the render tree.
2. **The print-all capability already exists, just gated behind the
   print dialog's "Print all employees" radio.** `AttendancePrintDialog`
   already builds one `PrintableReport` with a section per person.
   Choosing "All" in the main switcher reuses this exact same
   `PrintableReport` component unmodified — the "All" filter's Print
   button skips the dialog and calls a new `printAll()` helper directly
   (mirroring how `self` scope already skips the dialog too), splitting
   the already-fetched combined `rows` by `userId` instead of doing a
   second fetch.
3. **Reconciliation 2's entire "frozen snapshot" guarantee is _already_
   enforced at the RLS layer, found reading the migration directly, not
   assumed.** `tip_allocations_mutate_draft_only` /
   `_update_draft_only` / `_delete_draft_only` (and `tip_intervals`'/
   `tip_interval_participants`' own insert policies) all key on the
   parent `tip_pools.status = 'draft'`; `recalculate_tip_pool()` itself
   raises if the pool isn't `'draft'`. Once a pool is `'finalized'`,
   Postgres itself refuses any further write to
   `tip_intervals`/`tip_interval_participants`/`tip_allocations` for it
   — a later attendance edit literally cannot reach a finalized split,
   regardless of what any application code does or doesn't do. Feature
   029 needs zero new RLS/migration work for this invariant; it already
   holds.
4. **Zero FKs from any tip table to attendance or payroll — confirmed by
   reading `20260905125418_operational_modules.sql`'s own header
   comment**, which already states this exact invariant in its own
   words ("Payroll and Tip Split are fully independent systems... no
   table or policy... references tip_pools, tip_intervals,
   tip_interval_participants, tip_allocations... and none ever will").
   Acceptance criterion 4 (zero FKs) is therefore already satisfied,
   not something to build.
5. **The "active-floor suggestion" checkboxes are currently a pure demo
   hack** (`index < 4` in `tip-workspace.tsx`'s `ShiftEditor`... err,
   `TipWorkspace`'s participant fieldset) — not derived from any real
   data source at all, real or demo. Feature 029 replaces this only as
   the _default_; a manager can still click "Pull clocked-in team" (or
   not) and can still hand-check/uncheck anyone regardless.
6. **No `attendance_records` table exists** (same finding as Feature
   025's own reconciliation) — the real source is Neon's `attendance`
   table, read via `attendance-data.ts`. The spec's own Implementation
   Map already correctly names a _new_ isolated data file
   (`fetch-clocked-in-roster.ts`) rather than the nonexistent table, so
   this is a documentation-only mismatch, not a scope question.
7. **No existing query answers "who is clocked in right now."**
   `getAttendanceRows` requires known `userIds` + a date range and
   returns every row (open or closed) in it. A new, narrow query is
   needed: `date = $1 and clock_in is not null and clock_out is null`.
   Added as a new exported function in `attendance-data.ts` (reusing the
   same lazy Neon client + row-shape conventions already there), not a
   second, duplicated Neon-connection helper in the new tips file — the
   Implementation Map's "isolated query" wording is read as "isolated to
   its own read-only purpose," not "must not import from
   `attendance-data.ts`."
8. **Identity resolution**: `attendance_identity_links` (Feature 019) is
   the only path from a Neon `user_id` to a Supabase `profile_id` — an
   active clock-in for an unlinked Neon user is silently excluded from
   the pulled roster (nothing to check for someone with no corresponding
   team-member checkbox in the first place), never matched by name.
9. **Demo mode has no real Neon connection**, so "Pull clocked-in team"
   in demo mode is resolved from the in-memory `demoAttendanceLinks`
   (profileId → neonUserId, empty until a manager deliberately links
   someone from Team, exactly like Attendance's own demo access) crossed
   against `demoNeonAttendance`. The existing fixture has zero open
   (unclosed) rows on `DEMO_ANCHOR_DATE` ("2026-09-10") — two new open
   rows are added there so the button has something real to demonstrate
   once a manager links a couple of people.

## 🔒 Non-negotiable constraints

- Tips and Attendance/Payroll share no tables, no ledgers, no derived
  calculations (already true — see findings 3/4 above; this build must
  not add a single FK or cross-read that would break it).
- `calculateTipSplits`/`allocateTipInterval` stay pure — consume only
  the in-memory `TipIntervalInput[]` handed to them, never reach out to
  attendance data themselves.
- "Pull clocked-in team" only ever changes which checkboxes start
  checked in the _unsaved_ add-interval form — it is never a write
  itself, and never touches an already-saved interval.
- Identity resolution is strictly UUID-to-UUID
  (`attendance_identity_links`), never a name-string match.
- Servers still see only their own attendance record; "All" is
  manager/owner-only, exactly like every other privileged-only control
  in that switcher already is.

## 🛠️ Implementation Steps

- [x] **Step 1: This task file** — populate and commit before any app
      code.
- [x] **Step 2: Phase 0 — Attendance "All" tweak**
  - [x] `attendance-report.tsx`: generalized `activePersonId: number |
null` to a `number | "all" | null` selection; added an `"All
employees"` `<option>` to the switcher (manager/owner-only
        branch, unreachable for a `self`-scoped server).
  - [x] `reportUserIds` resolves to every active user's id when `"all"`
        is selected, instead of exactly one.
  - [x] New `summarizeAllStaff` domain helper (`Total shifts` = row
        count, `Total hours` = `aggregateHours(rows).totalHours`) shown
        above a per-person list of existing `PersonSection`s (one per
        active employee, reusing that component completely unchanged --
        including its own zero-attendance state for someone with no
        rows this period).
  - [x] Print button skips `AttendancePrintDialog` when the filter is
        `"all"` and calls a new `printAll()` directly from the
        already-loaded combined `rows` (no extra fetch).
  - [x] Unit tests: 3 new `summarizeAllStaff` tests (multi-person shift
        counting, null-hours exclusion, empty roster).
  - [x] Full gate: format/lint/typecheck clean, 253/253 unit tests,
        build clean.
  - [x] Live-verified (demo mode, manager): selecting "All employees"
        showed "Total shifts: 6" / "Total hours: 32.8h" (matching the
        "Selected period" dashboard tile, which also updated to 32.8h),
        rendered all 5 active employees' own `PersonSection`s including
        Zoya Khan's genuine zero-attendance state, and clicking Print
        fired `window.print()` immediately (no dialog) with the printed
        area containing every person's section.
  - [ ] Commit.
- [x] **Step 3: Feature 029 — data layer**
  - [x] `attendance-data.ts`: new `getActiveClockedInRows({ serviceDate
})` (`clock_in is not null and clock_out is null and
auto_clocked_out = false`, so the rare open-but-already-
        auto-closed demo edge case is correctly excluded too), reusing
        the existing lazy-client convention. Extracted a shared
        `mapAttendanceRow`/`RawAttendanceRow` used by both this and the
        pre-existing `getAttendanceRows`, rather than a second
        hand-copied row mapping.
  - [x] New `src/features/tips/data/fetch-clocked-in-roster.ts`:
        resolves active Neon rows → profile ids via
        `attendance_identity_links`, dedupes, silently excludes an
        unlinked active Neon user, returns `string[]`.
  - [x] Unit test: 6 cases (linked resolution, unlinked exclusion, dedup
        on a double-open-row edge case, empty roster, and both
        dependencies' own failure propagated) via this codebase's
        established `vi.hoisted`/`vi.mock` pattern.
  - [x] Full gate: format/lint/typecheck clean, 259/259 unit tests
        (6 new), build clean.
  - [x] Commit.
- [x] **Step 4: Feature 029 — Server Action**
  - [x] `tips-actions.ts`: new `getClockedInRosterAction({
restaurantSlug })`, zod-validated, manager/owner-only (defense
        in depth beyond the UI), re-derives `organizationId` via
        `getCurrentUser` and the service date via the restaurant's own
        primary location + timezone (never trusts a client-supplied
        date).
  - [x] Unit test: 5 cases (malformed slug refused before any lookup,
        server refused, manager succeeds with org/date re-derived
        server-side, missing primary location, roster-lookup failure
        propagated) via the established `vi.hoisted`/`vi.mock` pattern.
  - [x] Full gate: format/lint/typecheck clean, 264/264 unit tests
        (5 new), build clean.
  - [x] Commit.
- [x] **Steps 5+6 (combined — not independently compilable, so committed
      together): Feature 029 — UI, immutability regression test,
      app-shell wiring, demo fixtures**
  - [x] `tip-workspace.tsx`: "Pull clocked-in team" button (manager-only,
        disabled once finalized) above the participant checkboxes;
        checkboxes became controlled (`Set<string>` state) so the pull
        can programmatically check/uncheck them, while the manager can
        still hand-edit the result before submitting. Explicit reset of
        that state back to the original first-four default after a
        successful submit (a native `form.reset()` alone no longer
        touches now-controlled checkboxes).
  - [x] `calculate-tip-splits.test.ts`: new regression test asserting
        `calculateTipSplits` is unaffected by mutating its input array
        _and_ a shared `participantIds` array reference _after_ the call
        returns (a later call sees the mutation, proving the first
        result's stability wasn't just "nothing changed yet") — encodes
        "the engine consumes only explicitly passed in-memory arrays" as
        an actual test, not just a comment.
  - [x] `restaurant-operations-app.tsx`: new `pullClockedInTeam()`
        handler (demo/real dual branch, matching every other such
        handler this session), passed to `<TipWorkspace
onPullClockedInTeam={...}>`.
  - [x] `attendance/demo-data.ts`: two new **additive** open (unclosed)
        `demoNeonAttendance` rows dated `2026-09-10` (`DEMO_ANCHOR_DATE`)
        so demo mode has something real to pull once a manager links a
        couple of people from Team.
  - [x] Full gate: format/lint/typecheck clean, 265/265 unit tests
        (1 new), build clean.
  - [x] Live Playwright smoke test (demo mode, full flow): linked Mia
        Chen → Anil (Server) and Noah Diaz → Deepak Rao from Team;
        clicked "Pull clocked-in team" on Tip Split — the default
        first-four selection changed to exactly Mia + Noah (Leo/Ava
        unchecked), matching the two linked people with an open shift on
        `DEMO_ANCHOR_DATE`; added a $100 interval (split $50/$50);
        finalized. Then, on Team, fully **unlinked** Mia Chen's
        attendance (a real, disruptive attendance-side change) and
        confirmed on Tip Split that the finalized split was completely
        unaffected: still Mia Chen $50.00 / Noah Diaz $50.00 /
        Reconciled total $100.00. Signed out, signed in as Mia Chen
        (server, passcode 1357), confirmed "My tip estimate" showed
        exactly $50.00 — the same snapshotted number a privileged viewer
        sees, unaffected by the unlink. All of Acceptance Criteria 1-3
        and 5 directly demonstrated live, not just asserted from code
        reading.
  - [x] Commit.
- [x] **Step 7: E2E**
  - [x] `tests/e2e/attendance-reporting.spec.ts`: new test for the "All"
        filter (aggregate cards -- 8 shifts/32.8h, the 2 new Feature 029
        fixture rows correctly counted as shifts but excluded from the
        hours sum -- combined per-person view, direct print with every
        person's label present in the printed area).
  - [x] New `tests/e2e/tips-clocked-in-roster.spec.ts`: links two
        people's attendance from Team, confirms the pull replaces (not
        merges with) the original first-four default with exactly the
        two linked/clocked-in people, adds and finalizes a $100
        interval, then fully **unlinks** one person's attendance and
        confirms the finalized split ($50/$50/$100 total) is completely
        unaffected -- both from the manager's view and from that
        person's own "My tip estimate" after signing in as them.
  - [x] Run across all three Playwright projects: 18/18 passed.
  - [x] Full gate: format/lint/typecheck clean, 265/265 unit tests,
        build clean.
  - [x] Commit.
- [x] **Step 8: Docs**
  - [x] `docs/features/029-tips-from-clocked-in-attendance.md`: checked
        off every acceptance criterion, noting which were already true
        (the RLS/FK invariants -- criteria 3 and 4) vs. newly built (the
        UI/data-layer pull -- criteria 1, 2, 5). Corrected the
        Implementation Map with the two files it omitted
        (`getClockedInRosterAction`, `getActiveClockedInRows`). Status
        -> `complete`.
  - [x] Updated `docs/STATUS.md` Feature Matrix (new `029` row) + Health
        Gate line (36/36 unit files, 265/265 tests; +tips-clocked-in-
        roster e2e) + Current Status Overview.
  - [x] Commit.
- [x] **Step 9: Final gate, push, open PR (base:
      `feature/027-recurring-schedules-and-week-navigation`), paste real
      gate output + PR link here.**
  - [x] `npm run check`: `format:check`/`lint`/`eslint --max-warnings=0`/
        `typecheck` (`next typegen && tsc --noEmit`) all clean.
  - [x] `npm test`: **36/36 files, 265/265 tests** passed.
  - [x] `npm run build`: `next build` compiled successfully, typechecked
        clean, all 13 pages generated.
  - [x] `npm run db:test`: **17/17 pgTAP files, 210/210 assertions**,
        `Result: PASS` (unchanged from `feature/027` -- this branch adds
        no migration).
  - [x] Full e2e suite, all specs, all three Playwright projects:
        **138/138 passed** (desktop, host-tablet, server-mobile) --
        including the new "All employees" test and
        `tips-clocked-in-roster.spec.ts`. No regressions in any
        pre-existing suite from this branch's changes.
  - [x] Pushed `feature/029-tips-from-clocked-in-attendance`, opened
        PR #27 (base
        `feature/027-recurring-schedules-and-week-navigation`):
        https://github.com/KrapaGoutam/The-Lineup/pull/27

## 🗂️ File list

- `tasks/current-task.md` (this file)
- `src/features/attendance/components/attendance-report.tsx` (Phase 0)
- `src/features/attendance/components/attendance-report.test.ts` (new, if
  needed for any extracted pure logic)
- `src/features/attendance/data/attendance-data.ts`
  (`getActiveClockedInRows`)
- `src/features/tips/data/fetch-clocked-in-roster.ts` (new)
- `src/features/tips/data/fetch-clocked-in-roster.test.ts` (new)
- `src/features/tips/actions/tips-actions.ts`
  (`getClockedInRosterAction`)
- `src/features/tips/actions/tips-actions.test.ts` (new)
- `src/features/tips/components/tip-workspace.tsx`
- `src/features/tips/domain/calculate-tip-splits.test.ts` (new
  immutability regression test)
- `src/components/restaurant-operations-app.tsx`
- `src/features/attendance/demo-data.ts` (two new fixture rows)
- `tests/e2e/attendance-reporting.spec.ts` (new "All" test)
- `tests/e2e/tips-clocked-in-roster.spec.ts` (new)
- `docs/features/029-tips-from-clocked-in-attendance.md`
- `docs/STATUS.md`

## Current State & Next Step

All 9 steps done and committed. Full gate green (265/265 unit, build
clean, 210/210 pgTAP, 138/138 e2e across 3 projects). Pushed and PR
opened: https://github.com/KrapaGoutam/The-Lineup/pull/27 (base
`feature/027-recurring-schedules-and-week-navigation`). This branch is
complete -- both the Attendance "All" tweak and Feature 029 shipped.
