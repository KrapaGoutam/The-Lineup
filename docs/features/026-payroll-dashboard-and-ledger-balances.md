# Feature 026 — Payroll Dashboard & Ledger Balances

**Name:** Payroll Dashboard & Ledger Balances  
**Owner:** Krapa Goutam  
**Status:** approved  
**Issue/PR:**

## Classification & Session Scope

- **Category:** FEATURE UPGRADE
- **Modifies vs Adds:** Modifies `src/features/payroll/` (Feature 020) to add the Section 2g executive dashboard (4 top metric cards, grouped period ledger, and balance-per-person ledger); moves pay-rate configuration into Settings; reinforces role-based ledger scoping.
- **Contradiction Flags & Hard Boundary:**
  - **TIPS AND PAYROLL ARE STRICTLY SEPARATE.** There are zero shared tables, zero shared ledgers, and zero cross-module derivations.
  - No payroll amount or balance may ever be derived from tips, and no tip calculation may ever read payroll data.
- **Session Scope:** Own-session build.

## User Outcome

Managers can see the restaurant's entire payroll liability at a glance without drilling into individual detail pages. Four KPI cards display total liability, current month debt, prior month debt, and the oldest open period. Generated periods are grouped by person and ordered chronologically by month/year with clear status tags (`Draft`, `Locked`, `Paid`). A dedicated "Balance per person" panel defaults to showing overall unpaid liability across all open months, with a filter to inspect specific pending months. Regular employees see only their own confirmed/locked periods.

## Scope

- **In:**
  - 4 executive KPI dashboard cards (per reference Section 2g):
    - `Overall balance owed`: total unpaid balance across all employees and open periods.
    - `Owed this month`: balance owed for the current calendar month across draft/open periods.
    - `Owed last month`: balance owed for the previous calendar month across locked/unsettled periods.
    - `Oldest open month`: month name, earliest unpaid employee, and amount outstanding.
  - Grouped Periods Ledger:
    - Collapsible accordion grouped by employee (`Person → month`).
    - Summary row per person with avatar, name, designation, hourly rate, count of open months, and total person balance.
    - Sub-rows for each month showing: Month & Year, Total Hours, Hourly Rate, Gross Pay, Outstanding Balance, and Status Badge (`Draft`, `Locked`, `Paid`).
  - Balance Per Person sidebar / panel:
    - Lists each employee with open balances (color-coded dot, name, which months are open, and balance amount).
    - Status pill (`Clear` with emerald badge when balance is \$0.00).
    - Overall balance total footer.
  - Settled state: Months marked with a green `Paid` stamp/pill once full payment is recorded.
  - Access control:
    - Managers/owners see the full organization dashboard, balances, and period generation tools.
    - Regular employees only see their own periods, restricted to `Locked` or `Paid` states (draft periods are hidden).
- **Out:**
  - Any connection or calculation involving tip allocations or table rotations.
  - Direct banking / ACH payment execution (recorded manually by managers).

## Acceptance Criteria

- [ ] Given a manager opening the Payroll tab, they see 4 top KPI cards displaying accurate aggregated liabilities (`Overall balance owed`, `Owed this month`, `Owed last month`, `Oldest open month`).
- [ ] Given generated periods, the periods table groups entries by person, ordered chronologically by year and month.
- [ ] Given an employee whose prior periods are paid in full, their balance indicates `Clear` / \$0.00 with a green status badge.
- [ ] Given an unpaid or partially paid period, the outstanding balance displays in accent amber, and reflects in the employee's open balance sum.
- [ ] Given a regular server signing in, they cannot view the organization KPI cards or other staff members' balances; they only see their own locked or paid periods.
- [ ] Given the pay rates link, it routes seamlessly into Settings > Pay Rates.

## UX Contract

- **Entry point:** Desktop second-row nav "Payroll" (manager only in real mode, per Feature 020 gate).
- **Desktop:** Layout per Section 2g: Top header with "Pay rates" and "Generate period" buttons, 4 metric cards, followed by a two-column layout (Periods table on left, Balance per person panel on right).
- **Mobile:** Vertically stacked metric cards, followed by collapsible person accordions.

## Data & Authorization

- **Tables/columns:** Extends queries on `payroll_periods`, `payroll_line_items`, and `payroll_payments` (from Feature 020).
- **Grants/RLS:**
  - Manager/owner read and write access across all organization payroll records.
  - Employee read access restricted via RLS policy: `profile_id = auth.uid() AND status IN ('locked', 'paid')`.

## Implementation Map

- `src/features/payroll/components/payroll-dashboard.tsx`: Main dashboard view.
- `src/features/payroll/components/payroll-kpi-cards.tsx`: 4 executive overview tiles.
- `src/features/payroll/components/payroll-period-groups.tsx`: Grouped person-month accordion.
- `src/features/payroll/components/payroll-balance-panel.tsx`: Balance-per-person ledger.
- `src/features/payroll/domain/payroll-balance-metrics.ts`: Pure aggregation functions.

## Test Plan

- Unit: Pure functions for overall balance, owed this month, owed last month, oldest open month, and person balance totals.
- E2E: Manager verifies dashboard calculations, marks payment to settle a period, and verifies balance updates to "Clear".

