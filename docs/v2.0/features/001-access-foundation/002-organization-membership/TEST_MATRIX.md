# Subfeature V2-001.002: Organization Membership — Test Matrix

Parent Feature: [V2-001: Access & Role Foundation](../README.md)  
Subfeature Directory: `docs/v2.0/features/001-access-foundation/002-organization-membership/`  
Tracking Issue: [#261](https://github.com/KrapaGoutam/The-Lineup/issues/261)

---

## 1. Database & pgTAP Test Coverage (`0051_organization_membership.test.sql`)

| ID          | Description                                  | Target Invariant                                     | Expected Result                                  | Status |
| ----------- | -------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------ | ------ |
| **DB-001**  | Active membership in Monks                   | One profile can belong to Organization A             | Insert succeeds, query confirms active           | PASS   |
| **DB-002**  | Simultaneous active membership in Liquor Tap | Same profile can belong to Organization B            | Insert succeeds, query confirms active           | PASS   |
| **DB-003**  | Independence of membership rows              | Modifying role/status in Org A does not impact Org B | Row in Org A updated, Row in Org B untouched     | PASS   |
| **DB-004**  | Duplicate prevention                         | Same `(profile_id, organization_id)` rejected        | Postgres throws `23505` (unique violation)       | PASS   |
| **DB-005**  | Role coexistence across memberships          | Different organization roles for one person          | Counts distinct roles = 2 for single profile     | PASS   |
| **DB-006**  | Inactive membership persistence              | Flipping `active = false` preserves row              | Record persists for history and audit            | PASS   |
| **DB-007**  | Inactive distinguishable from active         | Inactive excluded from active readers                | Query `where active = true` returns 1; total = 2 | PASS   |
| **DB-008a** | Empty role array rejection                   | Cardinality check on `memberships.roles`             | Postgres throws `23514` (check violation)        | PASS   |
| **DB-008b** | Overall role enum value rejection            | Overall roles not conflated with org roles           | Postgres throws `22P02` (enum violation)         | PASS   |
| **DB-009a** | Foreign key profile integrity                | Non-existent profile ID rejected                     | Postgres throws `23503` (FK violation)           | PASS   |
| **DB-009b** | Foreign key organization integrity           | Non-existent organization ID rejected                | Postgres throws `23503` (FK violation)           | PASS   |
| **DB-010**  | Unauthorized self-enrollment blocked         | Normal user cannot insert own membership             | Postgres throws `42501` (RLS violation)          | PASS   |
| **DB-011**  | Unauthorized cross-user mutation blocked     | Staff member cannot insert membership for others     | Postgres throws `42501` (RLS violation)          | PASS   |
| **DB-012a** | Permitted tenant read                        | Tom can select his own membership in Monks           | Query returns Monks membership                   | PASS   |
| **DB-012b** | Cross-tenant isolation                       | Tom cannot select memberships in Liquor Tap          | Query returns 0 rows                             | PASS   |
| **DB-012c** | Cross-tenant isolation                       | Sam cannot select memberships in Monks               | Query returns 0 rows                             | PASS   |

---

## 2. Permanent Acceptance Scenarios

| Subject   | Monks Membership         | Liquor Tap Membership   | Expected Active Result                         | Test Implementation                        | Status |
| --------- | ------------------------ | ----------------------- | ---------------------------------------------- | ------------------------------------------ | ------ |
| **Jack**  | Active (General Manager) | Active (Server / Staff) | `[Monks, Liquor Tap]` (2 orgs, distinct roles) | pgTAP DB-001..DB-003, Vitest Domain & Data | PASS   |
| **Sam**   | None                     | Active (Server / Staff) | `[Liquor Tap]` (1 org, no Monks)               | pgTAP DB-012c, Vitest Domain & Data        | PASS   |
| **Tom**   | Active (Server / Staff)  | None                    | `[Monks]` (1 org, no Liquor Tap)               | pgTAP DB-012b, Vitest Domain & Data        | PASS   |
| **Jerry** | Active (Server / Staff)  | Active (Server / Staff) | `[Monks, Liquor Tap]` (2 orgs)                 | pgTAP Acceptance, Vitest Domain & Data     | PASS   |

---

## 3. Domain & Data Reader Test Suite (`Vitest`)

### Domain Tests (`organization-membership.test.ts` — 10 tests)

1. `mapMembershipRow`: Raw DB row to canonical domain entity with frozen roles.
2. `mapMembershipRow`: Role and designation mapping for owner, shift_manager, server.
3. `isMembershipActive`: Validates true, false, null, undefined.
4. `filterActiveMemberships`: Filters out deactivated memberships.
5. `hasActiveOrganizationMembership`: Accurate boolean membership verification.
6. `findOrganizationMembership`: Finds membership record by organization ID regardless of active status.
7. Jack acceptance scenario: Two active memberships with independent roles.
8. Sam acceptance scenario: Single active membership in Liquor Tap only.
9. Tom acceptance scenario: Single active membership in Monks only.
10. Jerry acceptance scenario: Two active memberships across both tenants.

### Data Reader Tests (`organization-membership.test.ts` — 16 tests)

1. `getOrganizationMembership`: Returns null for empty inputs.
2. `getOrganizationMembership`: Returns null for absent records.
3. `getOrganizationMembership`: Returns active membership.
4. `getOrganizationMembership`: Returns inactive membership with `active: false`.
5. `getOrganizationMembership`: Fails closed on database error.
6. `listOrganizationMemberships`: Returns empty array on empty profile ID.
7. `listOrganizationMemberships`: Returns both active and inactive memberships.
8. `listOrganizationMemberships`: Fails closed on database error.
9. `listActiveOrganizationMemberships`: Returns only active memberships without `limit(1)`.
10. `listActiveOrganizationMemberships`: Returns empty array when profile has zero active memberships.
11. `getCurrentUserOrganizationMemberships`: Returns empty array when unauthenticated.
12. `getCurrentUserActiveOrganizationMemberships`: Returns active memberships for authenticated user.
13. Jack multi-org data reader acceptance.
14. Sam single-org data reader acceptance.
15. Tom single-org data reader acceptance.
16. Jerry multi-org data reader acceptance.

---

## 4. Regression Test Verification

| Suite                        | File / Scope                                    | Tests Run   | Result | Notes                                          |
| ---------------------------- | ----------------------------------------------- | ----------- | ------ | ---------------------------------------------- |
| **Overall Roles V2-001.001** | `0050_overall_roles.test.sql`                   | 22/22       | PASS   | Zero regressions on overall roles              |
| **Overall Roles Domain**     | `src/features/auth/domain/overall-role.test.ts` | 9/9         | PASS   | Unchanged, green                               |
| **Overall Roles Data**       | `src/features/auth/data/overall-role.test.ts`   | 11/11       | PASS   | Unchanged, green                               |
| **Member Deactivation**      | `0008_member_deactivation.test.sql`             | 5/5         | PASS   | Existing active enforcement intact             |
| **All Auth Tests**           | `src/features/auth/**`                          | 76/76       | PASS   | 10 test files green                            |
| **Full Database Suite**      | `supabase/tests/database/*.test.sql`            | 1,594/1,594 | PASS   | 51 test files green                            |
| **Full Unit Suite**          | `npm test`                                      | 2,169/2,169 | PASS   | 165 test files green (7 skipped)               |
| **Code Quality**             | `npm run check`                                 | N/A         | PASS   | Prettier, ESLint 0 warnings, Next/TS typecheck |
