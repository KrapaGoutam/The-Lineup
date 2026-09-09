# Feature 033 — Print Layout Hardening, Isolation, and Duplex Pagination

**Name:** Print Layout Hardening, Isolation, and Duplex Pagination
**Owner:** Krapa Goutam
**Status:** shipped
**Issue/PR:** (branch `feature/033-print-layout-hardening-duplex`, opened off `main` after Feature 032 / PR #31)

## Classification & Session Scope

- **Category:** BUG FIX + STRUCTURAL PAGINATION CHANGE (print CSS +
  three print surfaces).
- **Modifies vs Adds:**
  - Modifies `src/app/globals.css`: adds the missing `@page` rule,
    compacts `.print-timesheet-table` cell padding/font size.
  - Modifies `src/features/attendance/components/attendance-report.tsx`:
    isolates every screen-only render branch behind `print:hidden`, and
    compacts `PrintableReport`'s per-employee page (removes a forced
    `min-h-[98vh]`, tightens padding/margins, docks the signature block).
  - Modifies `src/features/payroll/components/payroll-print-dialog.tsx`:
    compacts its per-employee page padding.
  - Modifies `src/features/payroll/components/combined-statement-dialog.tsx`:
    restructures each employee's statement from one page into two flat
    `.print-page-break` pages (Attendance, then Payroll + signatures)
    for duplex printing.
  - Modifies two existing Vitest files and one Playwright spec whose
    assertions assumed the old one-page-per-employee combined-statement
    shape.
