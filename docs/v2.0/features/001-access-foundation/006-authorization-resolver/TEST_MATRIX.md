# Subfeature V2-001.006: Canonical Authorization Resolver — Test Matrix

Parent Feature: [V2-001: Access & Role Foundation](../README.md)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Tracking Issue: [#269](https://github.com/KrapaGoutam/The-Lineup/issues/269)  
Status: `IN_PROGRESS`

---

## 1. Overall Role Tests (OVR)

| Test ID     | Scenario                                                                | Expected Evaluation                                                                    | Status          |
| ----------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------- |
| **OVR-001** | Overall Owner evaluated in valid organization context                   | `allowed: true`, `effectiveLevel: 'owner'`, has `overall:owner`                        | PASS (Verified) |
| **OVR-002** | Overall Owner evaluated in valid location context                       | `allowed: true`, `effectiveLevel: 'owner'`, has `location:manage` & `overall:owner`    | PASS (Verified) |
| **OVR-003** | Overall Owner has no synthetic org or location membership rows          | `allowed: true`, sources: `['overall']`                                                | PASS (Verified) |
| **OVR-004** | Overall Manager applies across all valid locations                      | `allowed: true`, `effectiveLevel: 'manager'`, has `overall:manage`                     | PASS (Verified) |
| **OVR-005** | Overall Manager cannot receive Owner-exclusive capabilities             | `allowed: true`, does NOT have `overall:owner`                                         | PASS (Verified) |
| **OVR-006** | Overall Assistant Manager applies across all valid locations            | `allowed: true`, `effectiveLevel: 'assistant_manager'`, has `overall:assistant_manage` | PASS (Verified) |
| **OVR-007** | Overall Assistant Manager cannot receive Manager-exclusive capabilities | `allowed: true`, does NOT have `overall:manage` or `location:manage`                   | PASS (Verified) |
| **OVR-008** | Overall Assistant Manager cannot receive Owner-exclusive capabilities   | `allowed: true`, does NOT have `overall:owner`                                         | PASS (Verified) |
| **OVR-009** | Missing Overall Role is valid for scoped users                          | Handled gracefully without error; falls through to scoped rules                        | PASS (Verified) |
| **OVR-010** | Unsupported/corrupted Overall Role strings                              | Fails closed, role rejected, no privileges granted                                     | PASS (Verified) |
| **OVR-011** | Overall role is NOT inferred from `organizations.created_by`            | No creator bypass; non-assigned creator gets no overall access                         | PASS (Verified) |
| **OVR-012** | Inactive ordinary membership does not erase valid Overall role          | Overall Manager remains effective even if scoped org membership is inactive            | PASS (Verified) |

---

## 2. Organization Role Tests (ORG)

| Test ID     | Scenario                                                                     | Expected Evaluation                                                          | Status          |
| ----------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------- |
| **ORG-001** | Active organization membership considered in tenant context                  | `allowed: true` for org-level query, has `org:member`                        | PASS (Verified) |
| **ORG-002** | Inactive organization membership grants no organization-scoped authority     | `allowed: false`, `denialReason: 'INACTIVE_ORGANIZATION_MEMBERSHIP'`         | PASS (Verified) |
| **ORG-003** | Membership in Monks does not grant Liquor Tap authority                      | `allowed: false`, `denialReason: 'NO_ORGANIZATION_MEMBERSHIP'`               | PASS (Verified) |
| **ORG-004** | Membership in Liquor Tap does not grant Monks authority                      | `allowed: false`, `denialReason: 'NO_ORGANIZATION_MEMBERSHIP'`               | PASS (Verified) |
| **ORG-005** | Ordinary organization membership does not automatically grant every location | Member of Liquor Tap without League City assignment is DENIED at League City | PASS (Verified) |
| **ORG-006** | Organization-level admin roles (Owner/GM)                                    | Grants `org:admin` at organization scope                                     | PASS (Verified) |
| **ORG-007** | No organization role inferred from creator identity                          | Zero reliance on `created_by`                                                | PASS (Verified) |
| **ORG-008** | Unsupported legacy/unknown role values fail closed                           | Returns `INVALID_ROLE` / DENY                                                | PASS (Verified) |

---

## 3. Location Role Tests (LOC)

| Test ID     | Scenario                                                                    | Expected Evaluation                                                                     | Status          |
| ----------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------- |
| **LOC-001** | Active org membership + active location assignment + staff role             | `allowed: true`, `effectiveLevel: 'staff'`, has `location:operate`                      | PASS (Verified) |
| **LOC-002** | Active org membership + active location assignment + manager role           | `allowed: true`, `effectiveLevel: 'manager'`, has `location:manage`                     | PASS (Verified) |
| **LOC-003** | Active org membership + active location assignment + assistant_manager role | `allowed: true`, `effectiveLevel: 'assistant_manager'`, has `location:assistant_manage` | PASS (Verified) |
| **LOC-004** | Inactive org membership invalidates location-scoped grant                   | `allowed: false`, `denialReason: 'INACTIVE_ORGANIZATION_MEMBERSHIP'`                    | PASS (Verified) |
| **LOC-005** | Inactive location assignment invalidates location-scoped grant              | `allowed: false`, `denialReason: 'INACTIVE_LOCATION_ASSIGNMENT'`                        | PASS (Verified) |
| **LOC-006** | Missing location assignment denies ordinary scoped location access          | `allowed: false`, `denialReason: 'NO_LOCATION_ASSIGNMENT'`                              | PASS (Verified) |
| **LOC-007** | NASA Manager role does not imply League City Manager                        | NASA = manager; League City = DENY (if unassigned)                                      | PASS (Verified) |
| **LOC-008** | Webster Manager role does not imply NASA Manager                            | Webster = manager; NASA = DENY                                                          | PASS (Verified) |
| **LOC-009** | Location role changes are independently reflected                           | Updating NASA from manager to staff leaves Webster unchanged                            | PASS (Verified) |
| **LOC-010** | Location role does not grant unrelated organization authority               | NASA role gives zero authority in Monks                                                 | PASS (Verified) |

---

## 4. Role Combination Tests (COMBO)

| Test ID       | Scenario                                                                                    | Expected Evaluation                                                       | Status          |
| ------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------- |
| **COMBO-001** | Overall Assistant Manager + NASA Manager explicit role                                      | At NASA: `effectiveLevel: 'manager'`, has `location:manage` (elevation)   | PASS (Verified) |
| **COMBO-002** | Overall Assistant Manager at unassigned League City                                         | At League City: `effectiveLevel: 'assistant_manager'` (baseline persists) | PASS (Verified) |
| **COMBO-003** | Overall Manager + explicit Staff at NASA                                                    | At NASA: `effectiveLevel: 'manager'` (baseline dominates, no downgrade)   | PASS (Verified) |
| **COMBO-004** | Overall Owner + explicit Assistant Manager at NASA                                          | At NASA: `effectiveLevel: 'owner'` (owner baseline dominates)             | PASS (Verified) |
| **COMBO-005** | Ordinary org member + NASA Manager                                                          | Manager at NASA only; no overall baseline elsewhere                       | PASS (Verified) |
| **COMBO-006** | Inactive location role + active Overall Manager                                             | Overall Manager baseline remains effective                                | PASS (Verified) |
| **COMBO-007** | No overall role + no applicable org/location authority                                      | `allowed: false`, `effectiveLevel: null`, capabilities: `[]`              | PASS (Verified) |
| **COMBO-008** | Overall Manager does not inherit Overall Owner-exclusive privileges from unrelated org data | Denies `overall:owner` unconditionally                                    | PASS (Verified) |

---

## 5. Tenant Safety Tests (TENANT)

| Test ID        | Scenario                                        | Expected Evaluation                                                   | Status          |
| -------------- | ----------------------------------------------- | --------------------------------------------------------------------- | --------------- |
| **TENANT-001** | Monks org + NASA location mismatch              | `allowed: false`, `denialReason: 'TENANT_MISMATCH'`                   | PASS (Verified) |
| **TENANT-002** | Liquor Tap org + Webster location mismatch      | `allowed: false`, `denialReason: 'TENANT_MISMATCH'`                   | PASS (Verified) |
| **TENANT-003** | Nonexistent location ID                         | `allowed: false`, `denialReason: 'LOCATION_NOT_FOUND'`                | PASS (Verified) |
| **TENANT-004** | Nonexistent organization ID                     | `allowed: false`, `denialReason: 'ORGANIZATION_NOT_FOUND'`            | PASS (Verified) |
| **TENANT-005** | Incorrect caller identity (unauthenticated)     | `allowed: false`, `denialReason: 'UNAUTHENTICATED'`                   | PASS (Verified) |
| **TENANT-006** | Caller-supplied role assertion                  | Ignored; only server-verified records evaluated                       | PASS (Verified) |
| **TENANT-007** | Unauthorized inspection of another user's roles | Denied fail-closed                                                    | PASS (Verified) |
| **TENANT-008** | Query error on database fetch                   | Fails closed with `allowed: false`, `denialReason: 'QUERY_ERROR'`     | PASS (Verified) |
| **TENANT-009** | Missing or incomplete authority data            | Fails closed with `allowed: false`, `denialReason: 'INCOMPLETE_DATA'` | PASS (Verified) |
| **TENANT-010** | No creator-bypass authority in new resolver     | Creator has no authority without active role assignment               | PASS (Verified) |

---

## 6. Canonical Permanent Acceptance Matrix (Jack, Sam, Tom, Jerry)

| User      | Target Org | Target Location | Scoped Assignment                             | Expected Evaluation                     | Status          |
| --------- | ---------- | --------------- | --------------------------------------------- | --------------------------------------- | --------------- |
| **Jack**  | Monks      | Webster         | Monks Member + Webster Staff                  | **ALLOW** (`effectiveLevel: 'staff'`)   | PASS (Verified) |
| **Jack**  | Liquor Tap | NASA            | Liquor Tap Member + NASA Staff                | **ALLOW** (`effectiveLevel: 'staff'`)   | PASS (Verified) |
| **Jack**  | Liquor Tap | League City     | Liquor Tap Member + League City Staff         | **ALLOW** (`effectiveLevel: 'staff'`)   | PASS (Verified) |
| **Sam**   | Monks      | Webster         | None in Monks                                 | **DENY** (`NO_ORGANIZATION_MEMBERSHIP`) | PASS (Verified) |
| **Sam**   | Liquor Tap | NASA            | Liquor Tap Member + NASA Staff                | **ALLOW** (`effectiveLevel: 'staff'`)   | PASS (Verified) |
| **Sam**   | Liquor Tap | League City     | Liquor Tap Member + No League City assignment | **DENY** (`NO_LOCATION_ASSIGNMENT`)     | PASS (Verified) |
| **Tom**   | Monks      | Webster         | Monks Member + Webster Staff                  | **ALLOW** (`effectiveLevel: 'staff'`)   | PASS (Verified) |
| **Tom**   | Liquor Tap | NASA            | None in Liquor Tap                            | **DENY** (`NO_ORGANIZATION_MEMBERSHIP`) | PASS (Verified) |
| **Jerry** | Monks      | Webster         | Monks Member + Webster Staff                  | **ALLOW** (`effectiveLevel: 'staff'`)   | PASS (Verified) |
| **Jerry** | Liquor Tap | NASA            | Liquor Tap Member + NASA Staff                | **ALLOW** (`effectiveLevel: 'staff'`)   | PASS (Verified) |
| **Jerry** | Liquor Tap | League City     | Liquor Tap Member + No League City assignment | **DENY** (`NO_LOCATION_ASSIGNMENT`)     | PASS (Verified) |

---

## 7. John Mixed-Role Matrix

| User                         | Target Org | Target Location | Explicit Role     | Expected Evaluation                                                          | Status          |
| ---------------------------- | ---------- | --------------- | ----------------- | ---------------------------------------------------------------------------- | --------------- |
| **John**                     | Liquor Tap | NASA            | Manager           | `allowed: true`, `effectiveLevel: 'manager'`                                 | PASS (Verified) |
| **John**                     | Liquor Tap | League City     | Assistant Manager | `allowed: true`, `effectiveLevel: 'assistant_manager'`                       | PASS (Verified) |
| **John**                     | Monks      | Webster         | Manager           | `allowed: true`, `effectiveLevel: 'manager'`                                 | PASS (Verified) |
| **John (After NASA update)** | Liquor Tap | NASA            | Staff             | `allowed: true`, `effectiveLevel: 'staff'` (Webster & League City unchanged) | PASS (Verified) |
