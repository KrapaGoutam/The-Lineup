# Feature 030 — Combined Timesheet & Payroll Statement, Option 1k Dashboard, and Staff Access Overhaul

**Name:** Combined Timesheet & Payroll Statement, Option 1k Dashboard, and Staff Access Overhaul  
**Owner:** Krapa Goutam  
**Status:** complete  
**Issue/PR:** https://github.com/KrapaGoutam/The-Lineup/pull/29

## Classification & Session Scope

- **Category:** FEATURE UPGRADE & ARCHITECTURAL POLISH
- **Modifies vs Adds:**
  - Modifies `src/components/restaurant-operations-app.tsx` (initial landing tab to Table Allocation, staff access to Payroll tab in real mode).
  - Modifies `src/components/ui/select.tsx`, `attendance-report.tsx`, and `attendance-month-nav.tsx` (dark mode dropdown contrast fix).
  - Modifies `src/features/payroll/` components to implement the Option 1k Dashboard layout (3 KPI cards, 2-column `1fr 360px` layout, initial avatars, `part-paid` status, and removal of redundant rate form).
  - Modifies `src/features/attendance/components/attendance-report.tsx` (corporate letterhead print templates, 1-employee pagination, signature lines).
  - Adds `src/features/payroll/actions/statement-actions.ts` (secure multi-tenant combined monthly statement server action).
  - Adds `src/features/payroll/components/combined-statement-dialog.tsx` (modal dialog and print stylesheet for monthly statements).
- **Contradiction Flags & Hard Boundaries:**
  - **TIPS AND PAYROLL ARE STRICTLY SEPARATE.** There are zero shared tables, zero shared ledgers, and zero cross-module derivations.
  - No payroll amount or balance may ever be derived from tips, and no tip calculation may ever read payroll data.
  - Multi-tenancy isolation: Regular staff can only fetch their own statements and view their own locked/paid periods.
  - Table rotation engine remains pure and deterministic.
- **Session Scope:** Multi-increment vertical feature build.

## User Outcome

1. **Immediate Operational Focus**: The restaurant operations app opens directly to the **Table Allocation** view (`"allocation"`) so host and manager staff immediately see active server rotations, seating queues, and floor plans upon passcode authentication.
2. **Accessible Form Controls**: Dropdowns across Attendance and filters maintain sharp text readability on dark surfaces with no unstyled light-mode inheritance.
3. **Executive Payroll Clarity (Option 1k)**:
   - Managers review payroll liabilities through 3 prioritized KPI cards, with the "Overall balance owed" emphasized in a primary accent container alongside "Owed this month" and "Owed last month".
   - A streamlined header toolbar provides single-click access to Settings > Pay Rates and a toggle for period generation.
   - The main workspace presents a 2-column layout: an expandable left-column ledger grouped by employee with colored initial avatars and period status badges (`Draft`, `Locked`, `Part-paid`, `Paid`), and a right-column compact balance overview with open month indicators.
4. **Staff Self-Service Transparency**: Regular non-manager staff (servers, hosts, bussers) in real mode have direct access to "My Payroll", enabling them to review their own locked/paid pay stubs and read-only ledgers without access to administrative actions or other employees' rates.
5. **Corporate Letterhead Timesheets**: Attendance records print cleanly on professional corporate letterhead ("The Monk's Indian Fusion - Webster") with an embedded, offline-safe inline SVG crest, calendar weekday logs, hours totals, and verification signature lines for employee and management sign-off. Print jobs for multiple staff automatically paginate with 1 employee per physical sheet, every downloaded PDF suggests a document-specific filename, and printed text is fully selectable/copiable.
6. **Combined Monthly Statement**: Managers and employees can generate an all-in-one Monthly Timesheet & Payroll Statement for any calendar month, uniting verified Neon clock-in hours with Supabase payroll calculations, adjustments, and disbursement transaction history under unified corporate letterhead.
7. **Payroll Batch Printing**: Managers can print statements for a whole roster (or any subset) for one month or every open month at once, one letterhead page per employee, from a single "Print Statements" dialog.

