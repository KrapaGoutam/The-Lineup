# Subfeature V2-002.001: Organization Model — Test Matrix

## 1. Domain Tests (`src/features/organizations/domain/organization.test.ts`)

| ID      | Description                                                    | Expected Outcome                                      | Status |
| ------- | -------------------------------------------------------------- | ----------------------------------------------------- | ------ |
| DOM-001 | Valid organization name                                        | Accepted (`isValidOrganizationName` is true)          | Passed |
| DOM-002 | Empty organization name                                        | Rejected (false)                                      | Passed |
| DOM-003 | Whitespace-only organization name                              | Rejected (false)                                      | Passed |
| DOM-004 | Overlength organization name (> 120 chars)                     | Rejected (false)                                      | Passed |
| DOM-005 | Valid slug format (`^[a-z0-9]+(?:-[a-z0-9]+)*$`)               | Accepted                                              | Passed |
| DOM-006 | Uppercase slug normalized to lowercase                         | Canonical lowercase output                            | Passed |
| DOM-007 | Invalid slug separators (leading/trailing/repeated hyphens)    | Rejected                                              | Passed |
| DOM-008 | Slug normalization is deterministic                            | Same input yields identical slug                      | Passed |
| DOM-009 | Settings must be an object                                     | Arrays, primitives, and null rejected                 | Passed |
| DOM-010 | Branding fields validated (hex color, logo path, display name) | Valid branding accepted, malicious/invalid rejected   | Passed |
| DOM-011 | Unknown safe settings preserved on merge                       | Existing keys preserved, unknown safe properties kept | Passed |
| DOM-012 | Secret-like patterns in settings                               | Rejected (no API keys, tokens, or credentials stored) | Passed |
| DOM-013 | Slug immutability policy                                       | Rejects slug mutation attempt on update payload       | Passed |
| DOM-014 | `created_by` cannot be modified via mutation payload           | Mutation payload ignores/rejects `created_by` changes | Passed |

---

## 2. Server Data Reader Tests (`src/features/organizations/data/organization-reader.test.ts`)

| ID       | Description                                              | Expected Outcome                                  | Status |
| -------- | -------------------------------------------------------- | ------------------------------------------------- | ------ |
| READ-001 | Get organization by valid ID                             | Returns canonical `Organization`                  | Passed |
| READ-002 | Get organization by valid slug                           | Returns canonical `Organization`                  | Passed |
| READ-003 | Missing organization ID or slug                          | Returns null                                      | Passed |
| READ-004 | User with active Monks membership reads Monks            | Allowed, returns Monks data                       | Passed |
| READ-005 | User with active Liquor Tap membership reads Liquor Tap  | Allowed, returns Liquor Tap data                  | Passed |
| READ-006 | Multi-org user (Jack) receives both Monks and Liquor Tap | Returns both organizations (no `limit(1)`)        | Passed |
| READ-007 | Inactive scoped membership does not grant access         | Filtered out / access denied                      | Passed |
| READ-008 | User cannot read protected metadata of unrelated org     | Denied / null                                     | Passed |
| READ-009 | Overall authorized user resolves organizations globally  | Returns all permitted orgs without synthetic rows | Passed |
| READ-010 | Database error or unauthenticated session                | Fails closed (null / empty array)                 | Passed |

---

## 3. Server Mutation Tests (`src/features/organizations/data/organization-mutation.test.ts`)

| ID      | Description                                                  | Expected Outcome                                 | Status |
| ------- | ------------------------------------------------------------ | ------------------------------------------------ | ------ |
| MUT-001 | Authorized organization creation by Overall Owner            | Succeeds, returns created organization           | Passed |
| MUT-002 | Tenant creation attempt by non-owner (Manager/Staff)         | Denied with authorization error                  | Passed |
| MUT-003 | Owner bootstrap is atomic with organization creation         | Organization + Owner membership created together | Passed |
| MUT-004 | Failed owner bootstrap rolls back tenant creation            | Zero orphaned organizations left                 | Passed |
| MUT-005 | Authorized name update by Organization Owner/GM              | Succeeds, name updated, `updated_at` refreshed   | Passed |
| MUT-006 | Unauthorized name update by staff                            | Denied                                           | Passed |
| MUT-007 | Settings update preserves unrelated existing settings        | Merged safely                                    | Passed |
| MUT-008 | Invalid settings update (non-object or secrets)              | Rejected                                         | Passed |
| MUT-009 | Branding update stays within target organization             | Updates target org only                          | Passed |
| MUT-010 | Cross-organization update attempt (Org A manager -> Org B)   | Denied                                           | Passed |
| MUT-011 | Organization ID update attempt                               | Fails closed / rejected by DB                    | Passed |
| MUT-012 | `created_by` cannot be forged or used as authorization grant | Ignored/blocked                                  | Passed |
| MUT-013 | Duplicate slug collision on creation                         | Rejected with collision error                    | Passed |
| MUT-014 | Hard delete is not exposed in public mutation contract       | No delete function exists                        | Passed |

---

## 4. Database Security Tests (`supabase/tests/database/0056_organization_model.test.sql`)

| ID     | Description                                                 | Expected Outcome                                     | Status |
| ------ | ----------------------------------------------------------- | ---------------------------------------------------- | ------ |
| DB-001 | Existing `public.organizations` table reused                | Verified table existence and columns                 | Passed |
| DB-002 | Primary key remains stable UUID                             | `id` is UUID primary key                             | Passed |
| DB-003 | Slug uniqueness constraint enforced                         | Duplicate slug insert raises 23505                   | Passed |
| DB-004 | Slug regex constraint enforced                              | Invalid slug format raises 23514                     | Passed |
| DB-005 | Name constraint enforced (1–120 characters)                 | Invalid name raises 23514                            | Passed |
| DB-006 | Settings JSONB object constraint enforced                   | Non-object settings raises 23514                     | Passed |
| DB-007 | Authenticated unauthorized user cannot select unrelated org | Zero rows returned by RLS                            | Passed |
| DB-008 | Unauthorized organization UPDATE blocked by RLS             | Denied by RLS                                        | Passed |
| DB-009 | Unauthorized direct tenant INSERT blocked                   | Non-Overall Owner insert blocked by RLS              | Passed |
| DB-010 | `created_by` does not bypass membership authorization       | Creator with inactive membership cannot update org   | Passed |
| DB-011 | Active owner membership retains management authority        | Allowed to update organization                       | Passed |
| DB-012 | Inactive owner membership loses management authority        | Denied update by RLS                                 | Passed |
| DB-013 | Cross-tenant mutation blocked by RLS                        | Org A manager cannot update Org B                    | Passed |
| DB-014 | `public.organizations_guard_immutability` trigger           | Updating `id`, `created_by`, or `created_at` raises  | Passed |
| DB-015 | `public.provision_organization` RPC atomic execution        | Rollback on initial owner failure (0 partial writes) | Passed |
| DB-016 | `public.provision_organization` Overall Owner authorization | Non-Overall Owner raises 42501                       | Passed |
