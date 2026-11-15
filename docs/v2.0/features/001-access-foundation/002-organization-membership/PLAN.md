# Subfeature V2-001.002: Organization Membership — Implementation Plan

Parent Feature: [V2-001: Access & Role Foundation](../README.md)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Tracking Issue: [#261](https://github.com/KrapaGoutam/The-Lineup/issues/261)  
Parent Issues: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248), [#249](https://github.com/KrapaGoutam/The-Lineup/issues/249)

---

## 1. Executive Summary & Architecture Audit

V2-001.002 establishes the canonical organization membership data model and server-authoritative read contracts for The Lineup V2.0.

In V2.0, identity and authorization are decoupled from single-tenant assumptions:

- **1 Person &rarr; 1 Organization** is supported.
- **1 Person &rarr; N Organizations** is supported simultaneously, safely, and explicitly.

### Audit of Existing Schema (`public.memberships`)

Inspection of `supabase/migrations/20260905065702_initial_schema.sql` revealed:

- **Primary Key:** `id bigint generated always as identity primary key`
- **Tenant FK:** `organization_id uuid not null references public.organizations (id) on delete cascade`
- **Profile FK:** `profile_id uuid not null references public.profiles (id) on delete cascade`
- **Role Array:** `roles public.app_role[] not null check (cardinality(roles) > 0)`
- **Active State:** `active boolean not null default true`
- **Created Timestamp:** `created_at timestamptz not null default now()`
- **Uniqueness Constraint:** `unique (organization_id, profile_id)`
- **Partial Index:** `create index memberships_profile_org_idx on public.memberships (profile_id, organization_id) where active;`
- **Row-Level Security:** Enabled with strict policies (`memberships_select_member`, `memberships_insert_manager`, `memberships_update_manager`, `memberships_delete_manager`).

### Schema Decision: Outcome A — Reused Without Schema Change

Because `public.memberships` already natively enforces `(organization_id, profile_id)` uniqueness (allowing one person to have distinct rows across multiple organizations while preventing duplicate rows within the same organization), tracks boolean `active` state, provides foreign-key cascades, and maintains index coverage, **no schema migration is required**. The existing relational model is completely sound and canonical for V2 organization membership.

---

## 2. Legacy Assumptions Found

1. **Single-Organization Cookie & Route Assumption**:
   - `src/lib/current-user.ts` queries `memberships` using an explicit `restaurantSlug` and `.maybeSingle()`, resolving the user's role for that single organization.
   - While valid for legacy single-tenant navigation, V2 requires readers that return all memberships for a user across all affiliated organizations without single-org truncation (`limit(1)`).
2. **Creator Bypass Debt (#106)**:
   - `private.has_org_role` contains a clause granting access if `organizations.created_by = auth.uid()`.
   - V2-001.002 does NOT rely on or expand this creator bypass. Membership must be explicitly stored in `public.memberships`. Global removal of the bypass is preserved for V2-001.007.

---

## 3. Chosen V2 Membership Contract

### Domain Entity (`OrganizationMembership`)

Defined in `src/features/auth/domain/organization-membership.ts`:

- `id: number`
- `organizationId: string`
- `profileId: string`
- `roles: readonly DatabaseAppRole[]`
- `role: AppRole` (normalized capability tier: `owner`, `manager`, `server`)
- `designation: Designation` (`owner`, `manager`, `assistant_manager`, `staff`)
- `active: boolean`
- `createdAt?: string`

### Pure Domain Helpers

- `isMembershipActive(membership)`: Type-safe active check.
- `filterActiveMemberships(memberships)`: Filters to active memberships.
- `hasActiveOrganizationMembership(memberships, orgId)`: Determines if user actively belongs to tenant.
- `findOrganizationMembership(memberships, orgId)`: Finds membership record by organization ID.
- `mapMembershipRow(row)`: Pure mapper from database row to canonical domain object.

### Server-Authoritative Data Readers

Defined in `src/features/auth/data/organization-membership.ts`:

- `getOrganizationMembership(profileId, organizationId, client?)`: Returns specific membership (active or inactive).
- `listOrganizationMemberships(profileId, client?)`: Returns all memberships (active and inactive) for a profile, ordered deterministically.
- `listActiveOrganizationMemberships(profileId, client?)`: Returns all active memberships for a profile without `limit(1)`.
- `getCurrentUserOrganizationMemberships(client?)`: Session-resolved reader for all caller memberships.
- `getCurrentUserActiveOrganizationMemberships(client?)`: Session-resolved reader for active caller memberships.

---

## 4. Invariant Boundaries & Explicit Defers

1. **Organization Membership &ne; Location Access**:
   Belonging to an organization does NOT automatically grant access to branches/locations within that organization. Location access is strictly deferred to **V2-001.003**.
2. **Organization Roles &ne; Location Roles**:
   `memberships.roles` captures organization-level affiliation. Per-branch roles (e.g. Manager at Branch A, Assistant Manager at Branch B) are strictly deferred to **V2-001.004**.
3. **No Active Organization Context Selection**:
   Dropdowns, localStorage, cookies, and context-switching UI are strictly deferred to **V2-003**.
4. **Overall Roles Remain Separate**:
   Baseline system-wide authority remains stored in `public.overall_roles` (V2-001.001) and is not conflated with tenant memberships.
5. **No Elimination of #106 Yet**:
   Security hardening of `private.has_org_role` remains mapped to **V2-001.007**.