## Scope

### In

- **UI Bug Fixes**:
  - Dark mode contrast fix on native `<select>` and `<option>` elements across `select.tsx`, `attendance-report.tsx`, and `attendance-month-nav.tsx`.
  - Landing tab default updated to `"allocation"` in `restaurant-operations-app.tsx`.
  - Redundant `<RateSettings>` form removed from `PrivilegedPayrollView`, keeping Settings > Pay Rates as the single source of truth.
- **Option 1k Payroll Dashboard Overhaul**:
  - 3 executive KPI cards: `Overall balance owed` (accent container, large font), `This month` (with draft period indicator), and `Last month`.
  - Header toolbar with "Pay rates" navigation button and "Generate period" toggle button.
  - 2-Column layout (`xl:grid-cols-[1fr_360px]`):
    - Left column: Balances by person and month accordion, with initials avatar (deterministic color mapping), employee meta (`${role} · ${rate}/hr · N open months`), open balance, and sub-table with `Month`, `Hours`, `Gross`, `Paid`, `Month balance`, status badge (`Draft`, `Locked`, `Part-paid`, `Paid`), and period "Ledger" button.
    - Right column: Balance per person sidebar with open month pill list, overall balance total highlight box, and month visibility callout.
  - Extended domain logic: `derivePeriodStatus()` returns `"part-paid"` when `balanceCents > 0 && balanceCents < grossCents`.
- **Staff Read-Only Payroll Access**:
  - `payrollTab` enabled for regular staff when `!demoMode`.
  - `SelfPayrollView` component in `payroll-workspace.tsx` displaying "My Payroll" summary and read-only ledger.
  - Zero admin mutation controls (no period generation, no recording payments, no rate editing).
- **Corporate Letterhead Timesheet Print Templates**:
  - Shared `<ReportLetterhead>` component (`src/components/print/report-letterhead.tsx`): "The Monk's Indian Fusion - Webster" heading, an embedded inline SVG crest (never an external `<img>`), document type, employee name/role, reporting period, and generation timestamp.
  - Document header with Employee Name, Designation, Report Period, and Generation Timestamp.
  - Shift table with Date, Day of Week, Clock In, Clock Out, Total Hours, and Auto-closed notes.
  - Total hours summary and signature verification blocks (Employee Signature, Authorized Manager Signature).
  - CSS print pagination via the shared `.print-page-break` class (`src/app/globals.css`), not a per-component one.
- **Combined Monthly Timesheet & Payroll Statement**:
  - Server action `getCombinedMonthlyStatementAction` in `statement-actions.ts` querying Neon attendance and Supabase payroll periods/payments/adjustments.
  - Role-based authorization: staff can only fetch statements for their own linked user ID; managers can fetch statements for any active staff member.
  - Demo mode fallback using Neon demo user and attendance fixtures.
  - `CombinedStatementDialog` component displaying letterhead, attendance log, payroll wage computation, adjustment details, and disbursement history, complete with print stylesheet.
  - Integration triggers in Attendance report (single-user and all-user rows) and Payroll workspace (period ledger view).
- **Payroll Multi-Select Batch Print**:
  - New `PayrollPrintDialog` (`src/features/payroll/components/payroll-print-dialog.tsx`): month selector (a specific period or every open period regardless of month), employee scope (current/selected/all), one letterhead page per employee.
  - Entry points: a "Print Statements" button in the KPI toolbar (no preselection) and a per-person print icon in the grouped-periods list (pre-selects that person).
  - Reads only the already-fetched, already-RLS-scoped dashboard data -- no new server action.

### Out

- Modifying historical clock-in timestamps automatically (attendance remains read-only Neon data).
- Combining tip allocations into the payroll ledger (strict isolation preserved).
- Direct banking / ACH payment gateway integrations.

## Acceptance Criteria

