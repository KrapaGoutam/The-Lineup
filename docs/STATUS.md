# Project Status & Milestone Tracker

**Repository:** The Lineup (Restaurant Roster & Floor Management)  
**Last Updated:** September 2026  
**Health Gate:** `npm run check` (Passing) | `npm test` (26/26 files, 177/177 tests passing)  
**Active Milestone:** Milestone 2 (Floor Operations & Shell Polish)

---

## 🚦 Current Status Overview

- **Active Feature:** `Feature 021 — Design System Refresh & Two-Row Shell Navigation`
- **Active Task Spec:** [docs/features/021-design-system-and-shell-refresh.md](file:///c:/Users/krapa/Documents/Projects/Restaurent/The%20Lineup/docs/features/021-design-system-and-shell-refresh.md)
- **Active Task File:** [tasks/current-task.md](file:///c:/Users/krapa/Documents/Projects/Restaurent/The%20Lineup/tasks/current-task.md)
- **Current State:** Uncommitted UI & token updates in working tree; all tests, linter, and types passing.

---

## 📦 Feature Matrix

| Feature | Description | Status | Verification |
| :--- | :--- | :--- | :--- |
| `000` | Foundation & Project Shell | ✅ Shipped | Vitest + Lint |
| `001` | Passcode App Shell | ✅ Shipped | Vitest |
| `002` | Schedule Roster | ✅ Shipped | Vitest |
| `003` | Table Allocation Engine | ✅ Shipped | Pure unit tests |
| `004` | Tip Split | ✅ Shipped | Unit tests |
| `005` | Self-Serve Registration | ✅ Shipped | RLS + Unit tests |
| `006` | Four-Digit Passcodes | ✅ Shipped | Hash verification tests |
| `007` | Mobile & Tablet Responsive Layout | ✅ Shipped | Viewport tests |
| `008` | Bulk Schedule Import | ✅ Shipped | Parser tests |
| `009` | Add Any Employee to Rotation | ✅ Shipped | Unit tests |
| `010` | Reorder Rotation Servers | ✅ Shipped | Unit tests |
| `011` | Allocation Board Open Editing | ✅ Shipped | Audit log verification |
| `012` | Theme Toggle (Light/Dark) | ✅ Shipped | Token integration |
| `013` | Virtual Numeric Keypad | ✅ Shipped | Touch & A11y tests |
| `014` | Team Designations | ✅ Shipped | Role & capability tests |
| `015` | Hosted Supabase Persistence | ✅ Shipped | Schema + RLS tests |
| `016` | Passcode Management | ✅ Shipped | Manager actions |
| `017` | Member Deactivation | ✅ Shipped | Soft-delete tests |
| `018` | Neon Attendance Report | ✅ Shipped | Reporting queries |
| `019` | Attendance Access & Dashboard | ✅ Shipped | Role gating |
| `020` | Payroll & Compensation | ✅ Shipped | Vitest + Payroll actions |
| `021` | Design System Refresh & Two-Row Shell | 🟡 Building | Quality gate green; visual check remaining |

---

## 🛡️ Invariants & Rules Reference

1. **Multi-Tenancy:** All tenant operations scoped by `organization_id` with RLS.
2. **Deterministic Rotation:** Table rotation algorithm is pure; decisions and overrides are persisted separately.
3. **No Moving Occupied Tables:** Floor rebalancing must never move seated/occupied tables.
4. **Overrides Require Auditing:** Any manual assignment or override records user attribution.
5. **Quality Gate:** Before every commit, run `npm run check`, `npm test`, and `npm run build`.
