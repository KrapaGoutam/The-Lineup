# Subfeature V2-001.003: Location Access — Test Matrix

Parent Feature: [V2-001: Access & Role Foundation](../README.md)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Tracking Issue: [#263](https://github.com/KrapaGoutam/The-Lineup/issues/263)

---

## 1. Database (pgTAP) Test Matrix — `0052_location_access.test.sql`

| Test ID         | Category         | Description                     | Target Object / Logic                                                                 | Status   |
| :-------------- | :--------------- | :------------------------------ | :------------------------------------------------------------------------------------ | :------- |
| **DB-001**      | Schema           | Table existence                 | `has_table('public', 'location_memberships')`                                         | **PASS** |
| **DB-002a..f**  | Schema           | Column definitions              | `id`, `location_id`, `profile_id`, `active`, `created_at`, `updated_at`               | **PASS** |
| **DB-003a..b**  | Constraints      | Primary key & uniqueness        | PK on `id`, Unique on `(location_id, profile_id)`                                     | **PASS** |
| **DB-004..007** | Relational       | Multi-location assignments      | Jack assigned to Webster, NASA, and League City                                       | **PASS** |
| **DB-008**      | Constraints      | Duplicate assignment prevented  | Duplicate insert throws SQLSTATE `23505`                                              | **PASS** |
| **DB-009**      | Relational       | Multiple people per location    | NASA contains Jack, Sam, and Jerry simultaneously                                     | **PASS** |
| **DB-010**      | Invariant        | Org membership != location      | Sam has Liquor Tap org membership, but no League City row                             | **PASS** |
| **DB-011a..c**  | Evaluation       | Scoped effective access         | Sam: NASA ALLOW, League City DENY, Webster DENY                                       | **PASS** |
| **DB-012**      | Invariant        | Org deactivation scenario       | Jerry NASA access evaluates to DENY when Liquor Tap membership is inactive            | **PASS** |
| **DB-012b**     | Isolation        | Multi-org independence          | Jerry Webster access remains ALLOW while Liquor Tap membership is inactive            | **PASS** |
| **DB-013**      | Invariant        | Location deactivation scenario  | Sam NASA access evaluates to DENY when location assignment is set to `active = false` | **PASS** |
| **DB-014**      | Security / RLS   | Direct self-assignment rejected | Non-manager INSERT with their own `auth.uid()` throws SQLSTATE `42501`                | **PASS** |
| **DB-015**      | Security / RLS   | Cross-user assignment rejected  | Non-manager INSERT assigning another user throws SQLSTATE `42501`                     | **PASS** |
| **DB-016**      | Isolation        | Cross-organization isolation    | Tom (Monks only) has zero location assignments in Liquor Tap                          | **PASS** |
| **DB-017**      | Invariant        | No automatic branch expansion   | Sam has exactly 1 location in Liquor Tap (NASA)                                       | **PASS** |
| **DB-018**      | Schema Integrity | Real profile bindings           | All `location_memberships` rows reference valid `profiles`; no fake overall role rows | **PASS** |

---

## 2. Unit Test Matrix — Domain Layer (`location-access.test.ts`)

| Scenario                   | Inputs                                                           | Expected Output                               | Status   |
| :------------------------- | :--------------------------------------------------------------- | :-------------------------------------------- | :------- |
| **Active predicate**       | `active: true` / `active: false` / `null` / `undefined`          | `true` / `false` / `false` / `false`          | **PASS** |
| **Active filter**          | `[Webster (active), NASA (inactive), League City (active)]`      | `[Webster, League City]`                      | **PASS** |
| **Find by locationId**     | `assignments, WEBSTER` / `assignments, UNKNOWN`                  | Matching record / `null`                      | **PASS** |
| **Has active assignment**  | `assignments, NASA (inactive)` / `assignments, WEBSTER (active)` | `false` / `true`                              | **PASS** |
| **Row mapper**             | Database row with joined `locations.organization_id`             | Mapped `LocationAccess` with `organizationId` | **PASS** |
| **Jack Scenario**          | Monks: Webster, Liquor Tap: NASA, League City                    | Webster ALLOW, NASA ALLOW, League City ALLOW  | **PASS** |
| **Sam Scenario**           | Liquor Tap: NASA (no Monks, no League City)                      | NASA ALLOW, League City DENY, Webster DENY    | **PASS** |
| **Tom Scenario**           | Monks: Webster (no Liquor Tap)                                   | Webster ALLOW, NASA DENY, League City DENY    | **PASS** |
| **Jerry Scenario**         | Monks: Webster, Liquor Tap: NASA (no League City)                | Webster ALLOW, NASA ALLOW, League City DENY   | **PASS** |
| **Jerry Org Deactivation** | Liquor Tap org membership inactive, NASA assignment active       | NASA **DENY**                                 | **PASS** |
| **Location Deactivation**  | Liquor Tap org membership active, NASA assignment inactive       | NASA **DENY**                                 | **PASS** |
| **Both Inactive**          | Org membership inactive, location assignment inactive            | NASA **DENY**                                 | **PASS** |

---

## 3. Unit Test Matrix — Data Readers Layer (`location-access.test.ts`)

| Reader Function                           | Case                                    | Expected Result                                   | Status   |
| :---------------------------------------- | :-------------------------------------- | :------------------------------------------------ | :------- |
| `getLocationMembership`                   | Valid assignment exists                 | Returns `LocationAccess` entity                   | **PASS** |
| `getLocationMembership`                   | Non-existent assignment                 | Returns `null`                                    | **PASS** |
| `getLocationMembership`                   | Missing parameters / query error        | Fails closed (`null`)                             | **PASS** |
| `listLocationMemberships`                 | Multi-location user                     | Returns all records without `.limit(1)`           | **PASS** |
| `listActiveLocationMemberships`           | Multi-location user with inactive rows  | Returns active records only                       | **PASS** |
| `hasActiveLocationAccess`                 | Jack (Webster, NASA, League City)       | All evaluate to `true`                            | **PASS** |
| `hasActiveLocationAccess`                 | Sam (NASA)                              | NASA `true`, League City `false`, Webster `false` | **PASS** |
| `hasActiveLocationAccess`                 | Tom (Webster)                           | Webster `true`, NASA `false`, League City `false` | **PASS** |
| `hasActiveLocationAccess`                 | Jerry (Webster, NASA)                   | Webster `true`, NASA `true`, League City `false`  | **PASS** |
| `hasActiveLocationAccess`                 | Jerry Org Deactivation                  | NASA evaluates to `false`                         | **PASS** |
| `hasActiveLocationAccess`                 | Inactive location assignment            | Evaluates to `false`                              | **PASS** |
| `hasActiveLocationAccess`                 | Database query error                    | Fails closed (`false`)                            | **PASS** |
| `getCurrentUserLocationMemberships`       | Authenticated user                      | Returns user's location assignments               | **PASS** |
| `getCurrentUserActiveLocationMemberships` | Authenticated user                      | Returns user's active assignments                 | **PASS** |
| `currentUserHasLocationAccess`            | Assigned location / Unassigned location | `true` / `false`                                  | **PASS** |
| `Current user helpers`                    | Unauthenticated caller                  | Fails closed (`[]` or `false`)                    | **PASS** |

---

## 4. Regression Test Matrix

| Suite                        | Scope                              | Target                                                                     | Result                     | Status   |
| :--------------------------- | :--------------------------------- | :------------------------------------------------------------------------- | :------------------------- | :------- |
| **V2-001.001 Regression**    | Overall Roles                      | `0050_overall_roles.test.sql`, `overall-role.test.ts`                      | 22/22 pgTAP, 20/20 Vitest  | **PASS** |
| **V2-001.002 Regression**    | Organization Membership            | `0051_organization_membership.test.sql`, `organization-membership.test.ts` | 22/22 pgTAP, 26/26 Vitest  | **PASS** |
| **Full Database Suite**      | All platform migrations & policies | 52 pgTAP test files                                                        | 1,618 / 1,618 tests passed | **PASS** |
| **Full Vitest Suite**        | All frontend and domain modules    | 167 test files                                                             | 2,202 / 2,202 tests passed | **PASS** |
| **Next.js Production Build** | Compile, bundle, typecheck         | All 13 routes optimized                                                    | Zero errors                | **PASS** |

---

## 5. Hosted DEV Validation Matrix

| Target Project Ref     | Operation                                                 | Verification                                                   | Status        |
| :--------------------- | :-------------------------------------------------------- | :------------------------------------------------------------- | :------------ |
| `opmujepkemwcdxxorhfd` | Migration `20261102213000_overall_roles_foundation.sql`   | Applied via CLI `db push`; enum & table verified               | **SATISFIED** |
| `opmujepkemwcdxxorhfd` | Migration `20261103001500_location_access_foundation.sql` | Applied via CLI `db push`; table, 4 policies, columns verified | **SATISFIED** |
| `opmujepkemwcdxxorhfd` | Migration History Table                                   | `supabase_migrations.schema_migrations` records both versions  | **SATISFIED** |
| `ftadewtkjlaotfdvtjcv` | Production Guard                                          | Zero contact, zero link, zero migrations                       | **VERIFIED**  |
