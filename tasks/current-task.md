# Current Task: Feature 030 — Payroll UI, Option 1k Dashboard, Staff Access & Timesheet Print Overhaul

**Active Spec:** `docs/features/030-combined-timesheet-payroll-statement.md` (and updates to `026` & `025`)
**Branch:** `feature/030-payroll-ui-timesheet-print-overhaul` (branched from `main`)
**Status:** Complete — PR open: https://github.com/KrapaGoutam/The-Lineup/pull/29
**Assigned Agent:** Antigravity (build), Claude Code (session resumption, final
verification gate, and PR)

## 🎯 Objective

Deliver the Option 1k Payroll Dashboard overhaul, UI contrast bug fixes, staff self-service read-only Payroll access, corporate Letterhead Timesheet Print Templates (with 1-employee-per-page pagination), and Combined Monthly Timesheet + Payroll Statements.

## 📖 Key Findings & Architecture

1. **Dropdown Contrast Bug Fix**:
   - In dark theme, native `<select>` and custom dropdown options could inherit light text on white/light native option popovers.
   - Fixed by applying `bg-popover text-popover-foreground border-border [&>option]:bg-popover [&>option]:text-popover-foreground` across `src/components/ui/select.tsx` and `src/features/attendance/components/attendance-report.tsx`.
2. **Default Landing Page**:
   - In `src/components/restaurant-operations-app.tsx`, change initial tab from `"schedule"` to `"allocation"`: `useState<AppTab>("allocation")`.
   - Update E2E tests in `tests/e2e/dashboard.spec.ts` that assumed the initial view was Schedule to navigate explicitly, and verify allocation lands first.
3. **Remove Redundant Pay Rates from Payroll Tab**:
   - In `src/features/payroll/components/payroll-workspace.tsx`, remove `<RateSettings>` from the rendered layout in `PrivilegedPayrollView`.
   - Pay rates are already consolidated in Settings > Pay Rates (`pay-rates-section.tsx`), which continues importing `RateSettings`. The top toolbar "Pay rates" button routes there seamlessly via `onGoToPayRates`.
4. **Option 1k Dashboard Overhaul**:
   - Top KPI Summary Cards: 3 cards (`Overall balance owed` highlighted with accent container and large font, `This month` owed with draft period count, `Last month` owed).
   - 2-Column Dashboard Grid (`1fr 360px` desktop, stacked on mobile):
     - Left Column ("Balances by person and month"): Person header with initials avatar, stable person color, employee name, meta (`${role} · ${rate}/hr · N open months`), and person open balance. Month sub-table with `Month`, `Hours`, `Gross`, `Paid`, `Month balance`, and Status badge (`Draft` / `Locked` / `Part-paid` / `Paid`), plus a "Ledger" button to open the period ledger.
     - Right Column ("Balance per person"): List of employees with open balances (status dot, name, balance, list of open months), bottom highlight bar for Overall Balance, and explanatory note.
   - Status badge logic extended in `payroll-balance-metrics.ts` to include `"part-paid"` when `balanceCents > 0 && balanceCents < grossCents`.
5. **Staff Read-Only Payroll Access**:
   - In `restaurant-operations-app.tsx`, remove the `isManager` gate from `payrollTab` so regular staff (servers, hosts, bussers) in real mode can see and click Payroll.
   - In `payroll-workspace.tsx`, `SelfPayrollView` renders the "My Payroll" view showing only the user's own locked/paid periods and read-only ledger. Admin controls (`Generate period`, `Record payment`, rate editing) are strictly omitted.
   - Enforced by existing Supabase RLS (`payroll_periods_select_self`, `payroll_payments_select_self`, `payroll_adjustments_select_self`).
6. **Corporate Letterhead Timesheet & Combined Statement**:
   - Letterhead includes "The Monk's" logo (`https://www.monkswebster.com/assets/img/logo-light.png`), restaurant details, employee designation, and month/year.
   - Print pagination enforced: `@media print { .employee-timesheet { page-break-after: always; break-after: page; } .employee-timesheet:last-child { page-break-after: auto; break-after: auto; } }`.
   - Combined Monthly Statement action button in both Attendance and Payroll views.
   - Server action `getCombinedMonthlyStatementAction` securely fetches attendance records and payroll breakdown for that employee and calendar month, enforcing staff can only access their own statement while managers can access any.

## 🔒 Non-negotiable Constraints

- Multi-tenant isolation enforced by `organization_id` and Supabase RLS.
- Regular staff never see anyone else's payroll periods, balances, or rates.
- Pure table-rotation engine remains untouched.
- No tip calculation data is mixed with payroll data.
- Quality gates (`npm run check`, `npm test`, `npm run build`) must pass before every commit.

## 🛠️ Implementation Steps

- [x] **Step 1: Task Initialization & First Commit**
  - [x] Populate `tasks/current-task.md` with complete plan, file list, and step checklist.
  - [x] Pre-commit quality gate (`npm run check && npm test && npm run build`).
  - [x] Commit `tasks/current-task.md`.

- [x] **Step 2: Increment 1 — Bug Fixes & Shell Alignment**
  - [x] Dropdown contrast fix in `src/components/ui/select.tsx` and `src/features/attendance/components/attendance-report.tsx`.
  - [x] Default landing tab changed to `"allocation"` in `src/components/restaurant-operations-app.tsx`.
  - [x] Remove `<RateSettings>` from Payroll tab in `src/features/payroll/components/payroll-workspace.tsx` while preserving its export.
  - [x] Adjust existing E2E tests in `tests/e2e/dashboard.spec.ts` to accommodate allocation landing page.
  - [x] Run quality gates (`npm run check && npm test && npm run build`) and commit.

