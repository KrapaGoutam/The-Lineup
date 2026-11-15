# Subfeature V2-002.002: Location Model — Test Matrix

Parent Feature: [V2-002: Organizations & Locations](../README.md)  
Tracking Issue: [#275](https://github.com/KrapaGoutam/The-Lineup/issues/275)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8) (#8)

---

## 1. Domain Unit Tests (`src/features/locations/domain/location.test.ts`)

| Test ID | Description                                                                  | Expected Outcome                              |
| ------- | ---------------------------------------------------------------------------- | --------------------------------------------- |
| DOM-001 | Valid location name accepted                                                 | Returns `true`                                |
| DOM-002 | Empty name rejected                                                          | Returns `false`                               |
| DOM-003 | Whitespace-only name rejected                                                | Returns `false`                               |
| DOM-004 | Overlength name (>120 chars) rejected                                        | Returns `false`                               |
| DOM-005 | Valid address accepted                                                       | `validateLocationAddress` valid: true         |
| DOM-006 | Malformed address (non-object or bad fields) rejected                        | `validateLocationAddress` valid: false        |
| DOM-007 | Legacy empty address `{}` read safely                                        | Returns valid empty address                   |
| DOM-008 | Valid IANA time zone accepted (`America/Chicago`, `UTC`, `America/New_York`) | Returns `true`                                |
| DOM-009 | Invalid time zone rejected (`Texas`, `America/Huston`)                       | Returns `false`                               |
| DOM-010 | Ambiguous fixed abbreviation rejected (`CST`, `EST`, `GMT-6`)                | Returns `false`                               |
| DOM-011 | Valid weekly operating hours accepted                                        | `validateOperatingHours` valid: true          |
| DOM-012 | Closed day represented correctly                                             | `closed: true`, null opening/closing          |
| DOM-013 | Missing hours distinguished from closed                                      | Unconfigured day distinct from `closed: true` |
| DOM-014 | Overnight hours represented correctly (17:00 -> 02:00)                       | `isOvernight: true`, valid                    |
| DOM-015 | Invalid time string rejected (e.g. `25:00`, `noon`)                          | Returns `false` / validation error            |
| DOM-016 | Invalid schedule shape rejected                                              | Validation error                              |
| DOM-017 | Location ID remains immutable                                                | Read-only contract in TypeScript              |
| DOM-018 | Organization ownership remains immutable                                     | Read-only contract in TypeScript              |
| DOM-019 | Existing cover weight preserved                                              | Included in domain entity mapping             |
| DOM-020 | Domain row mapping produces correct typed result                             | `mapLocationRow` maps all database fields     |

---

## 2. Server Reader Tests (`src/features/locations/data/location-reader.test.ts`)

| Test ID  | Description                                                | Expected Outcome                                    |
| -------- | ---------------------------------------------------------- | --------------------------------------------------- |
| READ-001 | Get location by ID                                         | Returns matching `Location`                         |
| READ-002 | Missing location returns null                              | Returns `null`                                      |
| READ-003 | Organization A returns its locations                       | Returns all locations for Org A                     |
| READ-004 | Organization B returns its locations                       | Returns all locations for Org B                     |
| READ-005 | Multiple locations in one org returned without truncation  | Returns full array (no `.limit(1)` truncation)      |
| READ-006 | Active-only listing filters inactive locations             | Only rows with `active = true` returned             |
| READ-007 | Authorized admin listing follows applicable permissions    | Returns organization's locations                    |
| READ-008 | Staff accessible locations respect explicit assignments    | Returns only assigned locations for staff           |
| READ-009 | Overall-role listing respects applicable global capability | Overall Owner/Manager can read across organizations |
| READ-010 | Cross-organization data leakage denied                     | Non-member cannot read target org's locations       |
| READ-011 | Malformed organization/location context rejected           | Returns empty / null                                |
| READ-012 | Database query errors fail closed                          | Catches error, returns null / empty array           |

---

## 3. Server Mutation Tests (`src/features/locations/data/location-mutation.test.ts`)

| Test ID | Description                                                                 | Expected Outcome                         |
| ------- | --------------------------------------------------------------------------- | ---------------------------------------- |
| MUT-001 | Authorized location provisioning succeeds                                   | Returns created `Location`               |
| MUT-002 | Unauthorized staff creation denied                                          | Fails closed with 42501                  |
| MUT-003 | Cross-org location creation denied                                          | Fails closed with 42501                  |
| MUT-004 | Valid organization required                                                 | Fails with P0002 if org does not exist   |
| MUT-005 | Duplicate location-name collision handled                                   | Fails with 23505                         |
| MUT-006 | Valid metadata update succeeds                                              | Returns updated `Location`               |
| MUT-007 | Unauthorized update denied                                                  | Fails with 42501 / permission denied     |
| MUT-008 | Invalid time zone rejected                                                  | Fails validation / error code            |
| MUT-009 | Invalid operating-hours structure rejected                                  | Fails validation / error code            |
| MUT-010 | Location ID mutation rejected                                               | Rejected                                 |
| MUT-011 | Organization ID mutation rejected                                           | Rejected                                 |
| MUT-012 | Protected lifecycle fields cannot be changed through general metadata patch | `active` ignored in general patch        |
| MUT-013 | Location creation does not assign all existing staff                        | 0 synthetic location memberships created |
| MUT-014 | Changing NASA does not alter League City                                    | Isolated mutation                        |
| MUT-015 | Changing Monks data does not modify Liquor Tap                              | Isolated mutation                        |
| MUT-016 | No hard-delete operation exposed                                            | No delete function exists                |

---

## 4. Database Security Tests (`supabase/tests/database/0057_location_model.test.sql`)

| Test ID | Description                                                          | Expected Outcome                                         |
| ------- | -------------------------------------------------------------------- | -------------------------------------------------------- |
| DB-001  | Existing `public.locations` table reused                             | `has_table('locations')` passes                          |
| DB-002  | Valid organization foreign key enforced                              | References `organizations.id`                            |
| DB-003  | Stable location UUID                                                 | Column `id` is type UUID                                 |
| DB-004  | Tenant-scoped name uniqueness                                        | Unique constraint on `(organization_id, name)`           |
| DB-005  | Time-zone persistence validation                                     | Rejects `CST`, `Texas`, accepts `America/Chicago`        |
| DB-006  | Address object validation                                            | Rejects non-object address                               |
| DB-007  | Operating-hours storage validation                                   | Rejects invalid `opening = closing`, accepts overnight   |
| DB-008  | Authenticated unauthorized INSERT rejected                           | RLS check fails for ordinary staff                       |
| DB-009  | Authenticated unauthorized UPDATE rejected                           | RLS check fails for ordinary staff                       |
| DB-010  | Cross-org SELECT restricted appropriately                            | Tenant isolation enforced                                |
| DB-011  | Cross-org mutation denied                                            | Cross-tenant write denied                                |
| DB-012  | Location organization reassignment rejected                          | Immutability trigger raises 22023                        |
| DB-013  | Creator bypass not reintroduced                                      | Non-member creator denied                                |
| DB-014  | Inactive org membership grants no scoped management authority        | Denied by `private.has_org_role`                         |
| DB-015  | Ordinary staff not automatically assigned to newly created locations | 0 membership rows created                                |
| DB-016  | Existing location membership/role assignments remain intact          | Multi-location assignments unaffected                    |
| DB-017  | No permissive-policy bypass                                          | Authenticated users without role denied                  |
| DB-018  | SECURITY DEFINER function abuse rejected                             | `public.provision_location` rejects unauthorized callers |
