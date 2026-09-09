# Current Task: Feature 031 — Universal Letterhead Redesign & All-Employees Statement Printing

**Active Spec:** `docs/features/031-universal-letterhead-and-batch-statements.md`
**Branch:** `feature/031-universal-letterhead-and-batch-statements` (branched from `main`, after Feature 030 / PR #29 merged)
**Status:** Complete — PR open: https://github.com/KrapaGoutam/The-Lineup/pull/30
**Assigned Agent:** Claude Code (implementation, verification gate, and PR)

## 🎯 Objective

Given directly by the user as a complete, bounded technical spec (no
discovery/planning round needed): redesign the shared `<ReportLetterhead>`
to match a reference document layout exactly, replace its logo with an
embedded inline SVG (never an external raster `<img>`), and let managers
generate + print the Combined Monthly Statement for every active
employee in one batch, one page per employee, under a dedicated roster
filename.

## 📖 Key Findings & Architecture

1. **No "Monk's" brand SVG asset exists anywhere in this repo** (checked
   via `find`/`grep` -- only Next.js starter icons under `public/`), and
   `monkswebster.com` is a real, unrelated external business's site --
   not an asset this codebase owns. There was nothing to literally
   "extract paths from," and scraping a real business's trademarked logo
   would be inappropriate regardless of feasibility. Decision: author an
   original, simple monochrome hooded-silhouette crest instead,
   documented directly in the component's own header comment.
2. **Letterhead layout inversion**: the new reference layout swaps what
   Feature 030 had -- previously the full "The Monk's Indian Fusion -
   Webster" was the `<h1>` on the left with a "Generated" timestamp on
   the right; now the short "The Monk's" is the `<h1>` (with `reportTitle`
   beneath it) on the left, and the full org name/address/site is a
   plain right-aligned contact block (no longer a heading), with no
   timestamp anywhere.
3. **`employeeName` becomes optional**: omitting it hides the "Employee"
   meta block entirely (not just blanks it) -- needed for a future/
   present all-staff summary context where there's no single employee
   to name.
4. **Batch statement fetch reuses existing infra**: `CombinedStatementDialog`
   already called `getCombinedMonthlyStatementAction` for exactly one
   employee. Generalizing to "all employees" means calling that same
   action N times via `Promise.all` (no new server action), keyed by a
   new `CombinedStatementTarget` discriminated union
   (`{ scope: "single"; neonUserId } | { scope: "all"; neonUserIds }`) --
   the same "reuse existing, already-authorized infra" pattern
   `PayrollPrintDialog` already established in Feature 030's bug-fix pass.
5. **Partial-failure handling**: a batch of N fetches can have some
   succeed and some fail (e.g. an employee with no attendance link). The
   dialog renders every successful statement and shows a small
   `print:hidden` note naming how many were skipped, rather than
   blocking the whole batch on one bad id. Only 100% failure blocks with
   an error state.
6. **Entry point was previously fully hidden**: Attendance's "all"-scope
   Monthly Statement button used to be `{!showingAll && activePerson ? (...) : null}`
   -- entirely absent whenever "All employees" was selected. It's now
   always rendered, branching label/target/disabled on `showingAll`.

## 🔒 Non-negotiable Constraints

- Multi-tenant isolation and statement authorization rules unchanged --
  the "all" scope's id list comes from the caller's own already-
  authorized `sortedActiveUsers`, each id still individually re-checked
  by the existing `getCombinedMonthlyStatementAction`.
- Tips and payroll remain strictly separate (untouched by this feature).
- No new server action for the batch fetch -- `Promise.all` over the
  existing one only.
- Quality gates (`npm run check`, `npm test`, `npm run build`) pass
  before every commit.

## 🛠️ Implementation Steps

- [x] **Step 1: `<ReportLetterhead>` redesign**
  - [x] Rewrite `src/components/print/report-letterhead.tsx`: new props
        (`reportTitle`, `periodName`, optional `employeeName`/
        `employeeRole`; `generatedAt` removed), new header/meta layout,
        original hand-authored inline SVG crest, `break-inside-avoid`.
  - [x] New `src/components/print/report-letterhead.test.tsx` (4 tests):
        full-props render, employee-without-role, `employeeName` omitted
        hides the Employee block but keeps Pay Period, zero `<img>`/one
        `<svg>`.
- [x] **Step 2: Propagate the prop rename to every call site**
  - [x] `payroll-print-dialog.tsx`, `payroll-workspace.tsx`:
        `documentType`/`period` → `reportTitle`/`periodName`.
  - [x] Fixed 6 resulting TypeScript errors (`npx tsc --noEmit`) one by
        one, then reconfirmed zero errors.
- [x] **Step 3: All-Employees Combined Statement**
  - [x] New `CombinedStatementTarget` type; `combined-statement-dialog.tsx`
        generalized from `neonUserId` prop to `target` prop, `statements`
        array state, `Promise.all` fetch keyed by a stringified
        `neonUserIdsKey` (avoids an infinite-refetch loop from a fresh
        array reference every render), partial-failure tracking, one
        `.print-page-break` per employee, scope-aware toolbar
        heading/subtitle.
  - [x] New `combinedStatementRosterFilename` in `src/lib/print-utils.ts`
        (`"Staff Payroll Statements <Mon> <Year>"`, distinct from
        `payrollRosterFilename`'s "Staff Payroll Report..."); `print-utils.test.ts`
        updated with a matching test.
  - [x] `attendance-report.tsx`: `statementTarget` state generalized to a
        3-member discriminated union (`single`/`all`/`null`); the
        "all"-scope Monthly Statement button always rendered now,
        branching label ("Monthly Statements (All)" vs "Monthly
        Statement")/`onClick`/`disabled` on `showingAll`.
  - [x] `payroll-workspace.tsx`'s own `<CombinedStatementDialog>` call
        site updated to `target={{ scope: "single", neonUserId: ... }}`.
  - [x] Fixed a real test failure in `payroll-workspace.test.tsx`
        (`screen.getByText("Mia Chen")` → `screen.getByText(/Mia Chen/)`)
        caused by the redesigned letterhead concatenating name+role into
        one text node.
  - [x] New `combined-statement-dialog.test.tsx` (4 tests): "all" scope
        parallel fetch + one page per employee + roster heading;
        partial-failure rendering + note; 100%-failure blocking error
        state; roster filename on print.
  - [x] Full gate: format/lint/typecheck clean, 325/325 unit tests
        (9 new, 1 fixed), build clean.
- [x] **Step 4: Live verification (demo mode, manager passcode 2468)**
  - [x] Single-employee Monthly Statement renders correctly under the
        redesigned letterhead (no regression).
  - [x] Selecting "All employees" relabels the button to "Monthly
        Statements (All)".
  - [x] Clicking it opens the dialog with exactly 5 `.print-page-break`
        sections (one per active demo employee), each independently
        correct (name, role, ID, period, Part 1/Part 2/signatures).
  - [x] Clicking Print sets `document.title` to exactly
        `"Staff Payroll Statements Sep 2026"`.
- [x] **Step 5: e2e regression sweep**
  - [x] Found and fixed a stale assertion in
        `tests/e2e/payroll-timesheet-overhaul.spec.ts` that looked for
        "The Monk's Indian Fusion - Webster" as a heading role -- that
        text moved to a plain right-aligned `<p>` in the redesign; the
        `<h1>` is now the short "The Monk's". Added an explicit
        heading-role assertion for the new `<h1>` alongside the existing
        plain-text check.
  - [x] Full Playwright suite re-run: 153/153 passing across
        desktop/host-tablet/server-mobile.
- [x] **Step 6: Documentation**
  - [x] New `docs/features/031-universal-letterhead-and-batch-statements.md`.
  - [x] Updated `docs/DESIGN_SYSTEM.md`'s letterhead section for the new
        layout/props.
  - [x] Updated `docs/STATUS.md` (Health Gate line, Current Status
        Overview, Feature Matrix row).
  - [x] This task file.
- [x] **Step 7: Final gate**
  - [x] `npm run check` clean.
  - [x] `npx vitest run` 44/44 files, 325/325 tests.
  - [x] `npm run build` clean.
  - [x] `npx playwright test` full suite 153/153 across 3 projects.
  - [x] `npm run db:test` -- skipped deliberately; confirmed via
        `git diff --stat main -- supabase/` that this branch touches no
        migration files.
- [x] **Step 8: Push + PR**
  - [x] Commit with clear, atomic commit message(s) (2 commits: code+
        tests, then docs).
  - [x] Push `feature/031-universal-letterhead-and-batch-statements`.
  - [x] Open PR against `main`.

## 🗂️ File List

- `src/components/print/report-letterhead.tsx`
- `src/components/print/report-letterhead.test.tsx` (new)
- `src/features/payroll/components/combined-statement-dialog.tsx`
- `src/features/payroll/components/combined-statement-dialog.test.tsx` (new)
- `src/features/payroll/components/payroll-print-dialog.tsx`
- `src/features/payroll/components/payroll-workspace.tsx`
- `src/features/payroll/components/payroll-workspace.test.tsx`
- `src/features/attendance/components/attendance-report.tsx`
- `src/lib/print-utils.ts`
- `src/lib/print-utils.test.ts`
- `tests/e2e/payroll-timesheet-overhaul.spec.ts`
- `docs/features/031-universal-letterhead-and-batch-statements.md` (new)
- `docs/DESIGN_SYSTEM.md`
- `docs/STATUS.md`
- `tasks/current-task.md`

## Current State & Next Step

Feature 031 is fully complete: implemented, unit-tested, live-verified,
regression-swept with the full Playwright suite, documented, committed
(2 commits: `99cc702` code+tests, `5d9a32e` docs), pushed, and opened as
[PR #30](https://github.com/KrapaGoutam/The-Lineup/pull/30) against
`main`. Nothing further pending on this branch.