- [x] **Step 3: Increment 2 — Option 1k Payroll Dashboard Overhaul**
  - [x] Extend `derivePeriodStatus` in `src/features/payroll/domain/payroll-balance-metrics.ts` to support `"part-paid"`, and add unit tests in `payroll-balance-metrics.test.ts`.
  - [x] Update `src/features/payroll/components/payroll-kpi-cards.tsx` to render the 3-card Option 1k layout.
  - [x] Rebuild `src/features/payroll/components/payroll-period-groups.tsx` and `src/features/payroll/components/payroll-balance-panel.tsx` with Option 1k design tokens, avatar colors, and expanded sub-tables.
  - [x] Run quality gates (`npm run check && npm test && npm run build`) and commit.

- [x] **Step 4: Increment 3 — Staff Read-Only Payroll Access**
  - [x] Enable Payroll tab for regular staff in `src/components/restaurant-operations-app.tsx`.
  - [x] Polish `SelfPayrollView` in `src/features/payroll/components/payroll-workspace.tsx` for "My Payroll" view without admin actions.
  - [x] Run quality gates (`npm run check && npm test && npm run build`) and commit.

- [x] **Step 5: Increment 4 — Timesheet Letterhead Print & Combined Statement**
  - [x] Update `PrintableReport` in `src/features/attendance/components/attendance-report.tsx` with corporate letterhead logo and 1-employee-per-page pagination.
  - [x] Implement `getCombinedMonthlyStatementAction` in `src/features/payroll/actions/statement-actions.ts` with unit tests in `statement-actions.test.ts`.
  - [x] Implement `src/features/payroll/components/combined-statement-dialog.tsx`.
  - [x] Wire "Monthly Statement" action buttons into both Attendance and Payroll views.
  - [x] Run quality gates (`npm run check && npm test && npm run build`) and commit.

- [x] **Step 6: Playwright E2E Tests for New Features**
  - [x] Add Playwright tests verifying:
    - [x] Initial landing on Table Allocation.
    - [x] Attendance dropdown options have proper contrast.
    - [x] Staff member and manager views.
    - [x] Timesheet and Combined Statement print dialog triggers.
  - [x] Run full E2E test suite across desktop, tablet, and mobile projects.

- [x] **Step 7: Documentation Updates**
  - [x] Update `docs/features/026-payroll-dashboard-and-ledger-balances.md`.
  - [x] Update `docs/features/025-attendance-reporting-and-filters.md`.
  - [x] Create `docs/features/030-combined-timesheet-payroll-statement.md`.
  - [x] Update `docs/DESIGN_SYSTEM.md`.
  - [x] Update `docs/STATUS.md`.
  - [x] Run quality gates (`npm run check && npm test && npm run build`) and commit.

- [x] **Step 8: Final Gate & PR**
  - [x] Full quality gate verification (`npm run check`, `npm test`, `npm run build`, `npm run db:test`, Playwright E2E).
  - [x] Push branch to remote and create PR.

## 🗂️ File List

- `tasks/current-task.md`
- `src/components/ui/select.tsx`
- `src/components/restaurant-operations-app.tsx`
- `src/features/attendance/components/attendance-report.tsx`
- `src/features/attendance/components/attendance-month-nav.tsx`
- `src/features/payroll/domain/payroll-balance-metrics.ts`
- `src/features/payroll/domain/payroll-balance-metrics.test.ts`
- `src/features/payroll/components/payroll-kpi-cards.tsx`
- `src/features/payroll/components/payroll-period-groups.tsx`
- `src/features/payroll/components/payroll-balance-panel.tsx`
- `src/features/payroll/components/payroll-workspace.tsx`
- `src/features/payroll/actions/statement-actions.ts` (new)
- `src/features/payroll/actions/statement-actions.test.ts` (new)
- `src/features/payroll/components/combined-statement-dialog.tsx` (new)
- `src/features/payroll/components/payroll-workspace.test.tsx` (new)
- `tests/e2e/dashboard.spec.ts`
- `tests/e2e/payroll-timesheet-overhaul.spec.ts` (new)
- `docs/features/026-payroll-dashboard-and-ledger-balances.md`
- `docs/features/025-attendance-reporting-and-filters.md`
- `docs/features/030-combined-timesheet-payroll-statement.md` (new)
- `docs/DESIGN_SYSTEM.md`
- `docs/STATUS.md`

## In-Flight State

- All Steps 1-8 completed. Full verification passing (`npm run check`, `npm test` 295/295, `npm run build`, `npm run db:test` 211/211, Playwright E2E 12/12).
- Resumed after a usage-limit cutoff: branch was already fully committed and
  pushed, but no PR existed yet. Discarded two stray, unrelated
  whitespace-only diffs (`hydration-marker.tsx`, `tests/e2e/debug.spec.ts`)
  left over in the working tree, re-confirmed the full gate green
  (`npm run check`, `npm test` 295/295, `npm run build`, `npm run db:test`
  211/211 — this feature touches no migrations), and opened
  [PR #29](https://github.com/KrapaGoutam/The-Lineup/pull/29) against `main`.
- Feature 030 is now fully complete: implemented, verified, documented, and
  in an open PR. Nothing further pending.
