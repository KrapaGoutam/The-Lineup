# Feature 031 — Universal Letterhead Redesign & All-Employees Statement Printing

**Name:** Universal Letterhead Redesign & All-Employees Statement Printing
**Owner:** Krapa Goutam
**Status:** shipped
**Issue/PR:** (branch `feature/031-universal-letterhead-and-batch-statements`, opened off `main` after Feature 030 / PR #29 merged)

## Classification & Session Scope

- **Category:** UI POLISH & BATCH PRINTING CAPABILITY
- **Modifies vs Adds:**
  - Rewrites `src/components/print/report-letterhead.tsx` to match a
    reference document's layout exactly, replacing the Feature 030
    letterhead shape (full org-name `<h1>` + "Generated" timestamp)
    with a new one (short "The Monk's" `<h1>` + right-aligned contact
    block, no timestamp, optional employee block).
  - Generalizes `src/features/payroll/components/combined-statement-dialog.tsx`
    from single-employee-only to single-or-all-employees via a new
    `CombinedStatementTarget` discriminated union prop.
  - Adds a "Monthly Statements (All)" entry point in
    `src/features/attendance/components/attendance-report.tsx`'s
    "All employees" scope.
  - Adds `combinedStatementRosterFilename` to `src/lib/print-utils.ts`.
- **Contradiction Flags & Hard Boundaries:** none new -- inherits every
  boundary from Feature 030 (tips/payroll isolation, statement
  authorization rules) unchanged; this feature only touches
  presentation and batch iteration over the existing, already-
  authorized `getCombinedMonthlyStatementAction`.
- **Session Scope:** single bounded technical spec, given directly by
  the user with complete acceptance criteria (no discovery/planning
  round needed).

## User outcome

1. Every printed report (Attendance timesheet, Payroll statement,
   Combined statement) shares one letterhead component whose layout
   matches the reference PDF exactly: logo + "The Monk's" + report
   title on the left, full restaurant name/address/site on the right,
   and an Employee / Pay Period meta row beneath.
2. The letterhead's logo is an inline SVG, not a raster image pointed
   at an external site -- it renders identically online, offline, and
   in every browser's print-preview sandbox.
3. From Attendance's "All employees" filter, a manager can generate
   and print the Monthly Timesheet & Payroll Statement for every
   active employee in one action, with each employee's statement
   starting on its own page and the whole batch downloading/printing
   under one roster filename.

## Scope

### In

- **`<ReportLetterhead>` redesign** (`src/components/print/report-letterhead.tsx`):
  - Props: `reportTitle`, `periodName`, optional `employeeName` /
    `employeeRole`. The `generatedAt` timestamp prop from Feature 030
    is removed entirely -- the reference layout has no "Generated" row.
  - Header: inline SVG mark + short "The Monk's" `<h1>` + `reportTitle`
    on the left; "The Monk's Indian Fusion - Webster" / "Webster, New
    York" / "monkswebster.com" as a plain right-aligned contact block
    (not a heading).
  - Meta row: "Employee" label + name(role) on the left -- omitted
    entirely when `employeeName` is not passed, so an all-staff summary
    table can render the letterhead with no single employee to name --
    and "Pay Period" + `periodName` on the right.
  - `break-inside-avoid` on the outer wrapper so the banner never
    splits across a page break.
  - Inline SVG mark: an original, hand-authored monochrome hooded-
    silhouette crest. No "Monk's" brand SVG asset exists anywhere in
    this repository, and `monkswebster.com` is a real, unrelated
    external business's site -- there was nothing to literally
    "extract paths from," and scraping a real business's trademarked
    logo would be inappropriate regardless. Documented directly in the
    component's own header comment.
- **All-Employees Combined Statement** (`combined-statement-dialog.tsx`):
  - New exported `CombinedStatementTarget` type:
    `{ scope: "single"; neonUserId: number } | { scope: "all"; neonUserIds: number[] }`.
  - `statements` state generalized to `CombinedMonthlyStatement[] | null`
    (length 1 for single, N for all), fetched via `Promise.all` over
    the existing `getCombinedMonthlyStatementAction` -- reused N times
    in parallel, no new server action.
  - Partial-failure handling: if some employees' fetches fail while
    others succeed, the successful ones still render, with a
    `text-destructive text-xs print:hidden` note reporting how many
    were skipped. Only a 100%-failure case blocks the dialog with an
    error state.
  - Each statement renders inside its own
    `<div className="print-page-break statement-page ...">` with its
    own `<ReportLetterhead>` call -- one page per employee.
  - Toolbar heading/subtitle reflect scope: "Monthly Statements — All
    Employees" + "— N employees" for the batch case, plain "Monthly
    Statement" for the single case.
- **Entry point** (`attendance-report.tsx`): the "all"-scope Monthly
  Statement button, previously hidden entirely whenever the "All
  employees" filter was active, is now always rendered. It targets
  every `sortedActiveUsers` id and reads "Monthly Statements (All)"
  when the filter is "All employees"; otherwise it targets just the
  active person and reads "Monthly Statement", unchanged from before.
- **Filename convention** (`src/lib/print-utils.ts`):
  `combinedStatementRosterFilename(year, month)` →
  `"Staff Payroll Statements <Mon> <Year>"`. Deliberately distinct
  wording from the existing `payrollRosterFilename`'s "Staff Payroll
  Report..." (a different document -- the payroll-only batch print
  from Feature 030). `printStatements()` in the dialog branches on
  `statements.length === 1` (single-employee convention) vs. multi
  (this new roster convention).

