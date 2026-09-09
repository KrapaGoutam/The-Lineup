# Project Status & Milestone Tracker

**Repository:** The Lineup (Restaurant Roster & Floor Management)  
**Last Updated:** September 9, 2026  
**Health Gate:** `npm run check` (Passing) | `npm test` (38/38 files, 286/286 tests passing) | `npm run test:e2e` (settings.spec.ts 9/9, team-management.spec.ts 6/6, allocation-open-editing.spec.ts 9/9, attendance-reporting.spec.ts 12/12, recurring-schedules.spec.ts 6/6, tips-clocked-in-roster.spec.ts 1/1, all across desktop/host-tablet/server-mobile) | `npm run db:test` (17/17 pgTAP files, 211 assertions)  
**Active Milestone:** Milestone 2 (Floor Operations & Shell Polish)

---

## 🚦 Current Status Overview

- **Active Feature:** `Feature 026 — Payroll Dashboard & Ledger Balances`
- **Active Task Spec:** [docs/features/026-payroll-dashboard-and-ledger-balances.md](file:///c:/Users/krapa/Documents/Projects/Restaurent/The%20Lineup/docs/features/026-payroll-dashboard-and-ledger-balances.md)
- **Active Task File:** [tasks/current-task.md](file:///c:/Users/krapa/Documents/Projects/Restaurent/The%20Lineup/tasks/current-task.md)
- **Current State:** Implemented on `feature/026-payroll-dashboard-and-ledger-balances` (stacked on `feature/029-tips-from-clocked-in-attendance`); all quality gates green, acceptance criteria checked off. Found and fixed a real, previously-undiscovered RLS gap (`payroll_periods_select_self` had no status filter at all, exposing a self-scoped viewer's own draft periods) — re-running the full existing pgTAP suite before trusting the fix caught two further cascading regressions along the way. Real-mode live browser verification was genuinely attempted (self-registration bootstrap against local Supabase) and is documented as blocked by a pre-existing local Supabase CLI/GoTrue version incompatibility unrelated to this feature's own code; the pgTAP suite (211/211) and full unit/build gate stand in its place. PR open: [#28](https://github.com/KrapaGoutam/The-Lineup/pull/28), pending review/merge.

---

## 📦 Feature Matrix

| Feature | Description                                                       | Status     | Verification                                                                                                                                                                     |
| :------ | :---------------------------------------------------------------- | :--------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `000`   | Foundation & Project Shell                                        | ✅ Shipped | Vitest + Lint                                                                                                                                                                    |
| `001`   | Passcode App Shell                                                | ✅ Shipped | Vitest                                                                                                                                                                           |
| `002`   | Schedule Roster                                                   | ✅ Shipped | Vitest                                                                                                                                                                           |
| `003`   | Table Allocation Engine                                           | ✅ Shipped | Pure unit tests                                                                                                                                                                  |
| `004`   | Tip Split                                                         | ✅ Shipped | Unit tests                                                                                                                                                                       |
| `005`   | Self-Serve Registration                                           | ✅ Shipped | RLS + Unit tests                                                                                                                                                                 |
| `006`   | Four-Digit Passcodes                                              | ✅ Shipped | Hash verification tests                                                                                                                                                          |
| `007`   | Mobile & Tablet Responsive Layout                                 | ✅ Shipped | Viewport tests                                                                                                                                                                   |
| `008`   | Bulk Schedule Import                                              | ✅ Shipped | Parser tests                                                                                                                                                                     |
| `009`   | Add Any Employee to Rotation                                      | ✅ Shipped | Unit tests                                                                                                                                                                       |
| `010`   | Reorder Rotation Servers                                          | ✅ Shipped | Unit tests                                                                                                                                                                       |
| `011`   | Allocation Board Open Editing                                     | ✅ Shipped | Audit log verification                                                                                                                                                           |
| `012`   | Theme Toggle (Light/Dark)                                         | ✅ Shipped | Token integration                                                                                                                                                                |
| `013`   | Virtual Numeric Keypad                                            | ✅ Shipped | Touch & A11y tests                                                                                                                                                               |
| `014`   | Team Designations                                                 | ✅ Shipped | Role & capability tests                                                                                                                                                          |
| `015`   | Hosted Supabase Persistence                                       | ✅ Shipped | Schema + RLS tests                                                                                                                                                               |
| `016`   | Passcode Management                                               | ✅ Shipped | Manager actions                                                                                                                                                                  |
| `017`   | Member Deactivation                                               | ✅ Shipped | Soft-delete tests                                                                                                                                                                |
| `018`   | Neon Attendance Report                                            | ✅ Shipped | Reporting queries                                                                                                                                                                |
| `019`   | Attendance Access & Dashboard                                     | ✅ Shipped | Role gating                                                                                                                                                                      |
| `020`   | Payroll & Compensation                                            | ✅ Shipped | Vitest + Payroll actions                                                                                                                                                         |
| `021`   | Design System Refresh & Two-Row Shell                             | ✅ Shipped | Quality gate + live browser verification                                                                                                                                         |
| `022`   | App Shell Brand Refresh & Nav Hierarchy                           | ✅ Shipped | Quality gate + e2e                                                                                                                                                               |
| `023`   | Settings Consolidation                                            | ✅ Shipped | Vitest (settings-page, pay-rates-section, shift-hours-card, store-hours-grid) + e2e (settings.spec.ts, 3 projects)                                                               |
| `024`   | Team Management Enhancements                                      | ✅ Shipped | pgTAP (profiles_manager_rename, 8 assertions) + Vitest (member-actions) + e2e (team-management.spec.ts, 3 projects)                                                              |
| `028`   | Table Allocation Unrestricted Editing & Date Navigation           | ✅ Shipped | pgTAP (0013-0016, 27 assertions) + Vitest (rotation-board) + e2e (allocation-open-editing.spec.ts, 3 projects)                                                                   |
| `025`   | Attendance Reporting & Filters                                    | ✅ Shipped | Vitest (attendance-metrics, attendance-report) + e2e (attendance-reporting.spec.ts, 3 projects)                                                                                  |
| `027`   | Recurring Schedules & Week Navigation                             | ✅ Shipped | pgTAP (0017_shifts_recurrence, 8 assertions) + Vitest (recurring-shifts, shift-planning, parse-schedule-csv, schedule-workspace) + e2e (recurring-schedules.spec.ts, 3 projects) |
| `029`   | Tips from Clocked-In Attendance Roster (+ Attendance "All" tweak) | ✅ Shipped | Vitest (fetch-clocked-in-roster, tips-actions, calculate-tip-splits, attendance-report) + e2e (tips-clocked-in-roster.spec.ts + attendance-reporting.spec.ts, 3 projects)        |
| `026`   | Payroll Dashboard & Ledger Balances                               | ✅ Shipped | pgTAP (0010 updated + payroll_periods_self_locked_only, 211 assertions) + Vitest (payroll-balance-metrics, payroll-actions)                                                      |

---

## 🛡️ Invariants & Rules Reference

1. **Multi-Tenancy:** All tenant operations scoped by `organization_id` with RLS.
2. **Deterministic Rotation:** Table rotation algorithm is pure; decisions and overrides are persisted separately.
3. **No Moving Occupied Tables:** Floor rebalancing must never move seated/occupied tables.
4. **Overrides Require Auditing:** Any manual assignment or override records user attribution.
5. **Quality Gate:** Before every commit, run `npm run check`, `npm test`, and `npm run build`.
