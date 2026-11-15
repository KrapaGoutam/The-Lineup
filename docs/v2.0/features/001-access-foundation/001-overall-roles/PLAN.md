# Subfeature V2-001.001: Overall Roles Foundation — Implementation Plan

Parent Feature: [V2-001: Access & Role Foundation](../README.md)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Tracking Issue: [#259](https://github.com/KrapaGoutam/The-Lineup/issues/259)  
Parent Issues: [#249](https://github.com/KrapaGoutam/The-Lineup/issues/249), [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248)  
Status: `IN_PROGRESS`  
Branch: `feature/v2.0-001.001-overall-roles`

---

## 1. Objective & Scope

Establish the authoritative Overall Role data model, domain contracts, secure minimal read/write foundation required for future authorization work, deterministic tests, and generated types.

### Supported Overall Roles:

- **Overall Owner** (`owner`): Baseline platform-wide owner access across all organizations and locations.
- **Overall Manager** (`manager`): Baseline platform-wide manager access across all organizations and locations.
- **Overall Assistant Manager** (`assistant_manager`): Baseline platform-wide assistant manager access across all organizations and locations.

### Out of Scope for V2-001.001:

- Organization membership relational bindings (V2-001.002)
- Location access and scoping (V2-001.003, V2-001.004)
- Multi-location/role assignments (V2-001.005)
- Full authorization resolver integration (V2-001.006)
- RLS policy changes on existing application tables (V2-001.007 / #106)
- UI / navigation administration screens

---

## 2. Architecture & Design Decisions

### Decision: Dedicated Assignment Table (`overall_roles`)

- **Table:** `public.overall_roles`
- **Identity Key:** `profile_id uuid not null references public.profiles(id) on delete cascade`
- **Scope:** System-wide (user-scoped). No `organization_id` or `location_id`.
- **Cardinality Constraint:** `constraint overall_roles_profile_id_key unique (profile_id)`. Guarantees exactly zero or one active overall role per user.
- **Role Type:** `public.overall_role as enum ('owner', 'manager', 'assistant_manager')`.
- **Audit Columns:** `created_at timestamptz not null default now()`, `created_by uuid references public.profiles(id) on delete set null`, `updated_at timestamptz not null default now()`.

### Alternatives Considered & Rejected:

1. **Column on `public.profiles` (`profiles.overall_role`):**  
   _Rejected_: In the current schema, `profiles_update_self` allows authenticated users to update their own profile row (`using (id = auth.uid()) with check (id = auth.uid())`). Adding a privileged authorization column to `profiles` would allow unauthorized self-promotion unless complex triggers or policy rewrites were introduced.
2. **Reusing `public.app_role` with CHECK constraint:**  
   _Rejected_: `app_role` has values `('owner', 'general_manager', 'shift_manager', 'host', 'server')`. It lacks `manager` and `assistant_manager`, and contains local operational roles (`host`, `server`) that must never be overall roles. A dedicated enum is clean, strongly typed, and unambiguous.
3. **Implicit `organizations.created_by` inference:**  
   _Rejected_: Explicitly prohibited by V2 architecture rules and Issue #106. Overall access must never be inferred from organization creation.

### Decision Change Record:

- **Phase 0 Draft:** `DATA_MODEL.md` originally proposed `unique (profile_id, role)` and enum values `overall_owner`, `overall_manager`, `overall_assistant_manager`.
- **Refinement:**
  - Enforced `unique (profile_id)` so the database guarantees at most one active overall role per user (preventing simultaneous conflicting roles).
  - Adopted canonical repository role conventions (`owner`, `manager`, `assistant_manager`) for persistence while supporting friendly display labels ("Overall Owner", "Overall Manager", "Overall Assistant Manager") and normalizing in the domain model.

---

## 3. Security Boundary & RLS

- Table is protected by PostgreSQL RLS: `alter table public.overall_roles enable row level security;`
- Privileges revoked from `anon` and `authenticated`.
- Read policy: `overall_roles_select_self` allows authenticated users to read ONLY their own overall role (`profile_id = (select auth.uid())`).
- Write policy: **NONE** for `authenticated`. No `INSERT`, `UPDATE`, or `DELETE` policy is granted.
- **Fail-Closed Guarantee:** Any attempt by an authenticated user to directly insert, update, or delete rows in `overall_roles` is rejected by PostgreSQL RLS.

---

## 4. Implementation Steps

1. Create forward-only migration: `supabase/migrations/20261102213000_overall_roles_foundation.sql`.
2. Generate updated TypeScript database types.
3. Implement domain models:
   - `src/features/auth/domain/overall-role.ts`: Types, validators, normalization.
   - `src/features/auth/data/overall-role.ts`: Server-side `getOverallRole(userId)` and `getCurrentUserOverallRole()`.
4. Create pgTAP database test: `supabase/tests/database/0050_overall_roles.test.sql`.
5. Create Vitest unit tests:
   - `src/features/auth/domain/overall-role.test.ts`
   - `src/features/auth/data/overall-role.test.ts`
6. Verify local test suites, formatting, lint, and typecheck.
7. Apply migration to hosted DEV and capture evidence.
8. Create PR to `development`, verify exact-head CI, merge via merge commit.
