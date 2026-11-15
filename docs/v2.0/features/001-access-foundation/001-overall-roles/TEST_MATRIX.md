# Subfeature V2-001.001: Overall Roles Foundation — Test Matrix

Parent Feature: [V2-001: Access & Role Foundation](../README.md)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Tracking Issue: [#259](https://github.com/KrapaGoutam/The-Lineup/issues/259)

---

## 1. Acceptance Criteria Mapping

| ID         | Description                                                              | Test Type         | Enforcement Mechanism                                            | Status  |
| :--------- | :----------------------------------------------------------------------- | :---------------- | :--------------------------------------------------------------- | :------ |
| **AC-001** | Backend represents Overall Owner for one person                          | DB (pgTAP) & Unit | `overall_roles.role = 'owner'`                                   | PASS    |
| **AC-002** | Backend represents Overall Manager for one person                        | DB (pgTAP) & Unit | `overall_roles.role = 'manager'`                                 | PASS    |
| **AC-003** | Backend represents Overall Assistant Manager for one person              | DB (pgTAP) & Unit | `overall_roles.role = 'assistant_manager'`                       | PASS    |
| **AC-004** | A person can have no Overall role without breaking access                | DB (pgTAP) & Unit | `SELECT` returns empty row, resolver returns `null`              | PASS    |
| **AC-005** | Database guarantees one deterministic Overall role per user              | DB (pgTAP)        | `constraint overall_roles_profile_id_key unique (profile_id)`    | PASS    |
| **AC-006** | Invalid / unsupported Overall role values cannot be persisted            | DB (pgTAP) & Unit | `public.overall_role` enum rejection + TS runtime guard          | PASS    |
| **AC-007** | Normal authenticated user cannot promote themselves                      | DB (pgTAP)        | RLS policy denies `INSERT` / `UPDATE` to authenticated           | PASS    |
| **AC-008** | Normal user cannot modify another person's Overall role                  | DB (pgTAP)        | RLS policy denies mutations to authenticated                     | PASS    |
| **AC-009** | Overall role storage does NOT require `organization_id` or `location_id` | DB (pgTAP)        | Schema definition on `public.overall_roles`                      | PASS    |
| **AC-010** | No Overall assignment is inferred from `organizations.created_by`        | Code & Unit       | Separation of concerns; `getOverallRole` queries `overall_roles` | PASS    |
| **AC-011** | Existing organization/location authorization remains unchanged           | Regression        | Existing test suites continue to pass                            | PASS    |
| **AC-012** | Existing Table Rotation/Tasks/Inventory permission tests green           | Regression        | Unit & integration suites pass (163/163 pass)                    | PASS    |
| **AC-013** | No UI or navigation unexpectedly changes                                 | Diff Review       | Zero UI modifications in this subfeature                         | PASS    |
| **AC-014** | Migration resets cleanly locally                                         | DB (Local)        | `supabase db reset` verification                                 | PASS    |
| **AC-015** | Hosted DEV validation passes                                             | Hosted DEV        | Migration applied to DEV; direct SQL verification                | Pending |
| **AC-016** | Production remains untouched                                             | Governance        | No production commits, no production DB connection               | PASS    |
| **AC-017** | `main` remains untouched                                                 | Git Workflow      | Target is `development` only                                     | PASS    |

---

## 2. Test Execution Matrix

### 2.1. PostgreSQL / pgTAP Tests (`supabase/tests/database/0050_overall_roles.test.sql`)

1. **Schema Structure:**
   - `public.overall_role` enum exists with exactly `'owner'`, `'manager'`, `'assistant_manager'`.
   - `public.overall_roles` table exists with primary key `id`, foreign key `profile_id` referencing `profiles(id)`.
   - `unique (profile_id)` constraint exists.
   - RLS is enabled on `public.overall_roles`.
   - `anon` has no privileges on `overall_roles`.
   - `authenticated` has only `SELECT` privilege on `overall_roles`.
2. **Data & Constraint Invariants:**
   - Inserting `'owner'`, `'manager'`, `'assistant_manager'` succeeds.
   - Inserting unsupported values (e.g., `'server'`, `'host'`, `'bogus'`) throws error.
   - Inserting duplicate role for the same `profile_id` throws unique violation error.
3. **RLS & Privilege Enforcement:**
   - User A with an overall role can read their own row.
   - User B cannot read User A's overall role row.
   - Authenticated user cannot insert an overall role row (denied by RLS).
   - Authenticated user cannot update an overall role row (denied by RLS).
   - Authenticated user cannot delete an overall role row (denied by RLS).

### 2.2. TypeScript Unit Tests

1. **Domain Model (`src/features/auth/domain/overall-role.test.ts`):**
   - `isOverallRole`: returns `true` for `'owner'`, `'manager'`, `'assistant_manager'`; `false` for others.
   - `normalizeOverallRole`: correctly maps `'owner'`, `'overall_owner'`, `'manager'`, `'overall_manager'`, `'assistant_manager'`, `'overall_assistant_manager'`.
   - Rejects unknown values, returning `null`.
2. **Server Reader Contract (`src/features/auth/data/overall-role.test.ts`):**
   - Returns `null` when user has no overall role.
   - Returns `'owner'` when user is overall owner.
   - Returns `'manager'` when user is overall manager.
   - Returns `'assistant_manager'` when user is overall assistant manager.
   - Fails safely (returns `null`) on query errors or corrupted values.
