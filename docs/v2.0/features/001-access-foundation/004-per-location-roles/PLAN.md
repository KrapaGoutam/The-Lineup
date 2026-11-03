# Subfeature V2-001.004: Per-Location Roles — Plan

Parent Feature: [V2-001: Access & Role Foundation](../README.md)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Tracking Issue: [#265](https://github.com/KrapaGoutam/The-Lineup/issues/265)  
Parent Issues: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248), [#249](https://github.com/KrapaGoutam/The-Lineup/issues/249)  
Status: `IN_PROGRESS`

---

## 1. Context and Objective

V2-001.003 answered:

> May this user access this location? (Explicit location access via `public.location_memberships`).

V2-001.004 establishes:

> What role does this scoped user hold at a specific location?

In The Lineup V2, a person may be assigned to multiple branches within an organization or across organizations, and hold different operational roles at each branch.

### Mandatory Acceptance Scenario (John Mixed Roles)

```text
John
├── Liquor Tap / NASA         → Manager
├── Liquor Tap / League City  → Assistant Manager
└── Monks / Webster           → Manager
```

- Each branch assignment is completely independent.
- Changing John's role at League City does not affect NASA or Webster.
- Roles do not automatically propagate to sibling locations.
- Sibling locations require explicit role assignment.

---

## 2. Existing Role Model & Designation Audit

1. **Database Enum `public.app_role`**:
   Values: `'owner'`, `'general_manager'`, `'shift_manager'`, `'host'`, `'server'`.
   Defined in initial schema migration `20260905065702_initial_schema.sql`.
   Used in `public.memberships.roles` (array of `public.app_role[]` at the organization level).

2. **Domain Designations** (`src/features/auth/domain/passcode.ts`):
   Values: `'owner'`, `'manager'`, `'assistant_manager'`, `'staff'`.
   - `owner` &rarr; `'owner'`
   - `general_manager` &rarr; `'manager'`
   - `shift_manager` &rarr; `'assistant_manager'`
   - `server` / `host` &rarr; `'staff'`

3. **Overall Roles** (`public.overall_role`, V2-001.001):
   Values: `'owner'`, `'manager'`, `'assistant_manager'`.
   System-wide baseline across all organizations and locations.

4. **Owner Distinction (Section 12 Rule)**:
   There is **NO "Branch Owner"** concept. In V2 business language, "Owner Overall" (`public.overall_roles.role = 'owner'`) or organization owner (`memberships.roles @> array['owner']`) is the system/tenant owner. Location roles are strictly operational management and staff tiers: `manager`, `assistant_manager`, `staff`.

---

## 3. Storage Design Decision: Outcome A (Additive Column on `location_memberships`)

### Options Considered

- **Option A (Selected)**: Add `role public.location_role not null default 'staff'` directly to `public.location_memberships`.
- **Option B (Rejected)**: Separate table `public.location_roles` or `public.location_role_assignments`.

### Rationale

1. **One Canonical Role Per Location**: Lineup operational semantics require exactly one active operational role tier per person at a given location (`Manager`, `Assistant Manager`, or `Staff`). Multiple simultaneous operational roles at the same location are not required.
2. **Direct Integrity**: `public.location_memberships` already enforces `unique (location_id, profile_id)`. Adding `role` directly ensures:
   - A role cannot exist without an explicit location membership.
   - Deactivating the location membership (`active = false`) immediately invalidates the effective location role (fails closed).
   - Zero risk of orphan role rows or synchronization drift between membership and role records.
   - Minimal query overhead (no extra joins to resolve basic location access and role).
3. **Alignment with Target Architecture**: Matches `docs/v2.0/DATA_MODEL.md` Section 2.3 (`location_assignments` with `unique (location_id, profile_id)` and `role`).

---

## 4. Enum Definition: `public.location_role`

A dedicated PostgreSQL enum is introduced:

```sql
create type public.location_role as enum (
  'manager',
  'assistant_manager',
  'staff'
);
```

### Constraints & Invariants

- Only `'manager'`, `'assistant_manager'`, and `'staff'` are permitted.
- Any unsupported values (e.g., `'owner'`, `'lead'`, `'bogus'`) are strictly rejected by PostgreSQL type constraints.
- Default value is `'staff'`, ensuring safe fail-closed operational baseline when assigned to a location.

---

## 5. Security & RLS Architecture

### Existing Protection Audit

In `20261103001500_location_access_foundation.sql`:

- `location_memberships_select`: Authenticated users can view their own rows or any row in an organization where they are a member.
- `location_memberships_insert_manager`: Only users with `array['owner', 'general_manager']` in `private.has_org_role` can insert.
- `location_memberships_update_manager`: Only users with `array['owner', 'general_manager']` can update (`using` and `with check`).
- `location_memberships_delete_manager`: Only users with `array['owner', 'general_manager']` can delete.

### Verification Against Self-Promotion and Privilege Escalation

1. **Staff Self-Promotion**: Normal staff (`server`, `host`) do not hold `owner` or `general_manager`. Direct client attempts to `UPDATE location_memberships SET role = 'manager'` or `INSERT` elevated roles affect 0 rows / fail closed.
2. **Assistant Manager Self-Promotion**: `shift_manager` is not included in `array['owner', 'general_manager']`. An assistant manager cannot self-promote to `manager` or alter location roles.
3. **Cross-User Modification**: Non-managers cannot modify other users' roles.
4. **Inherited #106 Debt**: Policy evaluation delegates to `private.has_org_role`, which carries historic `organizations.created_by` debt. Documented as inherited debt; resolution remains strictly in V2-001.007.

---

## 6. Effective Role Evaluation Algorithm

The effective explicit location role is evaluated as:

```text
effective_location_role(profileId, locationId) =
  IF NOT active_org_membership(profileId, location.org_id) THEN NULL
  ELSE IF NOT active_location_membership(profileId, locationId) THEN NULL
  ELSE location_membership.role
```

- Inactive organization membership &rarr; `NULL` (fail closed).
- Inactive location membership (`active = false`) &rarr; `NULL` (fail closed).
- Unassigned location &rarr; `NULL` (fail closed).
- Overall roles are **NOT** considered in this subfeature (deferred to V2-001.006).

---

## 7. Deferred Scope

The following items are explicitly **deferred** to subsequent subfeatures:

1. **V2-001.005**: Multi-location bulk assignment workflows and UI.
2. **V2-001.006**: Canonical authorization resolver unifying Overall Roles, Organization Roles, and Location Roles.
3. **V2-001.007**: Security hardening removing `organizations.created_by` bypass (#106).
4. **V2-002+**: Team management role editing UI, settings dropdowns, and branch context switchers.