- **Contradiction Flags & Hard Boundaries (read before extending this):**
  the original request's Step 1 asked for a literal
  `visibility: hidden !important` + `position: absolute !important`
  `.print-report-container` isolation mechanism. This codebase's own
  print CSS (added in Feature 030's bug-fix pass) already rejected that
  exact approach in its own header comment, calling it "a known cause
  of duplicate/blank-page print bugs," in favor of `hidden print:block`
  / `print:hidden` (Tailwind), which removes hidden content from layout
  entirely instead of just visually hiding it in place. Re-introducing
  the literal spec'd mechanism would have undone that prior fix for no
  benefit -- the isolation gaps this feature actually found ("Dashboard
  Leak") were fixable by extending the _existing_ pattern to two
  screen-wrapper divs that had never been marked `print:hidden`, not by
  replacing the pattern itself. See "Decisions and risks" below.
- **Session Scope:** single bounded feature, no schema/API/authorization
  changes -- print CSS and print-surface JSX only.

## User outcome

Printing from Attendance, Payroll, or the Combined Monthly Statement no
longer leaks the app's live dashboard above the report, no longer
produces a trailing blank page, and the single-employee Attendance and
Payroll reports fit on exactly one page for a standard pay period. The
Combined Monthly Statement now produces a strict two physical pages per
employee (Page 1: Attendance, Page 2: Payroll) so a duplex/back-to-back
print job puts each employee on their own two-sided sheet.

## What the audit actually found (read before trusting the original bug list)

The original request described four bugs and named specific files/CSS
to fix them. Auditing against the real code before writing anything
found three of the four premises wrong in some way:

1. **"Dashboard Leak" -- real, but not where the spec pointed.**
   `src/features/attendance/components/attendance-report.tsx`'s own
   screen-only render branches (`self` scope and `all` scope) had _no_
   `print:hidden` anywhere (confirmed by grep before any fix) -- so
   printing while attendance is open genuinely printed the dashboard
   tiles/buttons/tables above the letterhead. `payroll-workspace.tsx`,
   `payroll-print-dialog.tsx`, and `combined-statement-dialog.tsx` were
   already correctly isolated (each already used `print:hidden` on its
   own screen chrome, predating this feature) -- so the fix is scoped
   to the one file that actually had the gap, not a blanket rewrite.
2. **"Trailing Blank Page" -- already fixed.** `.print-page-break` /
   `.print-page-break:last-child` in `globals.css` already implement
   exactly this, added in Feature 030's bug-fix pass. Nothing to add
   here; only re-verified it still holds after the Combined Statement
   restructuring below (both duplex pages had to stay flat siblings for
   `:last-child` to keep identifying only the true final page).
3. **"Spilling over 1 page" -- real.** `PrintableReport` in
   `attendance-report.tsx` forced `min-h-[98vh]` on every employee's
   page (guaranteeing it would try to fill almost the whole viewport
   height, which in a print context pushes real content into overflow
   rather than ever helping), on top of generous `p-10` padding and an
   `mt-8 pt-6` gap before the signature block. `payroll-print-dialog.tsx`
   had no signature block at all (contrary to the spec's assumption)
   but the same `p-10` padding.
4. **Combined Statement file path was wrong.** The spec named
   `src/components/reports/combined-statement-dialog.tsx`, which does
   not exist. The real, actively-used file is
   `src/features/payroll/components/combined-statement-dialog.tsx`.

## Scope

### In

- `@page { size: letter portrait; margin: 8mm 8mm 6mm 8mm; }` added to
  `globals.css` -- this rule genuinely did not exist before; the
  browser default page margin is most of why single-employee reports
  were spilling onto a second page.
- `.print-timesheet-table` cell padding tightened (`6px 10px` →
  `3px 8px`) and font size trimmed (`10.5pt` → `9.5pt`) for the same
  reason.
- `attendance-report.tsx`: every screen-only return branch (`accessError`,
  `!access` loading, `unlinked`, the `all`-scope users-loading/error
  branch, and the real `self`/`all` scope content) is now wrapped in
  `print:hidden`. For the `self`/`all` scope branches specifically, the
  wrapper is a _sibling_ of `CombinedStatementDialog` and
  `PrintableReport`, not their ancestor -- an ancestor with
  `print:hidden` would hide those print-only descendants too, since a
  parent's `display: none` always wins over a child's own
  `print:block`.
- `attendance-report.tsx`'s `PrintableReport`: removed the forced
  `min-h-[98vh]`, `p-10` → `p-6`, KPI grid `my-4` → `my-2`, and the
  signature block `mt-8 pt-6` → `mt-2 pt-3` plus `break-inside-avoid`
  so it can't itself split across a page boundary.
- `payroll-print-dialog.tsx`'s per-employee page: `p-10` → `p-6`.
- `combined-statement-dialog.tsx`: each employee's statement is now
  `statements.flatMap(...)`-produced as two flat `.print-page-break`
  divs -- "Page 1 of 2: Attendance" (full letterhead + Part 1) and
  "Page 2 of 2: Payroll" (full letterhead + Part 2 + signatures, now
  `mt-3 pt-3` + `break-inside-avoid` instead of `mt-8 pt-6`) -- instead
  of one page containing both parts. Both pages repeat the full
  letterhead so either physical sheet stands alone if separated.
- Two Vitest files (`combined-statement-dialog.test.tsx`,
  `payroll-workspace.test.tsx`) and one Playwright spec
  (`payroll-timesheet-overhaul.spec.ts`) updated: assertions that
  expected the letterhead/employee-name text node exactly once per
  statement now correctly expect it twice (once per duplex page), and
  the Playwright spec adds an explicit `.print-page-break` count
  assertion (`toHaveCount(2)`) as the duplex architecture's own
  structural signature.

### Out

- No change to the underlying isolation _strategy_ -- still
  `hidden print:block` / `print:hidden`, never
  `visibility:hidden`/`position:absolute`. See "Decisions and risks."
- No change to any data-fetching, authorization, or API surface --
  this is print CSS and print-surface JSX only.
- No change to `payroll-workspace.tsx`'s own screen/print split, which
  was already correct (audited, not modified).
- No new e2e spec file -- the existing print-focused specs already
  cover the surfaces this feature touches; they were extended in place
  rather than duplicated.

## Acceptance Criteria

- [x] Given the Attendance tab (any scope) with a print job active, the
      live dashboard/nav/buttons never render above or alongside the
      printed report (`print:hidden` sibling-wrapper fix).
- [x] Given any roster-style print job (Attendance's `PrintableReport`,
      the Payroll batch dialog, or the Combined Statement), no trailing
      blank page follows the last employee (`.print-page-break:last-child`,
      re-verified after the duplex restructuring).
- [x] Given a standard pay period, a single employee's Attendance print
      and a single employee's Payroll print each fit on exactly one
      physical page -- confirmed by rendering the real paginated PDF
      (`page.pdf({ preferCSSPageSize: true })`) and counting pages, not
      by DOM inspection alone.
- [x] Given the Combined Monthly Statement for one employee, the output
      is exactly two physical pages (Page 1: Attendance, Page 2:
      Payroll) as flat siblings, so duplex/back-to-back printing puts
      each employee on their own two-sided sheet -- confirmed the same
      way (2 pages, verified live).
- [x] Given the full quality gate, `npm run check` (0 errors/warnings),
      the full Vitest suite (325/325, unchanged count -- only existing
      assertions updated), and the two print-related Playwright specs
      (30/30 across desktop/host-tablet/server-mobile) all pass.

## Implementation Map

- `src/app/globals.css`: `@page` rule added; `.print-timesheet-table`
  padding/font-size compacted; header comment extended to note the
  Feature 033 pass without disturbing the Feature 030 isolation-strategy
  explanation it builds on.
- `src/features/attendance/components/attendance-report.tsx`:
  `print:hidden` added to five return branches' wrappers;
  `PrintableReport`'s per-employee page compacted (padding, KPI-grid
  margin, signature-block spacing + `break-inside-avoid`, removed
  `min-h-[98vh]`).
- `src/features/payroll/components/payroll-print-dialog.tsx`: per-employee
  page padding compacted (`p-10` → `p-6`).
- `src/features/payroll/components/combined-statement-dialog.tsx`: the
  single per-employee `.map` replaced with a `.flatMap` producing two
  flat `.print-page-break` pages per employee; signature block spacing
  compacted.
- `src/features/payroll/components/combined-statement-dialog.test.tsx`,
  `src/features/payroll/components/payroll-workspace.test.tsx`,
  `tests/e2e/payroll-timesheet-overhaul.spec.ts`: assertions updated
  for the new duplex 2-page-per-employee shape.

## Test Plan & Quality Gates

- **Unit Tests:** full Vitest suite re-run, 44/44 files, 325/325 tests
  passing (same count as before this feature -- only existing
  assertions in `combined-statement-dialog.test.tsx` and
  `payroll-workspace.test.tsx` were updated to expect the letterhead
  text twice, once per duplex page, plus a `.print-page-break` count
  bumped from 3 to 6 for a 3-employee roster).
- **E2E Tests:** `attendance-reporting.spec.ts` (unchanged, 12/12) and
  `payroll-timesheet-overhaul.spec.ts` (one test updated for the duplex
  shape, adding an explicit `.print-page-break` count assertion) --
  30/30 passing across desktop/host-tablet/server-mobile.
- **Manual/PDF verification (page counts can't come from Playwright DOM
  assertions -- pagination is invisible to the DOM):** a one-off script
  drove a real signed-in session in demo mode and called
  `page.pdf({ preferCSSPageSize: true })` -- which runs the actual
  Chromium print/pagination pipeline, the same one a real print job
  uses -- then counted `/Type /Page` objects in the resulting PDF bytes:
  - Attendance, single employee, standard period: **1 page**.
  - Combined Monthly Statement, single employee: **2 pages**.
  - Attendance, "All employees" (5 active demo employees): **5 pages**
    (one per employee, no extra trailing page).
  - A full-page screenshot of the "All employees" print output was also
    taken with `page.emulateMedia({ media: "print" })` and visually
    confirmed: the report starts directly at the letterhead with no
    dashboard tiles, buttons, or nav above it.
- **Verification Gate:**
  - `npm run check` (0 errors, 0 warnings).
  - `npx vitest run` (44 files, 325/325).
  - `npx playwright test tests/e2e/attendance-reporting.spec.ts tests/e2e/payroll-timesheet-overhaul.spec.ts`
    (30/30 across desktop/host-tablet/server-mobile).

## Decisions and risks

- **Decision: kept the existing `hidden print:block` isolation
  strategy instead of the spec's literal `visibility:hidden` +
  `position:absolute` `.print-report-container` mechanism.** The
  spec's Step 1 instructions described a real, common print-isolation
  pattern -- but this exact codebase already tried something in that
  family and documented, in `globals.css`'s own header comment, that it
  causes duplicate/blank-page bugs (elements that are only visually
  hidden still occupy layout, which is exactly the kind of thing that
  produces an extra blank page or duplicated content once print
  pagination gets involved). Re-implementing it here would have risked
  reintroducing that same bug class while "fixing" a Dashboard Leak that
  had a much narrower root cause: two specific screen-wrapper `<div>`s
  in one file that had simply never been given the `print:hidden` class
  every other print surface already uses. Extending the proven pattern
  to those two gaps, plus adding the genuinely-missing `@page` margin
  rule, satisfies the same user-facing acceptance criteria (no leak, no
  blank page, tight margins) without the regression risk. This mirrors
  Feature 035's "anonymize, don't hard-delete" precedent from this same
  session: when a literal instruction conflicts with an already-fixed,
  documented architectural decision, the fix targets the actual root
  cause under the existing architecture rather than reverting it.
- **Decision: both duplex pages repeat the full letterhead.** A
  physical duplex sheet's two sides can end up separated (stapled
  elsewhere, one side lost) -- each page states which employee, which
  pay period, and which half ("Page 1 of 2: Attendance" / "Page 2 of 2:
  Payroll") it is, rather than assuming the pair stays together.
- **Risk/mitigation:** the duplex restructuring changes what "the
  combined statement" means in the DOM (two elements per employee
  instead of one) for anything that queries `#combined-statement-print-area`
  by child count or by the letterhead's text content exactly once.
  Both existing consumers of that assumption (a Vitest file and a
  Playwright spec) were found and updated in this same change; any
  future addition to that print area should keep the two pages as flat
  siblings (not nested under a shared per-employee wrapper), since
  `.print-page-break:last-child` in `globals.css` depends on that
  flatness to correctly suppress a trailing blank page only after the
  batch's true last page.