- [x] Given a user signing in with any valid passcode, the application defaults to the **Table Allocation** tab.
- [x] Given attendance dropdowns viewed in dark mode, options display dark background and light text with clear contrast.
- [x] Given a manager on the Payroll tab, they see 3 KPI cards with `Overall balance owed` highlighted in an accent container, and the redundant pay rates form is absent from the page.
- [x] Given a period with a partial payment recorded, its status badge displays `Part-paid` in amber/warn tone.
- [x] Given a regular staff member signing in (real mode), they can click the Payroll tab and view their own locked/paid periods and ledger, with all admin mutation buttons omitted.
- [x] Given a manager printing timesheets for multiple employees, each employee's record prints on a separate page with corporate letterhead, "The Monk's" logo, and signature blocks.
- [x] Given a manager or employee clicking "Monthly Statement", a dialog opens showing unified attendance hours, hourly rate breakdown, gross pay, payments, and balance owed under restaurant letterhead.
- [x] Given an unauthorized employee attempting to fetch another user's monthly statement via server action, the action rejects with an authorization error.
- [x] Given all test suites, Vitest unit tests (40 files, 295 tests), TypeScript check (`npm run check`), production build (`npm run build`), and Playwright E2E tests (12/12) pass with zero warnings.
- [x] Given any print surface (Attendance timesheet, Payroll statement, Combined statement), the printed area contains zero raster `<img>` elements and at least one embedded inline SVG.
- [x] Given any print trigger, `document.title` is set to the correct filename convention at the moment `window.print()` is called, and restored afterward.
- [x] Given a single employee's Combined Monthly Statement, the printed content is structurally single (one letterhead heading, one embedded SVG) with no duplicate-page isolation mechanism (`visibility:hidden`/`position:absolute`) remaining in the code.
- [x] Given a manager on the Payroll tab, a "Print Statements" dialog lets them choose a month (or all open months) and an employee scope (current/selected/all), producing one letterhead page per employee.
- [x] Given the bug-fix pass's own full verification, Vitest unit tests (42 files, 316 tests), TypeScript check, production build, and the full Playwright suite (153/153, not just this feature's own specs) pass with zero warnings.

## Bug Fix Pass (found testing PR #29, fixed on the same branch)

Four live bugs were found testing this feature after the increments
above were built, and fixed in a second pass on the same branch/PR:

1. **Unreliable/non-copiable print output.** Root cause, confirmed by
   reading the code (not a canvas/`html2canvas` issue -- grepped the
   whole repo, zero matches): every print surface's letterhead embedded
   an **external, network-dependent raster `<img
src="https://www.monkswebster.com/...">`** with `crossOrigin=
"anonymous"`, which fails outright offline or against an
   unreachable/hotlink-blocked host. Fixed with one shared
   `<ReportLetterhead>` (`src/components/print/report-letterhead.tsx`)
   embedding an inline SVG crest directly in the JSX -- always renders,
   online or off. A shared `@media print` block in `globals.css`
   (`.print-timesheet-table`, `user-select: text`) also now guarantees
   selectable, high-contrast, hidden-line tables consistently across
   every print surface, replacing three separately hand-rolled ones.
2. **No dynamic PDF filename.** No code anywhere touched
   `document.title` before this pass -- every print trigger was a bare
   `window.print()`. New `src/lib/print-utils.ts`:
   `triggerPrintWithFilename(suggestedTitle)` sets `document.title`
   before printing and restores it on `afterprint` (with a fallback
   timeout), plus the 5 filename-building conventions (attendance
   roster/single, payroll roster/single with an "all open months"
   variant, combined statement).
