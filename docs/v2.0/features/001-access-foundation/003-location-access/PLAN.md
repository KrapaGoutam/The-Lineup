# Subfeature V2-001.003: Location Access — Implementation Plan

Parent Feature: [V2-001: Access & Role Foundation](../README.md)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Tracking Issue: [#263](https://github.com/KrapaGoutam/The-Lineup/issues/263)  
Parent Issues: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248), [#249](https://github.com/KrapaGoutam/The-Lineup/issues/249)

---

## 1. Executive Summary & Architecture Audit

V2-001.003 establishes the canonical Location Access data model, relational constraints, server-authoritative read contracts, and pure effective scoped access evaluation for The Lineup V2.0.

In V2.0, identity and authorization separate organization affiliation from physical branch assignment:

```text
Person
  │
  ├── Optional Overall Role (Baseline across all orgs & locations; evaluated in V2-001.006)
  │
  ├── Organization Membership (Validates active affiliation with the tenant; V2-001.002)
  │       │
  │       └── Explicit Location Access (WHO may access WHICH physical branch; V2-001.003)
  │
  └── Future Location Role (Manager, Assistant Manager, Staff per branch; V2-001.004)
```

### Critical Invariant

$$Organization\ Membership \neq All\ Locations\ in\ Organization$$

Belonging to an organization (e.g. Liquor Tap) does **NOT** grant access to all branches under that organization (e.g., Sam has access to NASA, but is strictly denied League City).

For standard scoped users:

$$Active\ Organization\ Membership + Explicit\ Active\ Location\ Assignment = Scoped\ Location\ Access$$

### Schema Audit

1. **`public.locations`**:
   - Primary Key: `id uuid primary key default gen_random_uuid()`
   - Organization FK: `organization_id uuid not null references public.organizations(id) on delete cascade`
   - Attributes: `name text`, `time_zone text`, `address jsonb`, `cover_weight numeric`, `active boolean default true`, timestamps.
   - Unique Constraint: `unique (organization_id, name)`

2. **`public.location_memberships`**:
   - Initial state: Not present in the baseline schema (audited in local migrations and remote schema cache).
   - Decision: **Outcome B — Additive Forward Migration (`20261103001500_location_access_foundation.sql`)** establishing the canonical `public.location_memberships` table.
   - Schema Specification:
     - `id bigint generated always as identity primary key`
     - `location_id uuid not null references public.locations(id) on delete cascade`
     - `profile_id uuid not null references public.profiles(id) on delete cascade`
     - `active boolean not null default true`
     - `created_at timestamptz not null default now()`
     - `updated_at timestamptz not null default now()`
     - `unique (location_id, profile_id)`
     - Partial index: `location_memberships_profile_idx on public.location_memberships (profile_id) where active;`
     - Partial index: `location_memberships_location_idx on public.location_memberships (location_id) where active;`
     - RLS: Enabled with strict select and manager-only mutation policies.

---

## 2. Legacy Assumptions Found

1. **Legacy Primary Location Assumption**:
   - Existing codebase modules (Allocation, Bar Inventory, Schedules, Tasks, Tips) rely on `getPrimaryLocation(organizationId)` in `src/features/locations/data/primary-location.ts`.
   - `getPrimaryLocation` executes `.eq("organization_id", organizationId).order("created_at", { ascending: true }).limit(1).maybeSingle()`.
   - This assumption is preserved intact for V1 legacy callers, but is **NOT** used as the V2 access contract. V2 users legitimately hold 0..N location assignments across 1..N organizations. V2 readers return full deterministic collections.
2. **Creator Bypass Debt (#106)**:
   - `private.has_org_role` grants access if `organizations.created_by = auth.uid()`.
   - V2-001.003 does NOT rely on or expand this bypass. Location access requires explicit stored assignment. Elimination of #106 creator bypass is mapped to V2-001.007.

---

## 3. Chosen V2 Location Access Contract

### Normalized Database Design

As specified in Section 22 of the feature directive:

- A location belongs to exactly one organization (`locations.organization_id`).
- Storing `location_id` and `profile_id` on `location_memberships` normalizes ownership.
- The organization ID is derived from `locations.organization_id` via join rather than duplicate stored columns, eliminating potential data inconsistency.

### Domain Entity (`LocationAccess` / `LocationMembership`)

Defined in `src/features/auth/domain/location-access.ts`:

- `id: number`
- `locationId: string`
- `profileId: string`
- `organizationId?: string` (derived from `locations.organization_id`)
- `active: boolean`
- `createdAt?: string`
- `updatedAt?: string`

### Pure Evaluation Helpers

- `isLocationAccessActive(assignment)`: Verifies `active === true`.
- `filterActiveLocationAccess(assignments)`: Returns only active assignments.
- `findLocationAccess(assignments, locationId)`: Finds matching record.
- `hasActiveLocationAssignment(assignments, locationId)`: Checks for active assignment.
- `evaluateScopedLocationAccess({ organizationMembership, locationAssignment })`: Pure function evaluating effective scoped access.

### Server-Authoritative Data Readers

Defined in `src/features/auth/data/location-access.ts`:

- `getLocationMembership(profileId, locationId, client?)`: Returns single assignment record or `null`.
- `listLocationMemberships(profileId, client?)`: Returns all assignments (active and inactive) without `.limit(1)`.
- `listActiveLocationMemberships(profileId, client?)`: Returns active assignments.
- `hasActiveLocationAccess(profileId, locationId, client?)`: Server-authoritative evaluator enforcing both active organization membership and active explicit location assignment.
- `getCurrentUserLocationMemberships(client?)`: Returns assignments for authenticated user.
- `getCurrentUserActiveLocationMemberships(client?)`: Returns active assignments for authenticated user.
- `currentUserHasLocationAccess(locationId, client?)`: Verifies effective access for authenticated user.

---

## 4. Row-Level Security Strategy

1. **SELECT**:
   - Authenticated users can view their own assignments: `profile_id = auth.uid()`.
   - Organization members can view assignments within their organization: `private.has_org_role(l.organization_id, array['owner','general_manager','shift_manager','host','server'])`.
2. **INSERT / UPDATE / DELETE**:
   - Restricted strictly to organization managers (`owner`, `general_manager`).
   - Prevents normal users from self-assigning locations (DB-014).
   - Prevents normal users from assigning other users (DB-015).
   - Non-members cannot perform cross-tenant mutations.

---

## 5. Explicitly Deferred Capabilities

- **V2-001.004 Per-Location Roles**: Branch Manager, Assistant Manager, and Staff designations.
- **V2-001.005 Multi-Location / Multi-Role**: Multi-branch role permutations.
- **V2-001.006 Authorization Resolver**: Unifying Overall Roles with location roles and capability sets.
- **V2-001.007 RLS Security Hardening**: Permanent elimination of #106 creator bypass.
- **V2-003 Active Context**: Organization and Location switcher UI, cookies, and route context.
