# V2-005.001 Table Allocation / Rotation — Location Scoping Plan

## 1. Objective

Implement **V2-005.001 — Table Allocation / Rotation Location Scoping**. Ensure that an employee can view and operate ONLY the Table Allocation data for their server-verified, authorized active location. Ensure two locations in the same organization have strictly independent sessions, round history, server columns, physical tables, claims, board events, and undo/redo history.

---

## 2. Server-Side Location Identity & Verified Context Binding

Every operational read and mutation must bind strictly to the authenticated caller's server-verified active location:

1. **Authentication**: Caller identity is established exclusively via `supabase.auth.getUser()`. Client-provided profile IDs or unverified JWT claims are rejected.
2. **Operational Location Binding**:
   - Initial read (`loadPageData`): `resolveCurrentActiveContext` verifies the caller's active context via the canonical domain resolver `resolveUserAccess` and passes `scope` (`VerifiedLocationScope`) to `getAllocationContext`.
   - Date navigation (`getAllocationContextForDateAction`): Requires untrusted `expectedContext` assertion from the client, validates it with `assertWorkspaceExpectation` against server-verified active context, and passes the resulting verified scope to `getAllocationContext`.
   - Actions (`executeBoardActionRemote`, `undoBoardAction`, `redoBoardAction`):
     - Accept untrusted `expectedContext` assertion from caller.
     - Call `assertWorkspaceExpectation` to verify identity and operational location against the server-verified active location.
     - Never trust client-supplied `organizationId`, `locationId`, or `timeZone`.
     - Use the server-verified `location.id` and location-derived `timeZone` for all RPC calls and session lookups.
     - Stale or mismatched browser expectation returns safe refusal without touching the database.

---

## 3. Service Session Ownership

1. **Verification**:
   - For all session-targeted actions (`clear-cell`, `clear-row`, `clear-column`, `clear-board`, `set-column-status`, `move-column`, `add-row`, `delete-row`, `transfer`, `end-table`, `end-and-assign`, `undo`, `redo`), `executeBoardActionRemote` / `undoBoardAction` / `redoBoardAction` verifies that `serviceSessionId` belongs to the verified `(organizationId, locationId)`.
   - Mismatched session (e.g. valid session belonging to another location in the same org, or another org) is refused immediately (`"That service session belongs to a different location."`). No fallback session is created.
2. **Creation & Open Floor**:
   - For opening a floor session (`add-column`, `skip-turn`, `assign` without active session), `private.get_or_create_active_session` is invoked with verified `(organization_id, location_id, service_date)`.
   - Server profile added to column must hold an active assignment to that location or an Overall role.

---

## 4. Physical Table & Floor Isolation

1. **Physical Registry**: `getAllocationContext` queries `dining_tables` strictly scoped to `location.id` and `active = true`.
2. **Floor Plan & Off-Map Tables**: Map coordinates (`position_x`, `position_y`) and registered table labels belong exclusively to the active location.
3. **Claims & Transfers**: `section_assignments` rows link to `location_id` and the location's `service_session_id`. Cross-location transfers are impossible because source and destination columns belong to the location-bound session.
4. **Canonical Resolution**: `private.resolve_table_input` and `private.canonical_table_label` resolve labels against tables where `dining_tables.location_id = p_location_id`.

---

## 5. Database Authorization & RLS Architecture

1. **`private.can_operate_board(p_organization_id uuid, p_location_id uuid)`**:
   - Refactored from org-only role check to canonical location authorization:
     1. Unauthenticated (`auth.uid() IS NULL`) &rarr; `FALSE`.
     2. Caller holds system-wide Overall role (`owner`, `manager`, `assistant_manager`) &rarr; `TRUE` (provided target location exists, is active, non-archived, and belongs to org).
     3. Organization Owner/GM administrative membership alone does not authorize operational locations; canonical explicit assignment is required.
     4. Caller holds active `location_memberships` assignment for `p_location_id` with active organization membership in `p_organization_id` &rarr; `TRUE` (provided location is active and non-archived).
     5. If `p_location_id IS NULL`: `TRUE` only for an Overall role, or active organization membership with an active operational assignment (or the bounded single-active-location legacy exception). This preliminary gate never selects a location.
     6. Otherwise &rarr; `FALSE` (fails closed).
2. **`private.begin_board_write(p_organization_id uuid, p_service_session_id bigint)`**:
   - Locks session row and resolves `v_location := s.location_id`.
   - Calls `private.can_operate_board(p_organization_id, v_location)`.
   - If caller is not authorized for `v_location`, raises exception `42501`.
3. **`public.board_add_column`**:
   - Validates that `p_server_profile_id` has an active assignment to `p_location_id` or an Overall role, preventing cross-location server contamination.
4. **Table RLS Policies**:
   - `public.service_sessions`: SELECT policy updated from org-wide `has_org_role` to `private.can_operate_board(organization_id, location_id)`.
   - `public.dining_tables` & `public.dining_areas`: SELECT policy updated to `private.can_operate_board(organization_id, location_id)`.
   - `public.section_assignments`: SELECT policy updated to `private.can_operate_board(organization_id, location_id)`.
   - `public.rotation_members`, `public.rotation_rounds`, `public.table_rotation_entries`, `public.board_events`: SELECT policies updated (direct graph writes remain revoked) to verify `private.can_operate_board(s.organization_id, s.location_id)` via join to `public.service_sessions`.

---

## 6. Concurrency Safeguards & Historical Lock

1. `begin_board_write` continues to acquire `FOR NO KEY UPDATE` row lock on `service_sessions`.
2. Historical date lock (`assert_board_not_locked` / historical date check) remains strictly intact.
3. Denied operations fail atomically before any mutations or event writes occur.

---

## 7. Legacy Helper Usage & Retirement Strategy

1. `getAllocationContext` already accepts a verified scope and its optional `locationForLoader` fallback re-verifies through the canonical resolver. Both operational callers pass scope. No loader source change was necessary; direct scope-free invocation remains fail-closed on ambiguous, revoked, foreign or missing context.
2. `getPrimaryLocation`: Retained for other modules (Tasks, Tips, Schedules, etc.) until their dedicated V2-005 subfeatures.
3. No breaking global changes to shared helpers.

---

## 8. PR #305 Integration Considerations

1. PR #305 (unmerged on `feature/v2.0-004.004-backend-module-enforcement`) adds `assert_location_module_enabled(v_location, 'table_allocation')` inside `begin_board_write`.
2. V2-005.001 keeps `begin_board_write` independent on `development` base.
3. Migration order is 20261106120000 (#305), then 20261106150000 (#306). #306 does not redefine begin_board_write and preserves #305's module assertion.
4. Actual local merge conflicts occur in allocation-actions.ts and tasks/current-task.md. Preserve #306 caller/context/time-zone/session binding and insert #305 guardModule calls using the VERIFIED organization/location before session reads or RPCs. Date reads retain guardModule after canonical scope resolution. The disposable integration workspace validates this resolution; neither real PR branch was merged or changed for this test.

## Independent security corrections

The assignment-free legacy exception requires exactly one active, non-archived location and ZERO assignment rows anywhere in the organization (inactive rows also disable it). It is a compatibility floor, never authority in a multi-location rollout. Target eligibility is checked before session creation. Restrictive location policies on dining_tables and dining_areas constrain pre-existing permissive manager FOR ALL policies. NULL remains an internal preliminary authorization gate; every public operation must resolve/validate a concrete location before writes.
