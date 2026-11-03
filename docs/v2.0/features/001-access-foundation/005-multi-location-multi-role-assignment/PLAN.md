# Subfeature V2-001.005: Multi-Location / Multi-Role Assignment — Plan

Parent Feature: [V2-001: Access & Role Foundation](../README.md)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Tracking Issue: [#267](https://github.com/KrapaGoutam/The-Lineup/issues/267)  
Parent Issues: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248), [#249](https://github.com/KrapaGoutam/The-Lineup/issues/249)  
Status: `IN_PROGRESS`

---

## 1. Context and Foundations

Subfeatures V2-001.001 through V2-001.004 established the core storage and access primitives:

1. **V2-001.001 (Overall Roles)**: `public.overall_roles` defining system-wide baseline roles (`owner`, `manager`, `assistant_manager`).
2. **V2-001.002 (Organization Membership)**: `public.memberships` mapping profiles to organizations with active status and organization roles (`owner`, `general_manager`, `shift_manager`, `host`, `server`).
3. **V2-001.003 (Location Access)**: `public.location_memberships` defining explicit branch access bindings with `unique(location_id, profile_id)`.
4. **V2-001.004 (Per-Location Roles)**: `public.location_role` enum (`manager`, `assistant_manager`, `staff`) added as a column to `public.location_memberships`.

V2-001.005 turns these independent records into an authoritative, atomic management workflow:

```text
One person
→ multiple organizations
→ multiple locations
→ one explicit role per location
```

---

## 2. Definition of "Multi-Role"

In The Lineup V2.0:

- **Multi-role DOES NOT mean multiple simultaneous roles at one location.**
- For any `(profile, location)` pair, there is exactly **ONE** canonical role in `location_memberships.role`.
- Supported location roles: `manager`, `assistant_manager`, `staff`.
- A user holding Manager at NASA, Assistant Manager at League City, and Manager at Webster is valid multi-role behavior.
- A user holding Manager + Assistant Manager simultaneously at NASA is prohibited by the schema unique constraint.

---

## 3. Explicit Change-Set Semantics

The mutation contract uses an **explicit change-set model** rather than full-list replacement:

- Omitted locations are **NEVER** implicitly deleted or deactivated.
- Every mutation instruction is explicit:
  - `assign`: create location assignment when no row exists.
  - `update`: modify role on an existing assignment.
  - `deactivate`: set `active = false`, preserving row history and identity.
  - `reactivate`: re-enable inactive assignment (`active = true`) with explicitly validated role.
- Input payloads containing duplicate `locationId` entries are strictly rejected (fail closed).
- Empty change sets evaluate to a deterministic no-op (return empty array without modifying database state).
- Repeated identical assignment requests are strictly idempotent.

---

## 4. Atomic Mutation Architecture (Narrow RPC)

Multi-location assignment changes must avoid ambiguous partial success. If an actor submits a batch containing 3 locations, and lacks authority for even 1 location, or 1 location fails validation:

- **THE ENTIRE BATCH IS REJECTED.**
- Zero mutations are committed to the database.

### Decision: Narrow Database RPC

To guarantee multi-location transaction atomicity over Supabase/PostgREST, we author a narrow PostgreSQL function:
`public.apply_location_assignment_changes(p_target_profile_id uuid, p_changes jsonb) returns setof public.location_memberships`

### Security Definer Implementation Rules

Following strict security practices:

1. **Search path locked**: `set search_path = public, private, extensions`.
2. **Actor identity verified**: `auth.uid()` is resolved server-side from JWT claims; caller cannot spoof actor identity.
3. **Target profile existence**: validated against `public.profiles`.
4. **Location existence & ownership**: resolved server-side from `public.locations.organization_id`; client cannot spoof organization identity.
5. **Actor authorization**: verified for **every affected organization** using `private.has_org_role(v_org_id, array['owner', 'general_manager']::public.app_role[])`.
6. **Target organization membership**: target profile must have an active organization membership (`public.memberships.active = true`) in the owning organization before activation or assignment.
7. **Role validation**: strictly constrained to `public.location_role` enum values (`manager`, `assistant_manager`, `staff`).
8. **Batch validation**: duplicate `locationId` instructions in a single request reject the whole batch.
9. **Execution grants**: `REVOKE ALL` from `public, anon`; `GRANT EXECUTE` to `authenticated`.

---

## 5. Deactivation and History Retention

- Assignment removal strictly prefers `active = false` over hard `DELETE`.
- This preserves audit history, row identity (`id`), created/updated timestamps, and enables clean reactivation.
- Hard delete policies are not removed in this phase (policy hardening is scheduled for V2-001.007).

---

## 6. Actor vs. Target Identity

- **Actor**: The authenticated user executing the mutation, derived strictly from `auth.uid()`.
- **Target**: The profile receiving the assignment changes, supplied as `p_target_profile_id`.
- Normal staff cannot promote themselves (self-promotion fails authorization check).
- Normal staff cannot promote or reassign other users (cross-user promotion fails authorization check).
- Managers can only mutate assignments within organizations where they hold `owner` or `general_manager` role.

---

## 7. Inherited Debt and Future Scope

- **Issue #106**: `private.has_org_role` retains creator bypass logic from legacy schema. This is tracked as inherited debt and will be resolved in **V2-001.007**.
- **No Global Authorization Resolver**: Combining Overall + Org + Location roles into effective capabilities is deferred to **V2-001.006**.
- **No UI**: UI assignment matrices, editors, and settings redesign are deferred to **V2-002.004**.
