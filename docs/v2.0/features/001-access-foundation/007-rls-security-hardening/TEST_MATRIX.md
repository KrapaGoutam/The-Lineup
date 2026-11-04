# Subfeature V2-001.007: RLS / Server Security Hardening — Test Matrix

Parent Feature: [V2-001: Access & Role Foundation](../README.md)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Tracking Issue: [#271](https://github.com/KrapaGoutam/The-Lineup/issues/271)  
Linked Debt Issue: [#106](https://github.com/KrapaGoutam/The-Lineup/issues/106)  
Status: `IN_PROGRESS`

---

## 1. Database Security Acceptance Tests (SEC)

| Test ID     | Scenario                                     | Actor Context                                                     | Expected Evaluation          | Rule Rationale                                                                               | Status  |
| :---------- | :------------------------------------------- | :---------------------------------------------------------------- | :--------------------------- | :------------------------------------------------------------------------------------------- | :------ |
| **SEC-001** | Creator with active owner membership         | Org Creator, active `owner` in `memberships`                      | **ALLOW**                    | `private.has_org_role` returns true; can read org; can manage locations                      | Pending |
| **SEC-002** | Creator with inactive membership             | Org Creator, `active = false` in `memberships`                    | **DENY**                     | `has_org_role` returns false; org select returns 0 rows; RPC throws 42501                    | Pending |
| **SEC-003** | Creator with deleted membership row          | Org Creator, no row in `memberships`                              | **DENY**                     | `has_org_role` returns false; zero access via `has_org_role` or policies                     | Pending |
| **SEC-004** | Creator without sufficient role              | Org Creator, active `server` in `memberships`                     | **DENY elevated capability** | `has_org_role` for `['owner']` returns false; assignment RPC throws 42501                    | Pending |
| **SEC-005** | Noncreator with active authorized membership | Non-creator, active `owner` in `memberships`                      | **ALLOW**                    | `has_org_role` returns true; full legitimate authority granted                               | Pending |
| **SEC-006** | Unauthorized cross-organization access       | Manager in Org A, no membership in Org B                          | **DENY**                     | `has_org_role` for Org B returns false; mutating Org B locations throws 42501                | Pending |
| **SEC-007** | Unauthorized cross-location authority        | Location Manager at NASA, no role at League City                  | **DENY**                     | Cannot mutate League City assignments; throws 42501                                          | Pending |
| **SEC-008** | Normal staff self-promotion                  | Regular staff member (role `staff`)                               | **DENY**                     | Calling `apply_location_assignment_changes` targeting self with `role: manager` throws 42501 | Pending |
| **SEC-009** | Unauthorized cross-user promotion            | Regular staff member (role `staff`)                               | **DENY**                     | Calling `apply_location_assignment_changes` targeting another user throws 42501              | Pending |
| **SEC-010** | Authenticated identity spoofing              | Authenticated caller attempting to spoof `auth.uid()`             | **DENY**                     | Function resolves actor strictly from `auth.uid()`; anonymous execution throws 28000         | Pending |
| **SEC-011** | Unauthorized batch assignment atomicity      | Manager submits batch with 1 authorized + 1 unauthorized location | **DENY (0 partial writes)**  | Entire transaction aborts on unauthorized item; zero rows created/updated                    | Pending |
| **SEC-012** | Creator bypass structural elimination        | Inspection of `private.has_org_role` function definition          | **PASS**                     | `pg_get_functiondef` contains no `created_by`; function remains `SECURITY DEFINER`           | Pending |
| **SEC-013** | Overall Owner global authority               | Overall Owner (no org/location membership)                        | **ALLOW**                    | Can manage location assignments across all valid organizations and locations                 | Pending |
| **SEC-014** | Overall Manager global authority             | Overall Manager (no org/location membership)                      | **ALLOW**                    | Can manage location assignments across all valid organizations and locations                 | Pending |
| **SEC-015** | Overall Assistant Manager boundary           | Overall Assistant Manager (no org/location membership)            | **DENY**                     | Denied manager-tier location assignment privileges across orgs; throws 42501                 | Pending |

---

## 2. Regression Suites

| Suite                                   | Scope                                                       | Expected Result        | Status  |
| :-------------------------------------- | :---------------------------------------------------------- | :--------------------- | :------ |
| **`0008_member_deactivation.test.sql`** | Updated assertion: deactivated creator fails `has_org_role` | 5/5 assertions PASS    | Pending |
| **`0050` through `0054`**               | V2-001 Access Foundation pgTAP tests                        | All suites PASS        | Pending |
| **Full pgTAP regression**               | All 55 test files in `supabase/tests/database/`             | 100% PASS (0 failures) | Pending |
| **Full Vitest suite**                   | All 173 unit/integration test files in `src/`               | 100% PASS (0 failures) | Pending |
