# Project Status & Milestone Tracker

**Repository:** The Lineup (Restaurant Roster & Floor Management)  
**Last Updated:** September 8, 2026  
**Health Gate:** `npm run check` (Passing) | `npm test` (31/31 files, 192/192 tests passing) | `npm run test:e2e` (settings.spec.ts 9/9, team-management.spec.ts 6/6, all across desktop/host-tablet/server-mobile) | `npm run db:test` (12/12 pgTAP files, 179 assertions)  
**Active Milestone:** Milestone 2 (Floor Operations & Shell Polish)

---

## 🚦 Current Status Overview

- **Active Feature:** `Feature 024 — Team Management Enhancements`
- **Active Task Spec:** [docs/features/024-team-management-enhancements.md](file:///c:/Users/krapa/Documents/Projects/Restaurent/The%20Lineup/docs/features/024-team-management-enhancements.md)
- **Active Task File:** [tasks/current-task.md](file:///c:/Users/krapa/Documents/Projects/Restaurent/The%20Lineup/tasks/current-task.md)
- **Current State:** Implemented on `feature/024-team-management-enhancements` (stacked on `feature/023-settings-consolidation`); all quality gates green, acceptance criteria checked off. Pending PR/merge.

---

## 📦 Feature Matrix

| Feature | Description                             | Status     | Verification                                                                                                        |
| :------ | :-------------------------------------- | :--------- | :------------------------------------------------------------------------------------------------------------------ |
| `000`   | Foundation & Project Shell              | ✅ Shipped | Vitest + Lint                                                                                                       |
| `001`   | Passcode App Shell                      | ✅ Shipped | Vitest                                                                                                              |
| `002`   | Schedule Roster                         | ✅ Shipped | Vitest                                                                                                              |
| `003`   | Table Allocation Engine                 | ✅ Shipped | Pure unit tests                                                                                                     |
| `004`   | Tip Split                               | ✅ Shipped | Unit tests                                                                                                          |
| `005`   | Self-Serve Registration                 | ✅ Shipped | RLS + Unit tests                                                                                                    |
| `006`   | Four-Digit Passcodes                    | ✅ Shipped | Hash verification tests                                                                                             |
| `007`   | Mobile & Tablet Responsive Layout       | ✅ Shipped | Viewport tests                                                                                                      |
| `008`   | Bulk Schedule Import                    | ✅ Shipped | Parser tests                                                                                                        |
| `009`   | Add Any Employee to Rotation            | ✅ Shipped | Unit tests                                                                                                          |
| `010`   | Reorder Rotation Servers                | ✅ Shipped | Unit tests                                                                                                          |
| `011`   | Allocation Board Open Editing           | ✅ Shipped | Audit log verification                                                                                              |
| `012`   | Theme Toggle (Light/Dark)               | ✅ Shipped | Token integration                                                                                                   |
| `013`   | Virtual Numeric Keypad                  | ✅ Shipped | Touch & A11y tests                                                                                                  |
| `014`   | Team Designations                       | ✅ Shipped | Role & capability tests                                                                                             |
| `015`   | Hosted Supabase Persistence             | ✅ Shipped | Schema + RLS tests                                                                                                  |
| `016`   | Passcode Management                     | ✅ Shipped | Manager actions                                                                                                     |
| `017`   | Member Deactivation                     | ✅ Shipped | Soft-delete tests                                                                                                   |
| `018`   | Neon Attendance Report                  | ✅ Shipped | Reporting queries                                                                                                   |
| `019`   | Attendance Access & Dashboard           | ✅ Shipped | Role gating                                                                                                         |
| `020`   | Payroll & Compensation                  | ✅ Shipped | Vitest + Payroll actions                                                                                            |
| `021`   | Design System Refresh & Two-Row Shell   | ✅ Shipped | Quality gate + live browser verification                                                                            |
| `022`   | App Shell Brand Refresh & Nav Hierarchy | ✅ Shipped | Quality gate + e2e                                                                                                  |
| `023`   | Settings Consolidation                  | ✅ Shipped | Vitest (settings-page, pay-rates-section, shift-hours-card, store-hours-grid) + e2e (settings.spec.ts, 3 projects)  |
| `024`   | Team Management Enhancements            | ✅ Shipped | pgTAP (profiles_manager_rename, 8 assertions) + Vitest (member-actions) + e2e (team-management.spec.ts, 3 projects) |

---

## 🛡️ Invariants & Rules Reference

1. **Multi-Tenancy:** All tenant operations scoped by `organization_id` with RLS.
2. **Deterministic Rotation:** Table rotation algorithm is pure; decisions and overrides are persisted separately.
3. **No Moving Occupied Tables:** Floor rebalancing must never move seated/occupied tables.
4. **Overrides Require Auditing:** Any manual assignment or override records user attribution.
5. **Quality Gate:** Before every commit, run `npm run check`, `npm test`, and `npm run build`.
