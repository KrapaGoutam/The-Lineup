# Pre-V2-007 Operational Enhancements — Test Matrix

This matrix documents all verification suites executed for the combined Pre-V2-007 Operational Enhancements (Batch A: Attendance Manual Entry, Batch B: Visual Cooler Layout Refinement, Batch C: Consolidated Validation).

---

## 1. Static Verification & Quality Gates

| Check                  | Tool / Command                                       | Result   | Duration / Details                                    |
| :--------------------- | :--------------------------------------------------- | :------- | :---------------------------------------------------- |
| **Code Formatting**    | `npm run format:check`                               | **PASS** | 0 formatting issues across all repository files       |
| **Linting**            | `npm run lint` (`eslint . --max-warnings=0`)         | **PASS** | 0 errors, 0 warnings                                  |
| **Type Checking**      | `npm run typecheck` (`next typegen && tsc --noEmit`) | **PASS** | Strict TypeScript clean; route types generated        |
| **Consolidated Check** | `npm run check`                                      | **PASS** | Format, lint, and typegen combined exit code 0        |
| **Production Build**   | `npx next build --webpack`                           | **PASS** | 15.0s compilation, all 13 routes compiled & optimized |

---

## 2. Database pgTAP Tests (Local Docker Supabase)

Target: Local PostgreSQL instance on port `54322` running `supabase_db_restaurant-roster`.

| Test Suite                         | Path                                                                                                                                                                                                                                                      |   Tests   |  Result  | Focus Areas                                                                                                             |
| :--------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------: | :------: | :---------------------------------------------------------------------------------------------------------------------- |
| **Attendance Manual Entry**        | [`supabase/tests/database/0076_attendance_manual_entry.test.sql`](file:///c:/Users/krapa/Documents/Projects/Restaurent/The%20Lineup/.tmp/pre-v2-007-operational-enhancements/supabase/tests/database/0076_attendance_manual_entry.test.sql)               |  53 / 53  | **PASS** | `attendance_shift_create_manual`, source enforcement, workforce validation, break window validation, manager audit, RLS |
| **Attendance Corrections**         | [`supabase/tests/database/0074_attendance_corrections.test.sql`](file:///c:/Users/krapa/Documents/Projects/Restaurent/The%20Lineup/.tmp/pre-v2-007-operational-enhancements/supabase/tests/database/0074_attendance_corrections.test.sql)                 |  66 / 66  | **PASS** | Shift corrections, optimistic locking, ledger immutability                                                              |
| **Attendance Financial Integrity** | [`supabase/tests/database/0075_attendance_financial_integrity.test.sql`](file:///c:/Users/krapa/Documents/Projects/Restaurent/The%20Lineup/.tmp/pre-v2-007-operational-enhancements/supabase/tests/database/0075_attendance_financial_integrity.test.sql) |  55 / 55  | **PASS** | Ledger immutability, financial lockouts, compensation bounds                                                            |
| **Attendance V2 Foundation**       | [`supabase/tests/database/0073_attendance_v2_foundation.test.sql`](file:///c:/Users/krapa/Documents/Projects/Restaurent/The%20Lineup/.tmp/pre-v2-007-operational-enhancements/supabase/tests/database/0073_attendance_v2_foundation.test.sql)             | 108 / 108 | **PASS** | Core shifts, intervals, employee identity, tenant isolation                                                             |
| **Storage Placements**             | [`supabase/tests/database/0071_inventory_storage_placement.test.sql`](file:///c:/Users/krapa/Documents/Projects/Restaurent/The%20Lineup/.tmp/pre-v2-007-operational-enhancements/supabase/tests/database/0071_inventory_storage_placement.test.sql)       |  95 / 95  | **PASS** | Placement assignment, shelving hierarchy, slot reordering, quantity independence                                        |
| **Date Group Imports**             | [`supabase/tests/database/0072_inventory_date_group_import.test.sql`](file:///c:/Users/krapa/Documents/Projects/Restaurent/The%20Lineup/.tmp/pre-v2-007-operational-enhancements/supabase/tests/database/0072_inventory_date_group_import.test.sql)       |  88 / 88  | **PASS** | Inventory date lots, subcategory freshness rules                                                                        |

---

## 3. Unit & Component Test Suites (Vitest)

| Target Suite                       | Test File / Command                                                                                                                                                                                                                                                   |           Tests           |  Result  | Focus Areas                                                                                                                                                                                   |
| :--------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-----------------------: | :------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cooler Layout Refinement**       | [`src/features/bar-inventory/components/cooler-layout/cooler-layout.test.tsx`](file:///c:/Users/krapa/Documents/Projects/Restaurent/The%20Lineup/.tmp/pre-v2-007-operational-enhancements/src/features/bar-inventory/components/cooler-layout/cooler-layout.test.tsx) |          18 / 18          | **PASS** | Top-to-bottom shelf ordering, cooler enclosure header, explicit empty slots, click-to-place, drag-and-drop moves, collision rejection, shelf Move Up / Move Down buttons, quantity invariance |
| **Attendance Domain & Components** | `npx vitest run src/features/attendance`                                                                                                                                                                                                                              |         356 / 356         | **PASS** | Shift creation, break intervals, audit entries, timesheet view, manual entry dialog, form validation                                                                                          |
| **Complete Workspace Vitest**      | `npm run test` (`vitest run`)                                                                                                                                                                                                                                         | 3,886 / 3,886 (7 skipped) | **PASS** | Full application regression test (283 test files passed in 21.82s)                                                                                                                            |

---

## 4. Playwright End-to-End Tests

Command: `npx playwright test tests/e2e/bar-inventory-cooler-layout.spec.ts`

| Test Specification    | Projects                                  |  Tests  |  Result  | Key Coverage                                                                                                                                                                                                                            |
| :-------------------- | :---------------------------------------- | :-----: | :------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cooler Layout E2E** | `desktop`, `host-tablet`, `server-mobile` | 21 / 21 | **PASS** | 100% pass across all 3 viewports: controls, touch targets, shelf filtering, opening item editor, keyboard navigation, choosing product on placement, read-only branch views, area archiving & restoration, table select-all integration |
