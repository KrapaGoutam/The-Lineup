# Subfeature V2-001.004: Per-Location Roles — Test Matrix

Parent Feature: [V2-001: Access & Role Foundation](../README.md)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Tracking Issue: [#265](https://github.com/KrapaGoutam/The-Lineup/issues/265)  
Parent Issues: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248), [#249](https://github.com/KrapaGoutam/The-Lineup/issues/249)  
Status: `IN_PROGRESS`

---

## 1. Database pgTAP Test Matrix (`0053_location_roles.test.sql`)

| ID         | Category         | Description                                             | Target / Assertion                                                                      | Expected            |
| ---------- | ---------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------- |
| **DB-001** | Schema           | Location role storage exists                            | `has_column('public', 'location_memberships', 'role')`                                  | PASS                |
| **DB-002** | Schema           | Allowed role values constrained by enum                 | `col_type_is('public', 'location_memberships', 'role', 'public.location_role')`         | PASS                |
| **DB-003** | Core Matrix      | John can be Manager at NASA                             | `SELECT role FROM location_memberships WHERE profile = John AND location = NASA`        | `manager`           |
| **DB-004** | Core Matrix      | John simultaneously Assistant Manager at League City    | `SELECT role FROM location_memberships WHERE profile = John AND location = League City` | `assistant_manager` |
| **DB-005** | Core Matrix      | John simultaneously Manager at Webster                  | `SELECT role FROM location_memberships WHERE profile = John AND location = Webster`     | `manager`           |
| **DB-006** | Isolation        | NASA role does not leak to League City                  | Updating NASA role does not alter League City row                                       | PASS                |
| **DB-007** | Isolation        | League City role does not leak to Webster               | Modifying League City does not alter Webster                                            | PASS                |
| **DB-008** | Multi-Branch     | Same role may be assigned at multiple locations         | Jack is `manager` at NASA, League City, and Webster                                     | PASS                |
| **DB-009** | Multi-User       | Different people hold different roles at same location  | At NASA: John is `manager`, Sam is `staff`                                              | PASS                |
| **DB-010** | Integrity        | Role requires valid profile/location relationship       | FK constraint to `locations(id)` and `profiles(id)`                                     | PASS                |
| **DB-011** | Fail-Closed      | Inactive org membership invalidates effective role      | Inactive `memberships` row filters effective role out                                   | PASS                |
| **DB-012** | Fail-Closed      | Inactive location membership invalidates effective role | `active = false` on `location_memberships` yields no role                               | PASS                |
| **DB-013** | Validation       | Unsupported role value rejected                         | Inserting `'owner'`, `'lead'`, or `'bogus'` throws error                                | EXCEPTION           |
| **DB-014** | Security         | Normal staff cannot promote themselves                  | `UPDATE location_memberships SET role = 'manager'` as `server`                          | 0 rows affected     |
| **DB-015** | Security         | Normal staff cannot modify another user's role          | `UPDATE location_memberships` on other profile as `server`                              | 0 rows affected     |
| **DB-016** | Security         | Assistant Manager cannot self-promote to Manager        | `UPDATE location_memberships SET role = 'manager'` as `shift_manager`                   | 0 rows affected     |
| **DB-017** | Isolation        | No automatic role assignment to sibling branches        | Assignment to NASA does not insert League City row                                      | PASS                |
| **DB-018** | Scope            | No location role required for Overall Role storage      | `overall_roles` row exists without location role row                                    | PASS                |
| **DB-019** | Scope            | No Overall role duplicated into location storage        | Creating Overall Owner does not insert location row                                     | PASS                |
| **DB-020** | Tenant Isolation | Cross-organization role leakage denied                  | Tenant boundaries strictly enforced across Monks and Liquor Tap                         | PASS                |

---

## 2. Domain Unit Test Matrix (`location-role.test.ts`)

| ID          | Description                                     | Inputs                                                                   | Expected                                        |
| ----------- | ----------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------- |
| **DOM-001** | `isLocationRole` valid roles                    | `'manager'`, `'assistant_manager'`, `'staff'`                            | `true`                                          |
| **DOM-002** | `isLocationRole` invalid roles                  | `'owner'`, `'lead'`, `'server'`, `''`, `null`                            | `false`                                         |
| **DOM-003** | `isLocationManager` predicate                   | `'manager'` vs others                                                    | `true` for manager, `false` otherwise           |
| **DOM-004** | `isLocationAssistantManager` predicate          | `'assistant_manager'` vs others                                          | `true` for assistant manager, `false` otherwise |
| **DOM-005** | `isLocationStaff` predicate                     | `'staff'` vs others                                                      | `true` for staff, `false` otherwise             |
| **DOM-006** | `hasExplicitLocationRole` predicate             | `(role, requiredRole)`                                                   | `true` on exact match                           |
| **DOM-007** | John Mixed-Role Matrix Evaluation               | NASA (`manager`), League City (`assistant_manager`), Webster (`manager`) | Independent evaluation                          |
| **DOM-008** | Inactive Org Membership &rarr; Fail Closed      | `isOrgMemberActive = false`                                              | Returns `null`                                  |
| **DOM-009** | Inactive Location Membership &rarr; Fail Closed | `isLocationActive = false`                                               | Returns `null`                                  |
| **DOM-010** | Missing assignment / null inputs                | Empty/null parameters                                                    | Returns `null`                                  |

---

## 3. Data Reader Test Matrix (`location-role.test.ts`)

| ID           | Reader                       | Condition                                          | Expected Result       |
| ------------ | ---------------------------- | -------------------------------------------------- | --------------------- |
| **READ-001** | `getLocationRole`            | John at NASA (active org + active location)        | `'manager'`           |
| **READ-002** | `getLocationRole`            | John at League City (active org + active location) | `'assistant_manager'` |
| **READ-003** | `getLocationRole`            | John at Webster (active org + active location)     | `'manager'`           |
| **READ-004** | `getLocationRole`            | Unassigned location                                | `null`                |
| **READ-005** | `getLocationRole`            | Inactive org membership (Jerry scenario)           | `null` (fail closed)  |
| **READ-006** | `getLocationRole`            | Inactive location membership                       | `null` (fail closed)  |
| **READ-007** | `listLocationRoles`          | Returns all assignments (active and inactive)      | Full array            |
| **READ-008** | `listActiveLocationRoles`    | Returns only active assignments                    | Filtered array        |
| **READ-009** | `getCurrentUserLocationRole` | Authenticated user at assigned location            | Resolved role         |
| **READ-010** | `getCurrentUserLocationRole` | Unauthenticated / query error                      | `null` (fail closed)  |
| **READ-011** | `hasEffectiveLocationRole`   | Evaluates required role predicate                  | `true` / `false`      |

---

## 4. Regression Test Suites

- `supabase/tests/database/0050_overall_roles.test.sql` (22/22 PASS)
- `supabase/tests/database/0051_organization_membership.test.sql` (22/22 PASS)
- `supabase/tests/database/0052_location_access.test.sql` (24/24 PASS)
- `src/features/auth/domain/overall-role.test.ts` (PASS)
- `src/features/auth/data/overall-role.test.ts` (PASS)
- `src/features/auth/domain/organization-membership.test.ts` (PASS)
- `src/features/auth/data/organization-membership.test.ts` (PASS)
- `src/features/auth/domain/location-access.test.ts` (PASS)
- `src/features/auth/data/location-access.test.ts` (PASS)
- Full pgTAP suite (all 53 database test files)
- Full Vitest suite (all test files)