### Out

- No new server action -- the batch fetch reuses
  `getCombinedMonthlyStatementAction` N times via `Promise.all`,
  consistent with every prior "reuse existing, already-authorized
  infra" decision in this codebase (same approach `PayrollPrintDialog`
  took in Feature 030).
- No change to statement authorization rules, tips/payroll isolation,
  or any Payroll-tab-only surface (`PayrollPrintDialog`,
  `payroll-workspace.tsx`'s own single-statement print) beyond the
  mechanical `documentType`/`period` → `reportTitle`/`periodName` prop
  rename required by the shared component's new signature.

## Acceptance Criteria

- [x] Given any print surface, the letterhead renders logo + "The
      Monk's" + report title on the left and the full restaurant
      name/address/site on the right, matching the reference layout.
- [x] Given the letterhead, the crest is an inline `<svg>` element --
      zero `<img>` tags anywhere in the printed area.
- [x] Given a summary/all-staff context, `<ReportLetterhead>` with no
      `employeeName` prop renders with the "Employee" block fully
      absent, while "Pay Period" still renders correctly.
- [x] Given a manager on Attendance with "All employees" selected,
      clicking "Monthly Statements (All)" opens a dialog with one
      statement per active employee, each on its own
      `.print-page-break` page.
- [x] Given some employees' statement fetches fail while others
      succeed, the dialog still renders the successful statements with
      a note naming how many were skipped; only total failure blocks
      the dialog.
- [x] Given the "All Employees" dialog's Print button, `document.title`
      is set to `"Staff Payroll Statements <Mon> <Year>"` at print
      time, distinct from both the single-statement convention and the
      payroll-only roster convention.
- [x] Given the single-employee statement flow (unchanged entry
      points), it continues to work with the redesigned letterhead --
      no regression.
- [x] Given the full quality gate, `npm run check` (0 errors/warnings),
      the full Vitest suite (325/325), `npm run build`, and the full
      Playwright suite (153/153 across desktop/host-tablet/server-
      mobile) all pass.

## UX Contract

- **Entry point:** Attendance tab → Employee filter → "All employees"
  → "Monthly Statements (All)" button (previously this button did not
  exist in the "all" scope at all).
- **Desktop / host tablet / server mobile:** the dialog itself is
  unchanged in structure from Feature 030's single-employee
  `CombinedStatementDialog` -- same modal chrome, same scroll/print
  overrides -- just now iterating over N statements instead of always
  exactly 1.
- **Loading:** "Generating statement…" / "Collating attendance logs
  and payroll ledger" -- unchanged copy, now covers the batch fetch too.
- **Partial failure:** successful statements render normally; a small
  `print:hidden` destructive-toned note above them states how many
  could not be generated.
- **Total failure:** the same blocking error state as the single-
  employee path, with a Close button.
- **Print/PDF:** print button label unchanged ("Print"); the resulting
  document's suggested filename is the new roster convention for N > 1,
  the existing single-employee convention for N === 1.

## Data & Authorization

Unchanged from Feature 030. The "all" scope's `neonUserIds` list is
built client-side from `sortedActiveUsers` (already the caller's own
authorized, already-fetched active-employee list); each id is passed
through the same `getCombinedMonthlyStatementAction` authorization
path individually (manager/owner may fetch any employee, regular staff
may only fetch their own linked id -- unreachable here anyway, since
the "all" scope button is only ever shown inside the manager-only "All
employees" attendance filter).

## Implementation Map

- `src/components/print/report-letterhead.tsx`: full rewrite -- new
  props (`reportTitle`/`periodName`, optional `employeeName`/
  `employeeRole`, no `generatedAt`), new header/meta layout, new inline
  SVG mark, `break-inside-avoid`.
- `src/lib/print-utils.ts`: added `combinedStatementRosterFilename`.
- `src/features/payroll/components/combined-statement-dialog.tsx`:
  `CombinedStatementTarget` type; `target` prop replaces
  `neonUserId`; `statements` array state + `Promise.all` fetch +
  partial-failure tracking; per-statement `.print-page-break` map;
  scope-aware toolbar heading/subtitle; `printStatements()` filename
  branch.
- `src/features/attendance/components/attendance-report.tsx`:
  `statementTarget` state generalized to a 3-member discriminated
  union (`single` / `all` / `null`); the "all"-scope Monthly Statement
  button always rendered, branching label/onClick/disabled on
  `showingAll`.
- `src/features/payroll/components/payroll-print-dialog.tsx`,
  `payroll-workspace.tsx`: mechanical `documentType`/`period` →
  `reportTitle`/`periodName` prop rename only, to match
  `ReportLetterheadProps`'s new field names; `payroll-workspace.tsx`'s
  own `<CombinedStatementDialog>` call site updated to
  `target={{ scope: "single", neonUserId: ... }}`.

## Test Plan & Quality Gates

- **Unit & Component Tests:**
  - `src/components/print/report-letterhead.test.tsx` (new, 4 tests):
    full-props render (title, contact block, employee+role, pay
    period), employee-without-role rendering, `employeeName` omitted
    hides the Employee block but keeps Pay Period, zero `<img>` / one
    `<svg>` in the printed markup.
  - `src/features/payroll/components/combined-statement-dialog.test.tsx`
    (new, 4 tests): "all" scope fetches every id in parallel and
    renders one `.print-page-break` per employee with the roster
    heading/subtitle; partial-failure rendering + note; 100%-failure
    blocking error state; roster filename convention on print.
  - `src/features/payroll/components/payroll-workspace.test.tsx`:
    updated to the new `target` prop shape; fixed an assertion that
    broke because the redesigned letterhead now concatenates employee
    name + role into one text node.
  - `src/lib/print-utils.test.ts`: added a test for
    `combinedStatementRosterFilename`.
- **E2E Tests:**
  - `tests/e2e/payroll-timesheet-overhaul.spec.ts`: fixed a stale
    assertion that looked for "The Monk's Indian Fusion - Webster" as
    a heading role -- that text moved to a plain right-aligned `<p>`
    in the redesign; the `<h1>` is now the short "The Monk's". Added an
    explicit assertion for the new `<h1>` alongside the existing
    plain-text check for the contact block.
  - Full suite re-run (153/153) confirms no other spec referenced the
    old letterhead structure.
- **Verification Gate:**
  - `npm run check` (0 errors, 0 warnings).
  - `npx vitest run` (44 files, 325 tests passing -- up from 316 before
    this feature's 9 new tests, net of 1 fixed pre-existing test).
  - `npm run build` (production build succeeds).
  - `npx playwright test` (full suite, 153/153 across desktop/host-
    tablet/server-mobile).
  - Manual live verification in demo mode (manager passcode 2468):
    single-employee statement renders correctly under the new
    letterhead; selecting "All employees" relabels the button to
    "Monthly Statements (All)"; clicking it produces exactly 5
    `.print-page-break` sections (one per active demo employee), each
    correct; Print sets `document.title` to exactly
    `"Staff Payroll Statements Sep 2026"`.

## Decisions and risks

- **Decision:** no source "Monk's" SVG logo exists anywhere in this
  repo, and `monkswebster.com` is a real, unrelated external business
  -- rather than attempt to scrape that site's actual logo (both
  infeasible from this codebase and inappropriate for a real business's
  trademarked mark regardless of feasibility), an original, simple
  monochrome vector crest was hand-authored instead, with the reasoning
  documented directly in the component's own header comment.
- **Decision:** batch statement fetching reuses the existing
  `getCombinedMonthlyStatementAction` N times via `Promise.all` rather
  than adding a new batch-shaped server action, keeping authorization
  logic in exactly one place and matching the precedent
  `PayrollPrintDialog` already set in Feature 030.
- **Risk/mitigation:** a large "all employees" roster fetches N
  requests in parallel on dialog open; at current restaurant-scale
  employee counts (single digits to low tens) this is negligible, but
  a very large roster could warrant batching/paginating the requests
  in a future revision if this pattern is reused for a much bigger
  organization.
