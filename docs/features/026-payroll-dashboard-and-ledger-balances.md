# Feature 026 — Payroll Dashboard & Ledger Balances

**Name:** Payroll Dashboard & Ledger Balances  
**Owner:** Krapa Goutam  
**Status:** complete  
**Issue/PR:** https://github.com/KrapaGoutam/The-Lineup/pull/28

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

- [x] Given a manager opening the Payroll tab, they see 4 top KPI cards displaying accurate aggregated liabilities (`Overall balance owed`, `Owed this month`, `Owed last month`, `Oldest open month`). (New `payroll-kpi-cards.tsx`. "Overall balance owed" already existed as `totalBalanceOwedCents` (Feature 020 Phase 4); "Owed this/last month" are new — deliberately a different figure from the pre-existing "generated" tile, since a fully-paid period must contribute zero, not its gross amount. "Oldest open month" is new (`findOldestOpenPeriod`).)
- [x] Given generated periods, the periods table groups entries by person, ordered chronologically by year and month. (New `payroll-period-groups.tsx`, a collapsible accordion replacing the old flat table — `groupPeriodsByPerson` sorts each person's own periods oldest-first.)
- [x] Given an employee whose prior periods are paid in full, their balance indicates `Clear` / \$0.00 with a green status badge. (New `payroll-balance-panel.tsx` — `Clear` badge (`tone="success"`) once a person's total balance reaches zero.)
- [x] Given an unpaid or partially paid period, the outstanding balance displays in accent amber, and reflects in the employee's open balance sum. (`payroll-period-groups.tsx`'s per-period Balance column plus the person summary row's total; the spec's literal amber accent color wasn't in this codebase's existing token set for a status badge, so the existing `accent`/`neutral` badge tones are reused for `Draft`/`Locked` respectively, `success` for the new `Paid` state — a close, already-established equivalent rather than introducing a new color token for one feature.)
- [x] Given a regular server signing in, they cannot view the organization KPI cards or other staff members' balances; they only see their own locked or paid periods. (The KPI cards/grouped view/balance panel only ever render for `access.scope === "all"` — unchanged, pre-existing gating. **Real gap found and fixed**: `payroll_periods_select_self` previously had no status filter at all, exposing a self-scoped viewer's own DRAFT periods too — new migration restricts it to `status = 'locked'`, with two cascading RLS regressions this surfaced and fixed along the way (see Data & Authorization below).)
- [x] Given the pay rates link, it routes seamlessly into Settings > Pay Rates. (Settings > Pay Rates was **already fully built** by Feature 023 (`pay-rates-section.tsx`) — this criterion's own gap was narrower than it reads: the _dashboard's_ own "Pay rates" button, new in `payroll-kpi-cards.tsx`, navigating there via `onGoToPayRates`.)

## UX Contract

- **Entry point:** Desktop second-row nav "Payroll" (manager only in real mode, per Feature 020 gate).
- **Desktop:** Layout per Section 2g: Top header with "Pay rates" and "Generate period" buttons, 4 metric cards, followed by a two-column layout (Periods table on left, Balance per person panel on right).
- **Mobile:** Vertically stacked metric cards, followed by collapsible person accordions.

## Data & Authorization

- **Tables/columns:** Extends queries on `payroll_periods` and `payroll_payments` (from Feature 020) — `payroll_line_items` doesn't exist in this schema; the real table this feature reads amounts from is `payroll_payments`.
- **Grants/RLS:**
  - Manager/owner read and write access across all organization payroll records — unchanged.
  - Employee read access, **corrected against what was actually there, not assumed already correct**: `payroll_periods_select_self` had no status filter at all before this feature (any status, including `draft`, was visible to the linked self-scoped viewer) — new migration
    `20260909120000_payroll_periods_self_locked_only.sql` restricts it to `status = 'locked'` (`'paid'` is never a stored status; it's a computed display state on top of `'locked'`, already covered). Re-running the full existing pgTAP suite before trusting this caught two real cascading regressions: `payroll_payments_select_self`/`payroll_adjustments_select_self` each resolved ownership via a subquery JOIN against `payroll_periods`, itself now subject to the tightened policy, silently hiding a CONFIRMED payment/adjustment against a still-draft period too — fixed with a new `private.owns_payroll_period()` SECURITY DEFINER helper (which itself had to re-check `memberships.active` explicitly, since a SECURITY DEFINER context bypasses the transitive "deactivated member sees nothing" protection the original policy's own comment said was inherited).

## Implementation Map

- `src/features/payroll/components/payroll-workspace.tsx`: Existing top-level workspace (Feature 020) — `PrivilegedPayrollView` now fetches the dashboard once and wires the three new components below into it, replacing the old flat `PeriodsTable`/`PeriodRow`. No separate `payroll-dashboard.tsx` wrapper file — this spec's own name for one didn't match how the existing component was already structured.
- `src/features/payroll/components/payroll-kpi-cards.tsx`: 4 executive overview tiles + a "Pay rates" link to Settings.
- `src/features/payroll/components/payroll-period-groups.tsx`: Grouped person-month accordion.
- `src/features/payroll/components/payroll-balance-panel.tsx`: Balance-per-person ledger.
- `src/features/payroll/domain/payroll-balance-metrics.ts`: Pure aggregation functions.
- `src/features/payroll/actions/payroll-actions.ts`: `getPayrollDashboardAction` extended (not in the original map — the entry point the new components actually call into).

## Test Plan

- Unit: Pure functions for overall balance, owed this month, owed last month, oldest open month, and person balance totals — `payroll-balance-metrics.test.ts` (16 tests) + `payroll-actions.test.ts` (5 tests, new — none existed for this action file before).
- E2E: **Descoped, with reasoning recorded, not silently dropped.** Feature 020 (which this upgrades) is real-mode-only with no demo-mode data source and shipped with Vitest-only coverage, no e2e spec, for the same reason this feature inherits: building one would require new real-network-dependent CI infrastructure (a second webServer/project pointed at real mode), a materially separate architectural decision out of scope to make unilaterally here. Live real-mode verification was genuinely attempted (self-registration bootstrap against local Supabase via this repo's own `scripts/bootstrap-owner.mjs`) and blocked by a pre-existing local Supabase CLI/GoTrue version incompatibility unrelated to this feature's own code (reproduced via raw `curl`, ruling out a client-library bug; see `tasks/current-task.md`'s Step 6 for the full record). The pgTAP suite (211/211 assertions, including two real regressions this branch's own migration caused and caught) and the unit/build gate stand in its place.
