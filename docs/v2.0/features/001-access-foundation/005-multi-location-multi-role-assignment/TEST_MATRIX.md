# Subfeature V2-001.005: Multi-Location / Multi-Role Assignment — Test Matrix

Parent Feature: [V2-001: Access & Role Foundation](../README.md)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Tracking Issue: [#267](https://github.com/KrapaGoutam/The-Lineup/issues/267)  
Parent Issues: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248), [#249](https://github.com/KrapaGoutam/The-Lineup/issues/249)  
Status: `IN_PROGRESS`

---

## 1. Database pgTAP Test Matrix (`0054_location_assignment.test.sql`)

| ID         | Category            | Description                                                                    | Target / Assertion                                                       | Expected        |
| ---------- | ------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | --------------- |
| **DB-001** | Multi-Location      | Target profile can hold assignments at multiple locations                      | John assigned to Webster, NASA, League City                              | PASS            |
| **DB-002** | Multi-Role          | Different roles can coexist across those locations                             | NASA (`manager`), League City (`assistant_manager`), Webster (`manager`) | PASS            |
| **DB-003** | Cardinality         | One role per location enforced by unique constraint                            | Inserting duplicate location for profile violates unique                 | EXCEPTION       |
| **DB-004** | Batch Mutation      | Batch assignment NASA + League City succeeds when authorized                   | Manager of Liquor Tap assigns both in one RPC call                       | PASS            |
| **DB-005** | Multi-Org Batch     | Batch assignment Webster + NASA succeeds when actor authorized for both orgs   | Jack (owner of both Monks & Liquor Tap) assigns in one batch             | PASS            |
| **DB-006** | Atomic Failure      | Unauthorized location in batch rejects entire operation                        | Manager of Monks includes NASA (Liquor Tap); call fails                  | EXCEPTION       |
| **DB-007** | Zero Partial Write  | No partial success after failed batch                                          | After DB-006 failure, 0 rows modified across all locations               | 0 rows affected |
| **DB-008** | Duplicate Input     | Duplicate `locationId` entries in one request rejected                         | Payload with same locationId twice throws exception                      | EXCEPTION       |
| **DB-009** | Org Membership      | Target lacking active parent org membership rejected                           | Sam (Liquor Tap only) cannot be assigned to Webster (Monks)              | EXCEPTION       |
| **DB-010** | Org Derivation      | Location determines org server-side; client cannot spoof                       | Query resolves org directly from `public.locations`                      | PASS            |
| **DB-011** | Location Validation | Invalid / non-existent location rejected                                       | Unknown location UUID throws exception                                   | EXCEPTION       |
| **DB-012** | Role Validation     | Invalid role rejected                                                          | Role `'owner'`, `'lead'`, or `'admin'` throws exception                  | EXCEPTION       |
| **DB-013** | Role Update         | Existing assignment can change role                                            | League City updated from `assistant_manager` to `manager`                | PASS            |
| **DB-014** | Deactivation        | Existing assignment can deactivate preserving row                              | NASA assignment set to `active = false`; row retained                    | PASS            |
| **DB-015** | Reactivation        | Assignment can reactivate after re-validating org membership & actor authority | NASA reactivated to `manager`; active becomes `true`                     | PASS            |
| **DB-016** | Idempotency         | Repeated identical request is idempotent                                       | Submitting identical change batch twice yields 1 row each                | PASS            |
| **DB-017** | Branch Isolation    | Changing NASA does not change League City                                      | Modifying NASA row leaves League City row intact                         | PASS            |
| **DB-018** | Org Isolation       | Changing Liquor Tap does not change Monks assignment                           | Modifying Liquor Tap leaves Webster intact                               | PASS            |
| **DB-019** | Anti-Self-Promote   | Normal staff cannot self-promote                                               | Bob (`server`) calling RPC for self fails authorization                  | EXCEPTION       |
| **DB-020** | Anti-Cross-Promote  | Normal staff cannot promote another user                                       | Bob calling RPC for another user fails authorization                     | EXCEPTION       |
| **DB-021** | Cross-Org Security  | Cross-org unauthorized manager mutation rejected                               | Manager of Monks only cannot mutate Liquor Tap assignment                | EXCEPTION       |
| **DB-022** | No Sibling Auto     | No sibling branch assignment automatically created                             | Assigning NASA does not create League City assignment                    | PASS            |
| **DB-023** | Overall Scope       | Overall role storage unchanged                                                 | No rows added to or altered in `public.overall_roles`                    | PASS            |
| **DB-024** | Org Role Scope      | Organization membership role storage unchanged                                 | No rows added to or altered in `public.memberships.roles`                | PASS            |

---

## 2. Domain Unit Test Matrix (`location-assignment.test.ts`)

| ID          | Description                             | Inputs                                                  | Expected Result                              |
| ----------- | --------------------------------------- | ------------------------------------------------------- | -------------------------------------------- |
| **DOM-001** | Valid single assignment change          | `{ locationId, action: 'assign', role: 'manager' }`     | Success; validated change returned           |
| **DOM-002** | Valid multi-location batch changes      | 3 distinct locations with valid actions/roles           | Success; 3 validated changes returned        |
| **DOM-003** | Duplicate location rejected             | 2 changes targeting identical `locationId`              | Fail: `DUPLICATE_LOCATION` code              |
| **DOM-004** | Invalid location role rejected          | Role `'owner'`, `'lead'`, or unknown string             | Fail: `INVALID_ROLE` code                    |
| **DOM-005** | Empty change set is deterministic no-op | `[]`, `null`, `undefined`                               | Success: `{ success: true, changes: [] }`    |
| **DOM-006** | Deactivate change structure             | `{ locationId, action: 'deactivate' }` (role optional)  | Success; active = false                      |
| **DOM-007** | Reactivate change structure             | `{ locationId, action: 'reactivate', role: 'manager' }` | Success; active = true, role = manager       |
| **DOM-008** | State-based input format                | `{ locationId, role: 'staff', active: true }`           | Inferred as action `'assign'`, active = true |
| **DOM-009** | Group assignments by organization       | Array of assignments across Monks and Liquor Tap        | Map containing org-scoped assignment arrays  |
| **DOM-010** | Find assignment helper                  | Existing vs non-existent location ID                    | Matching assignment or `null`                |

---

## 3. Data Layer Test Matrix (`location-assignment.test.ts`)

| ID           | Contract                               | Scenario                               | Expected Result                                           |
| ------------ | -------------------------------------- | -------------------------------------- | --------------------------------------------------------- |
| **DATA-001** | `listProfileLocationAssignments`       | Multi-branch user (John)               | Returns all assignments (NASA, LC, Webster)               |
| **DATA-002** | `listActiveProfileLocationAssignments` | Filter inactive assignments            | Returns only assignments with `active = true`             |
| **DATA-003** | `applyLocationAssignmentChanges`       | Successful authorized batch            | Calls RPC and maps returned rows                          |
| **DATA-004** | `applyLocationAssignmentChanges`       | Validation failure pre-flight          | Fails client-side before calling RPC                      |
| **DATA-005** | `applyLocationAssignmentChanges`       | Empty input                            | Returns `{ success: true, assignments: [] }` no-op        |
| **DATA-006** | `applyLocationAssignmentChanges`       | RPC error mapping: unauthorized        | Returns `{ success: false, code: 'UNAUTHORIZED' }`        |
| **DATA-007** | `applyLocationAssignmentChanges`       | RPC error mapping: membership required | Returns `{ success: false, code: 'MEMBERSHIP_REQUIRED' }` |
| **DATA-008** | `applyLocationAssignmentChanges`       | Actor identity resolution              | Actor taken from auth context; not payload param          |
| **DATA-009** | `applyLocationAssignmentChanges`       | Atomic rejection                       | Error in 1 item returns failure for whole batch           |

---

## 4. Regression Matrix

- **V2-001.001 Overall Roles**: `0050_overall_roles.test.sql`, `overall-role.test.ts` (All green)
- **V2-001.002 Org Membership**: `0051_organization_membership.test.sql`, `organization-membership.test.ts` (All green)
- **V2-001.003 Location Access**: `0052_location_access.test.sql`, `location-access.test.ts` (All green)
- **V2-001.004 Location Roles**: `0053_location_roles.test.sql`, `location-role.test.ts` (All green)
- **Operational Modules**: Tasks, Table Rotation, Bar Inventory, Passcode Auth (All green)
