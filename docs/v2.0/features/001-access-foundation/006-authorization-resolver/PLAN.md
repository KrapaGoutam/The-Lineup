# Subfeature V2-001.006: Canonical Authorization Resolver — Plan

Parent Feature: [V2-001: Access & Role Foundation](../README.md)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8) (Milestone #8)  
Tracking Issue: [#269](https://github.com/KrapaGoutam/The-Lineup/issues/269)  
Parent Issues: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248), [#249](https://github.com/KrapaGoutam/The-Lineup/issues/249)  
Branch: `feature/v2.0-001.006-authorization-resolver`  
Worktree: `.tmp/v2-auth-resolver`  
Target: `development`

---

## 1. Problem Statement & Mission

The preceding five subfeatures established the discrete pillars of The Lineup V2.0 access architecture:

1. `V2-001.001`: Overall Roles (`public.overall_roles`, `public.overall_role`)
2. `V2-001.002`: Multi-Organization Affiliation (`public.memberships`, `public.app_role[]`)
3. `V2-001.003`: Explicit Location Access (`public.location_memberships`, `active`)
4. `V2-001.004`: Independent Per-Location Roles (`public.location_memberships.role`, `public.location_role`)
5. `V2-001.005`: Atomic Multi-Location Assignment Workflow (`public.apply_location_assignment_changes`)

Until this slice, access evaluation was scattered across individual helper predicates (`evaluateScopedLocationAccess`, `evaluateEffectiveLocationRole`, `getOverallRole`).
The mission of **V2-001.006** is to create **one canonical, pure, deterministic authorization resolver and trusted server-authoritative data loader** answering:

> _"What can this authenticated user do within a specific organization and location context, and which applicable role(s) grant that authority?"_

This phase creates the authorization policy foundation. It intentionally does NOT perform an application-wide RLS rewrite (deferred to `V2-001.007`) nor touch existing operational modules.

---

## 2. Verified Role Taxonomy & Schema Audit

A critical correction to the previous handoff proposal was verified:
No speculative roles (`super_admin`, `support`, `admin`, `member`, `guest`) are introduced.

| Scope                       | Database Table / Column            | Verified PostgreSQL Enum | Canonical Values                                                        |
| --------------------------- | ---------------------------------- | ------------------------ | ----------------------------------------------------------------------- |
| **Overall Role**            | `public.overall_roles.role`        | `public.overall_role`    | `'owner'`, `'manager'`, `'assistant_manager'`                           |
| **Organization Membership** | `public.memberships.roles`         | `public.app_role[]`      | `'owner'`, `'general_manager'`, `'shift_manager'`, `'host'`, `'server'` |
| **Location Assignment**     | `public.location_memberships.role` | `public.location_role`   | `'manager'`, `'assistant_manager'`, `'staff'`                           |

---

## 3. Scope Hierarchy & Precedence Model

The Lineup V2.0 access model is not a naive single-integer rank. Overall, organization, and location roles have distinct scopes:

```text
User (auth.users / profiles)
  │
  ├── 1. Overall Role (Optional system-wide baseline across all valid orgs & locations)
  │      ├── Overall Owner: Global authority everywhere (including owner-exclusive actions)
  │      ├── Overall Manager: Manager-level authority everywhere; Owner-exclusive DENIED
  │      └── Overall Assistant Manager: Assistant-manager authority everywhere; Manager/Owner-exclusive DENIED
  │
  ├── 2. Organization Membership (Validates active affiliation with the tenant)
  │      ├── Active: Valid affiliation
  │      └── Inactive: Scoped location authority is strictly revoked (fails closed)
  │
  └── 3. Location Assignment (Explicit per-branch role assignment)
         ├── Manager: Branch managerial authority at assigned location
         ├── Assistant Manager: Branch assistant manager authority at assigned location
         └── Staff: Branch floor operations at assigned location
```

### Precedence & Composition Rules

1. **Overall Dominance & Elevation**:
   - `Overall Owner` dominates all scopes; effective level is `'owner'`.
   - `Overall Manager` provides a `'manager'` baseline at all valid locations. An explicit `'staff'` assignment at a branch does NOT downgrade the Overall Manager baseline.
   - `Overall Assistant Manager` provides an `'assistant_manager'` baseline at all valid locations. An explicit `'manager'` assignment at Location X **elevates** the user to `'manager'` at Location X, while retaining the `'assistant_manager'` baseline elsewhere.
   - Neither `Overall Manager` nor any branch manager receives `Overall Owner`-exclusive capabilities.
2. **Scoped Users (No Overall Role)**:
   - Scoped access requires **BOTH** an active organization membership (`memberships.active = true`) AND an explicit active location assignment (`location_memberships.active = true`).
   - If organization membership is inactive or missing: all scoped location authority evaluates to `DENY`.
   - If location assignment is inactive or missing: location access evaluates to `DENY`.
   - Having membership in Organization A with access to Location 1 does NOT grant access to Location 2 of Organization A (permanent acceptance matrix: Sam, Jerry).
3. **Independent Per-Location Roles**:
   - Roles across branches operate independently (John matrix: Manager at NASA, Assistant Manager at League City, Manager at Webster). Changing one branch does not propagate to others.
4. **Tenant Integrity**:
   - The resolver validates that `locations.organization_id === context.organizationId`. Mismatched pairs (e.g., Monks org + NASA location) are strictly DENIED fail-closed, even for Overall roles.

---

## 4. Canonical Capability Vocabulary

The resolver emits typed canonical capabilities:

```typescript
export const RESOLVER_CAPABILITIES = [
  // Overall system-wide capabilities
  "overall:owner", // Overall Owner authority (tenant creation, owner-exclusive config)
  "overall:manage", // Overall Manager authority (global operations management)
  "overall:assistant_manage", // Overall Assistant Manager authority (global assistant management)

  // Organization-scoped capabilities
  "org:admin", // Organization administration (Org Owner / GM)
  "org:member", // Active affiliation / membership in target tenant

  // Location-scoped capabilities
  "location:access", // Explicit or baseline access to location
  "location:manage", // Branch manager authority (schedules, floor management)
  "location:assistant_manage", // Branch assistant manager authority
  "location:operate", // Staff floor operations (rotation entries, shifts, attendance)
] as const;
```

### Capability Mapping Matrix

| Effective Level                             | Capabilities Granted                                                                                                                                                                 | Owner-Exclusive Denied?          | Manager-Exclusive Denied?                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- | ---------------------------------------------------- |
| **Owner** (`owner`)                         | `overall:owner`, `overall:manage`, `overall:assistant_manage`, `org:admin`, `org:member`, `location:access`, `location:manage`, `location:assistant_manage`, `location:operate`      | No                               | No                                                   |
| **Manager** (`manager`)                     | `overall:manage`, `overall:assistant_manage`, `org:admin` (if org-scoped admin), `org:member`, `location:access`, `location:manage`, `location:assistant_manage`, `location:operate` | **YES** (`overall:owner` denied) | No                                                   |
| **Assistant Manager** (`assistant_manager`) | `overall:assistant_manage`, `org:member`, `location:access`, `location:assistant_manage`, `location:operate`                                                                         | **YES**                          | **YES** (`overall:manage`, `location:manage` denied) |
| **Staff** (`staff`)                         | `org:member`, `location:access`, `location:operate`                                                                                                                                  | **YES**                          | **YES**                                              |
| **None / Denied** (`null`)                  | `[]`                                                                                                                                                                                 | **YES**                          | **YES**                                              |

---

## 5. Result Contract

```typescript
export type EffectiveRoleLevel =
  | "owner"
  | "manager"
  | "assistant_manager"
  | "staff"
  | null;

export type AuthoritySource = "overall" | "organization" | "location";

export interface AccessResolution {
  readonly allowed: boolean;
  readonly effectiveLevel: EffectiveRoleLevel;
  readonly applicableSources: readonly AuthoritySource[];
  readonly capabilities: readonly ResolverCapability[];
  readonly denialReason?: string;
}
```

---

## 6. Architecture & File Layout

Two core files will be added:

1. `src/features/auth/domain/access-resolver.ts`:
   - Pure domain function: `resolveUserAccess(facts: AccessResolverFacts): AccessResolution`.
   - Zero database/network/cookie dependencies.
   - Deterministic capability union and fail-closed validation.
2. `src/features/auth/data/access-resolver.ts`:
   - Server-authoritative data loader: `resolveCurrentUserAccess(supabase, context)`.
   - Reuses existing readers (`getOverallRole`, `getOrganizationMembership`, `getLocationRoleAssignment`).
   - Validates caller authentication via `supabase.auth.getUser()`.
   - Validates tenant integrity (`locations.organization_id === context.organizationId`).
   - Privileged inspection variant: `resolveUserAccessForProfile(supabase, params)` strictly checks caller authorization.

### Database Migration Decision

- **Decision:** **NO NEW SCHEMA MIGRATION REQUIRED**.
- Tables `overall_roles`, `memberships`, `locations`, `location_memberships` and enums `overall_role`, `app_role`, `location_role` are fully deployed on DEV (`opmujepkemwcdxxorhfd`).
- No new SQL RPC or schema alteration is needed for V2-001.006.
- Operational RLS hardening is explicitly reserved for V2-001.007.

---

## 7. Security Review Checklist

1. [x] **No Client Trust:** Client role claims or advisory hints cannot be inputs to the server resolver.
2. [x] **No Arbitrary Profile Elevation:** `resolveCurrentUserAccess` binds strictly to `auth.uid()`.
3. [x] **No Creator Bypass:** Zero references to `organizations.created_by`. (Issue #106 remains open for V2-001.007).
4. [x] **Tenant Mismatch Fail-Closed:** Monks org + NASA location returns `TENANT_MISMATCH` with `allowed: false`.
5. [x] **Inactive Prerequisite Handling:** Inactive organization membership or inactive location membership fails closed for scoped access.
6. [x] **Owner Separation:** Overall Managers cannot execute owner-exclusive actions.
7. [x] **Non-Propagation of Branch Roles:** Branch manager at NASA has zero authority at League City or Webster.
8. [x] **No Premature Global Activation:** Existing modules (Table Rotation, Tasks, Bar Inventory, Tips, Payroll) are untouched.
