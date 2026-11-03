# Feature V2-001: Access & Role Foundation

GitHub Issue: [#249](https://github.com/KrapaGoutam/The-Lineup/issues/249)  
Parent Issue: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Status: `NOT STARTED` (Upcoming Phase)

---

## 1. Overview and Mission

Feature V2-001 constructs the authoritative multi-tenant and multi-location access foundation for The Lineup V2.0. It defines Overall Roles, Organization Memberships, and Location Assignments, and implements the unified pure capability resolver and security hardening in PostgreSQL RLS.

---

## 2. Subfeatures

| Identifier     | Subfeature Directory           | Description                                                                                    | Status      |
| -------------- | ------------------------------ | ---------------------------------------------------------------------------------------------- | ----------- |
| **V2-001.001** | `001-overall-roles/`           | Overall Owner, Manager, and Assistant Manager entities and baseline capability rules.          | Not Started |
| **V2-001.002** | `002-organization-membership/` | Profile-to-organization membership relationship and active status enforcement.                 | Not Started |
| **V2-001.003** | `003-location-access/`         | Location access bindings ensuring staff access only assigned branches.                         | Not Started |
| **V2-001.004** | `004-per-location-roles/`      | Location-scoped roles (`Manager`, `Assistant Manager`, `Staff`) per assigned branch.           | Not Started |
| **V2-001.005** | `005-multi-assignment/`        | Multi-branch and multi-role assignment for flexible staff allocation.                          | Not Started |
| **V2-001.006** | `006-authorization-resolver/`  | Canonical pure capability resolver unifying baseline and location-specific roles.              | Not Started |
| **V2-001.007** | `007-security-hardening/`      | Permanent elimination of #106 creator bypass from `private.has_org_role` and policy hardening. | Not Started |

---

## 3. Acceptance Criteria

- All permanent scenarios (Jack, Sam, Tom, Jerry, John) pass automated unit and pgTAP tests.
- Deactivating an organization creator revokes all access (closes debt in #106).
- An employee assigned to Location A cannot read or write data at Location B unless explicitly assigned.
- Baseline Overall roles automatically apply across newly created locations.
