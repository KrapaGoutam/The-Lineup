# Feature 030 — Combined Timesheet & Payroll Statement, Option 1k Dashboard, and Staff Access Overhaul

**Name:** Combined Timesheet & Payroll Statement, Option 1k Dashboard, and Staff Access Overhaul  
**Owner:** Krapa Goutam  
**Status:** complete  
**Issue/PR:** https://github.com/KrapaGoutam/The-Lineup/pull/30

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
5. **Corporate Letterhead Timesheets**: Attendance records print cleanly on professional corporate letterhead featuring "The Monk's" official logo (`https://www.monkswebster.com/assets/img/logo-light.png`), restaurant contact details, calendar weekday logs, hours totals, and verification signature lines for employee and management sign-off. Print jobs for multiple staff automatically paginate with 1 employee per physical sheet.
6. **Combined Monthly Statement**: Managers and employees can generate an all-in-one Monthly Timesheet & Payroll Statement for any calendar month, uniting verified Neon clock-in hours with Supabase payroll calculations, adjustments, and disbursement transaction history under unified corporate letterhead.

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
  - Official "The Monk's" logo (`https://www.monkswebster.com/assets/img/logo-light.png`) housed in a `#0b0b0d` dark contrast container.
  - Restaurant metadata: Address, Phone, Email, Tax ID.
  - Document header with Employee Name, Designation, Report Period, and Generation Timestamp.
  - Shift table with Date, Day of Week, Clock In, Clock Out, Total Hours, and Auto-closed notes.
  - Total hours summary and signature verification blocks (Employee Signature, Authorized Manager Signature).
  - CSS print pagination: `@media print { .employee-timesheet { page-break-after: always; break-after: page; } .employee-timesheet:last-child { page-break-after: auto; break-after: auto; } }`.
- **Combined Monthly Timesheet & Payroll Statement**:
  - Server action `getCombinedMonthlyStatementAction` in `statement-actions.ts` querying Neon attendance and Supabase payroll periods/payments/adjustments.
  - Role-based authorization: staff can only fetch statements for their own linked user ID; managers can fetch statements for any active staff member.
  - Demo mode fallback using Neon demo user and attendance fixtures.
  - `CombinedStatementDialog` component displaying letterhead, attendance log, payroll wage computation, adjustment details, and disbursement history, complete with print stylesheet.
  - Integration triggers in Attendance report (single-user and all-user rows) and Payroll workspace (period ledger view).

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
- `src/features/attendance/components/attendance-report.tsx`:
  - Fixed select dropdown contrast.
  - Corporate Letterhead print template with "The Monk's" logo and signature lines.
  - 1-employee pagination CSS (`.employee-timesheet { page-break-after: always; break-after: page; }`).
  - Added "Monthly Statement" action buttons.
- `src/features/attendance/components/attendance-month-nav.tsx`: Fixed select dropdown contrast.
- `src/features/payroll/domain/payroll-balance-metrics.ts`: Added `"part-paid"` to `derivePeriodStatus()`.
- `src/features/payroll/components/payroll-kpi-cards.tsx`: Overhauled to 3-card Option 1k layout with toolbar.
- `src/features/payroll/components/payroll-period-groups.tsx`: Option 1k person accordion with initials avatar, role/rate meta, status badges, and Ledger button.
- `src/features/payroll/components/payroll-balance-panel.tsx`: Option 1k compact balance sidebar with open months and highlight total.
- `src/features/payroll/components/payroll-workspace.tsx`:
  - Removed `<RateSettings>` from `PrivilegedPayrollView`.
  - Wired `showGenerateForm` toggle and 2-column layout.
  - Polished `SelfPayrollView` for "My Payroll" view with no admin mutations.
  - Added "Monthly Statement" trigger button to period ledger panel.
- `src/features/payroll/actions/statement-actions.ts`: Implemented `getCombinedMonthlyStatementAction`.
- `src/features/payroll/components/combined-statement-dialog.tsx`: Implemented statement modal with letterhead and print support.

## Test Plan & Quality Gates

- **Unit & Domain Tests:**
  - `src/features/payroll/domain/payroll-balance-metrics.test.ts`: Verified `part-paid` status derivation alongside `draft`, `locked`, and `paid`.
  - `src/features/payroll/actions/statement-actions.test.ts`: Verified authorization enforcement, attendance aggregation, and demo mode fallbacks.
  - `src/features/payroll/components/payroll-workspace.test.tsx`: Verified `SelfPayrollView` rendering, `PrivilegedPayrollView` Option 1k elements, and `CombinedStatementDialog`.
- **E2E Tests:**
  - `tests/e2e/dashboard.spec.ts`: Updated to verify initial landing on Table Allocation and tab transitions.
  - `tests/e2e/payroll-timesheet-overhaul.spec.ts`: 12 Playwright tests across desktop, tablet, and mobile verifying:
    - Default landing tab on Table Allocation.
    - Attendance dark mode dropdown styling and contrast.
    - Attendance report corporate letterhead print rendering with "The Monk's" logo.
    - Combined Monthly Statement dialog trigger, attendance summary, and print styles.
    - Responsive mobile rendering across viewports.
- **Verification Gate:**
  - `npm run check` (0 errors, 0 warnings).
  - `npm test` (40 test files, 295 vitest unit tests passing).
  - `npm run build` (production build succeeds with all static routes).
  - `npx playwright test tests/e2e/payroll-timesheet-overhaul.spec.ts` (12/12 passing across 3 projects).