3. **Duplicate 2-page print on a single-employee statement.** Root
   cause, confirmed reading `combined-statement-dialog.tsx` directly:
   its print isolation relied entirely on the `visibility: hidden` +
   `position: absolute` trick applied to a print area that was never
   `display: none` outside print -- `visibility: hidden` elements still
   occupy layout space, and combining that with `position: absolute` on
   the one visible island is a known Chrome print-pagination
   duplication class. The dialog's own `max-h-[92vh]`/`overflow` clamps
   were also never reset for print, an independent clipping risk. Fixed
   by removing the trick everywhere (also present, less severely, in
   the payroll ledger's single-statement print and duplicated inside
   Attendance's own `PrintableReport`) and standardizing on `hidden
print:block` for the print root + `print:hidden` on every on-screen
   chrome element, with explicit `print:` overrides resetting the
   dialog's size/overflow clamps.
4. **No payroll multi-select batch print.** Built from scratch:
   `PayrollPrintDialog`, reading only the dashboard's already-fetched,
   already-RLS-scoped period data -- see Scope above.

## UX Contract

- **Default Route / Tab:** `#allocation` ("Table Allocation").
- **Header Navigation:**
  - Desktop: Row 2 primary tabs (Schedule, Table Allocation, Tip Split) — divider — secondary tabs (Team if manager, Attendance, Payroll if not demo mode) — Settings.
  - Mobile: Bottom dock (Allocation, Tip Split, More). More sheet includes Schedule, Attendance, Payroll, Team (if manager), Settings, and Appearance.
- **Option 1k Dashboard:**
  - Header: Title "Payroll liability & balances", Subtitle "Review unpaid wages, grouped periods, and employee balances across open months.", Top-right "Pay rates" and "Generate period" buttons.
  - KPI Cards: 3 cards in grid (`lg:grid-cols-3`). Card 1 (Overall balance) styled with `bg-primary/10 border-primary/30 text-primary`.
  - Main Grid: 2 columns on `xl` screens (`grid-cols-1 xl:grid-cols-[1fr_360px]`).
- **Print Templates:**
  - Timesheet and Combined Statement use dedicated print stylesheets (`@media print`) rendering on clean white canvas with high-contrast borders and text.
  - Navigation bars, dialog overlays, close buttons, and interactive controls carry `print:hidden` / `no-print`.

## Data & Authorization

- **Attendance Data:** Read from Neon `attendance` and `users` via `src/features/attendance/data/attendance-data.ts`. Strict foreign key pairing via Supabase `attendance_identity_links`.
- **Payroll Data:** Read from Supabase `payroll_periods`, `payroll_payments`, `payroll_adjustments`, and `hourly_rates`.
- **Statement Authorization Rules:**
  - Manager / Owner (`is_manager = true` or `role IN ('manager', 'owner')`): Authorized to request statement for any employee in the organization.
  - Regular Staff (`is_manager = false`): Authorized ONLY to request statement where `neonUserId` maps to their own profile via `attendance_identity_links`. Attempting to fetch another user's statement returns `{ ok: false, error: "Unauthorized to view this employee's statement." }`.
  - Demo Mode: When `process.env.NEXT_PUBLIC_DEMO_MODE === "true"`, statement action uses mock fixtures `demoNeonUsers` and `demoNeonAttendance` to generate full-fidelity statements without requiring a live Supabase or Neon session.

## Implementation Map

- `src/components/restaurant-operations-app.tsx`: Changed default tab to `"allocation"`, enabled `payrollTab` for regular staff in real mode.
- `src/components/ui/select.tsx`: Added `bg-popover text-popover-foreground border-border [&>option]:bg-popover [&>option]:text-popover-foreground`.
- `src/lib/print-utils.ts` (new): `triggerPrintWithFilename`, `formatMonthYearShort`, the 5 filename-building conventions.
- `src/components/print/report-letterhead.tsx` (new): shared `ReportLetterhead`, embedded inline SVG crest.
- `src/app/globals.css`: shared `@media print` block (`.print-timesheet-table`, `.print-page-break`, `user-select: text`, app-shell hiding), replacing three separately hand-rolled ones.
- `src/features/attendance/components/attendance-report.tsx`:
  - Fixed select dropdown contrast.
  - `PrintableReport` uses `<ReportLetterhead>` and `.print-page-break`; the print-triggering effect routes through `triggerPrintWithFilename`.
  - Added "Monthly Statement" action buttons.
- `src/features/attendance/components/attendance-month-nav.tsx`: Fixed select dropdown contrast.
- `src/features/payroll/domain/payroll-balance-metrics.ts`: Added `"part-paid"` to `derivePeriodStatus()`.
- `src/features/payroll/components/payroll-kpi-cards.tsx`: Overhauled to 3-card Option 1k layout with toolbar; added the "Print Statements" button.
- `src/features/payroll/components/payroll-period-groups.tsx`: Option 1k person accordion with initials avatar, role/rate meta, status badges, Ledger button, and a per-person print icon.
- `src/features/payroll/components/payroll-balance-panel.tsx`: Option 1k compact balance sidebar with open months and highlight total.
- `src/features/payroll/components/payroll-print-dialog.tsx` (new): multi-select batch payroll print dialog.
- `src/features/payroll/components/payroll-workspace.tsx`:
  - Removed `<RateSettings>` from `PrivilegedPayrollView`.
  - Wired `showGenerateForm` toggle, the print dialog's open/close state, and the 2-column layout.
  - Polished `SelfPayrollView` for "My Payroll" view with no admin mutations.
  - Added "Monthly Statement" trigger button and `<ReportLetterhead>` to the period ledger panel's own single-statement print.
- `src/features/payroll/actions/statement-actions.ts`: Implemented `getCombinedMonthlyStatementAction`.
- `src/features/payroll/components/combined-statement-dialog.tsx`: Implemented statement modal with `<ReportLetterhead>`; print isolation via `hidden print:block`/`print:hidden` (no visibility/position trick).

## Test Plan & Quality Gates

- **Unit & Domain Tests:**
  - `src/lib/print-utils.test.ts` (new, 13 tests): every filename convention, `triggerPrintWithFilename`'s title-set/restore/fallback-timeout behavior.
  - `src/features/payroll/domain/payroll-balance-metrics.test.ts`: Verified `part-paid` status derivation alongside `draft`, `locked`, and `paid`.
  - `src/features/payroll/actions/statement-actions.test.ts`: Verified authorization enforcement, attendance aggregation, and demo mode fallbacks.
  - `src/features/payroll/components/payroll-workspace.test.tsx`: Verified `SelfPayrollView` rendering, `PrivilegedPayrollView` Option 1k elements, `CombinedStatementDialog`, and `PeriodLedgerPanel`'s single-statement print (letterhead + dynamic filename).
  - `src/features/payroll/components/payroll-print-dialog.test.tsx` (new, 7 tests): default scope, roster print, pre-selected single-employee print, "all open months" filtering, both refusal paths, one letterhead per printed page. Payroll's own e2e coverage stops here on purpose -- see below.
- **E2E Tests:**
  - `tests/e2e/dashboard.spec.ts`: Updated to verify initial landing on Table Allocation and tab transitions.
  - `tests/e2e/attendance-reporting.spec.ts`: Fixed a real regression the bug-fix pass introduced -- 3 pre-existing tests asserted `printCallCount` synchronously right after a print click, which now loses the race against `triggerPrintWithFilename`'s internal `setTimeout`; added a poll helper and converted all 6 call sites.
  - `tests/e2e/payroll-timesheet-overhaul.spec.ts`: Rewritten against every bug fix (the old raster `<img>` assertion, the old `.employee-timesheet` class, the old letterhead text, and the same `printCallCount` race) -- 5 tests across desktop, tablet, and mobile verifying default landing tab, dropdown contrast, single- and roster-attendance print (letterhead, zero raster images, one SVG, `.print-page-break` count, dynamic filename), and the combined statement's single-page structure + dynamic filename. Payroll's own batch print dialog has no e2e coverage on purpose: Payroll stays `!demoMode`-gated (unchanged since Feature 020) and this whole suite runs against `NEXT_PUBLIC_DEMO_MODE=true`, so there is no demo-mode path to the tab at all -- covered instead by `payroll-print-dialog.test.tsx`'s Vitest suite, the same precedent Feature 020/026 already set for every other payroll-only surface.
- **Verification Gate (bug fix pass):**
  - `npm run check` (0 errors, 0 warnings).
  - `npm test` (42 test files, 316 vitest unit tests passing).
  - `npm run build` (production build succeeds with all static routes).
  - `npx playwright test` (full suite, 153/153 passing across desktop/host-tablet/server-mobile, not just the two specs touched in this pass).
