# Project Status & Milestone Tracker

**Repository:** The Lineup (Restaurant Roster & Floor Management)  
**Last Updated:** September 9, 2026  
**Health Gate:** `npm run check` (Passing) | `npm test` (36/36 files, 265/265 tests passing) | `npm run test:e2e` (settings.spec.ts 9/9, team-management.spec.ts 6/6, allocation-open-editing.spec.ts 9/9, attendance-reporting.spec.ts 12/12, recurring-schedules.spec.ts 6/6, tips-clocked-in-roster.spec.ts 1/1, all across desktop/host-tablet/server-mobile) | `npm run db:test` (17/17 pgTAP files, 210 assertions)  
**Active Milestone:** Milestone 2 (Floor Operations & Shell Polish)

---

## 🚦 Current Status Overview

- **Active Feature:** `Feature 029 — Tips from Clocked-In Attendance Roster` (plus an ad hoc Attendance "All employees" tweak bundled on the same branch)
- **Active Task Spec:** [docs/features/029-tips-from-clocked-in-attendance.md](file:///c:/Users/krapa/Documents/Projects/Restaurent/The%20Lineup/docs/features/029-tips-from-clocked-in-attendance.md)
- **Active Task File:** [tasks/current-task.md](file:///c:/Users/krapa/Documents/Projects/Restaurent/The%20Lineup/tasks/current-task.md)
- **Current State:** Implemented on `feature/029-tips-from-clocked-in-attendance` (stacked on `feature/027-recurring-schedules-and-week-navigation`); all quality gates green, acceptance criteria checked off. The feature's entire "frozen snapshot" guarantee turned out to already be enforced at the RLS layer (tip tables' write policies already key on the parent pool's `draft` status) — confirmed live by fully unlinking a participant's attendance after finalizing and seeing zero effect on the split. PR open: [#27](https://github.com/KrapaGoutam/The-Lineup/pull/27), pending review/merge.

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

---

## 🛡️ Invariants & Rules Reference

1. **Multi-Tenancy:** All tenant operations scoped by `organization_id` with RLS.
2. **Deterministic Rotation:** Table rotation algorithm is pure; decisions and overrides are persisted separately.
3. **No Moving Occupied Tables:** Floor rebalancing must never move seated/occupied tables.
4. **Overrides Require Auditing:** Any manual assignment or override records user attribution.
5. **Quality Gate:** Before every commit, run `npm run check`, `npm test`, and `npm run build`.
