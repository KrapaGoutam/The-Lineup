# Current Task: Roadmap Planning & Feature Specs (Features 022 – 029)

**Active Spec:** Planning & Specification Phase (`docs/features/022` through `029`)  
**Status:** Planning Complete (Awaiting User Selection of Feature to Build)  
**Assigned Agent:** Antigravity / Claude Code / Codex  
**Last Verified Quality Gate:** `npm run check` (0 errors), `npm test` (177/177 passed), `npm run test:e2e` (25/25 passed), `npm run build` (Clean build)

---

## 🎯 Objective & Outcome
Establish comprehensive specifications for Features 022 through 029, categorize them (UI-Only, Feature Upgrade, New Feature), confirm non-negotiable reconciliations, and structure the repository for seamless continuity and git discipline prior to active implementation.

---

## 📋 Features Defined & Numbered

- [x] **Feature 022: App Shell Brand Refresh & Navigation Hierarchy** (`docs/features/022-app-shell-brand-and-nav-hierarchy.md`)
  - *Category:* UI-Only
  - *Brand:* "The Monk's" with logo `https://www.monkswebster.com/assets/img/logo-light.png`.
  - *Nav:* Two-row desktop header; primary tabs (`Table Allocation`, `Tip Split`), secondary tabs (`Attendance`, `Payroll`), `Settings` trigger; mobile 3-item dock (`Allocation`, `Tip Split`, `More`) + sheet.

- [x] **Feature 023: Settings Consolidation** (`docs/features/023-settings-consolidation.md`)
  - *Category:* Feature Upgrade (Recommended: Dedicated Page, not modal)
  - *Sections:* Shift hours, Store hours grid (Sun–Sat), Schedule link, Team link, Pay rates, Passcode, Dark/Light, Sign out.

- [x] **Feature 024: Team Management Enhancements in Settings** (`docs/features/024-team-management-enhancements.md`)
  - *Category:* Feature Upgrade
  - *Capabilities:* Rename user, update designation, reset passcode, link attendance identity (019 link).
  - *Invariant:* Strictly ID-based identity linking; zero matching on names.

- [x] **Feature 025: Attendance Reporting & Filters** (`docs/features/025-attendance-reporting-and-filters.md`)
  - *Category:* Feature Upgrade
  - *Capabilities:* Month/year selector ("September / 2026 / Print"), calendar Day column, multi-select print, CSV import, single-user summary cards (`Days Worked`, `Total Hours`, `Avg per Day`).

- [x] **Feature 026: Payroll Dashboard & Ledger Balances** (`docs/features/026-payroll-dashboard-and-ledger-balances.md`)
  - *Category:* Feature Upgrade
  - *Capabilities:* 4 top KPI cards, grouped person-month accordion, balance-per-person panel (Overall vs pending months), settled `Paid` badge, employee role restriction.

- [x] **Feature 027: Recurring Schedules & Week Navigation** (`docs/features/027-recurring-schedules-and-week-navigation.md`)
  - *Category:* Feature Upgrade
  - *Capabilities:* Recurring shifts (Sun–Sat subset over date range), week pager (previous/next), edit in draft AND post-publish, bulk CSV recurrence support.

- [x] **Feature 028: Table Allocation Unrestricted Editing & Date Navigation** (`docs/features/028-table-allocation-unrestricted-editing.md`)
  - *Category:* Feature Upgrade
  - *Reconciliation 1:* All active members can edit/update already-assigned tables and cells on this board only; unconditional actor attribution; freeze on tip finalization; date/month history.

- [x] **Feature 029: Tips from Clocked-In Attendance Roster** (`docs/features/029-tips-from-clocked-in-attendance.md`)
  - *Category:* New Feature
  - *Reconciliation 2:* Read-only attendance roster preset at split time; immutable snapshotting into `tip_interval_participants`; hard boundary with zero shared tables, zero payroll derivations.

---

## 🔒 Non-Negotiable Invariants & Reconciliations

1. **Reconciliation 1 (Allocation Board Open Editing):**
   - Clean extension of Feature 011.
   - All cell updates and table edits on the allocation board are open to all active members without role gates.
   - Server-verified `assigned_by` attribution is always recorded.
   - Board freezes permanently for a service date once that date's tips are finalized.
   - Schedule, Tips, Team, Attendance, and Payroll role restrictions remain 100% strictly enforced.

2. **Reconciliation 2 (Tips & Payroll / Attendance Hard Boundary):**
   - Zero shared tables, zero shared ledgers, zero cross-module derivations.
   - Clocked-in attendance roster is an ephemeral input preset snapshotted at split creation.
   - Subsequent attendance edits (manual or Neon sync) CANNOT mutate past or finalized splits.

3. **Identity & Name Decoupling:**
   - Staff display strings (e.g. "Name (Designation)") are strictly presentation-level.
   - All authorization and cross-system identity mapping is keyed strictly by foreign key UUIDs (`attendance_identity_links`), never inferred from names.

---

## 🚀 Continuity & Git Workflow Protocol

When the user initiates implementation with *"Let's build [Feature Name]. Populate tasks/current-task.md first, then begin implementation"*:
1. **Branch:** Create a dedicated branch off `main` (e.g. `feature/02X-<feature-slug>`).
2. **First Commit:** Populate `tasks/current-task.md` with the specific step-by-step implementation plan and file list, and commit it first.
3. **Step Execution:** Implement one vertical slice at a time, checking off `- [x]` in `tasks/current-task.md`.
4. **Validation Gate:** Before every commit, execute `npm run check`, `npm test`, `npm run build`, and relevant Playwright tests.
5. **Commit & PR:** Make atomic commits with clear messages, push the branch, and open a PR for user review and merge.
