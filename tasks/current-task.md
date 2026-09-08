# Current Task: Feature 022 — App Shell Brand Refresh & Navigation Hierarchy

**Active Spec:** `docs/features/022-app-shell-brand-and-nav-hierarchy.md`
**Status:** In Progress
**Assigned Agent:** Antigravity

## 🎯 Objective
Update the application shell to use the "The Monk's" brand identity. Overhaul the desktop and mobile navigation hierarchies to focus on daily operations (Table Allocation, Tip Split).

## 📋 Implementation Steps

- [ ] **Step 1: Brand Updates (Login & App Shell)**
  - Update `src/components/login-screen.tsx` to display "The Monk's" and use `https://www.monkswebster.com/assets/img/logo-light.png`.
  - Update `src/components/restaurant-operations-app.tsx` header to display the new logo and brand name.
- [ ] **Step 2: Desktop Two-Row Navigation (`restaurant-operations-app.tsx`)**
  - Implement Row 1: Logo (left), countdown pill (center), user menu (right).
  - Implement Row 2: Primary tabs (`Table Allocation`, `Tip Split`), divider, secondary tabs (`Attendance`, `Payroll`), and `Settings` tab.
  - Hide secondary tabs for non-managers.
- [ ] **Step 3: Mobile Bottom Navigation & More Sheet**
  - Implement bottom 3-item dock (`Allocation`, `Tip Split`, `More`).
  - Implement slide-up sheet (triggered by `More`) for `Attendance`, `Payroll`, `Settings`, `Appearance`, and `Sign out`.
  - Restrict `Attendance` and `Payroll` in the sheet to managers.
- [ ] **Step 4: Cleanup & Quality Checks**
  - Verify UI components meet $\ge 44\text{px}$ touch target standards.
  - Run `npm run check`, `npm test`, `npm run test:e2e`, and `npm run build`.

## 🔒 Invariants
- No backend/schema modifications.
- Manager-only tabs (`Attendance`, `Payroll`) must be hidden from non-managers in both desktop and mobile views.
