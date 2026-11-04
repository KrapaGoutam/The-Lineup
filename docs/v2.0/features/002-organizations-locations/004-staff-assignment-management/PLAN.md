# Subfeature V2-002.004: Staff Assignment Management — Plan

Parent Feature: [V2-002: Organizations & Locations](../README.md)  
Milestone: The Lineup V2.0 (#8) · Program #248 · Feature #250  
Prerequisites: V2-002.001 (PR #274), V2-002.002 (PR #276), V2-002.003 (PR #278); assignment workflow #267/PR #268; security hardening #271/PR #272  
Branch: `feature/v2.0-002.004-staff-assignment-management` (from `origin/development` @ `4d78eba63ec846198bd3cd654d99221f3f8b7c71`)  
Execution environment: Claude Code Cloud (no Supabase credentials, no Docker daemon)

## 1. Mission

Let authorized management assign **existing, active organization members** to specific locations, change their per-location role, deactivate/reactivate assignments, and edit several locations for one employee in one atomic change set — with **no schema change**.

## 2. Role taxonomy (never interchangeable)

| Vocabulary         | Storage                            | Values                                              |
| ------------------ | ---------------------------------- | --------------------------------------------------- |
| Overall roles      | `public.overall_roles`             | owner, manager, assistant_manager                   |
| Organization roles | `public.memberships.roles`         | owner, general_manager, shift_manager, host, server |
| **Location roles** | `public.location_memberships.role` | **manager, assistant_manager, staff**               |

Only the third list is ever offered by the UI (`LocationRoleSelect`, backed by `LOCATION_ROLES`). Organization roles are shown only as read-only context ("Organization: Server"). Overall roles are never edited and no synthetic assignment rows are created for them. One row per `(location_id, profile_id)` is preserved (`UNIQUE`); a person has different roles at different locations, never several at one.

## 3. Reused backend (no new RPC, table or migration)

- RPC `public.apply_location_assignment_changes(p_target_profile_id, p_changes)` — atomic per employee; final authority (Overall Owner/Manager or active Org Owner/General Manager; target needs active org membership; location must exist and be active).
- Domain: `validateLocationAssignmentChanges`, `isLocationRole`, `LOCATION_ROLES`.
- Data: `applyLocationAssignmentChanges`, `listProfileLocationAssignments`, `getLocationById`, `listLocationsByOrganization`, `getOrganizationMembership`.
- Admin authority: `verifyLocationAdminAuthority` (V2-002.003) — identical contract to the RPC.

## 4. New code

| Layer         | File                                                                                                                                                                                        | Purpose                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain (pure) | `src/features/locations/domain/staff-assignment.ts`                                                                                                                                         | role options/labels, status derivation, roster sort/filter, **`buildAssignmentChangeSet`** (minimal deterministic change set), dedupe/org-scope filters |
| Actions       | `src/features/locations/actions/staff-assignment-actions.ts`                                                                                                                                | `listOrganizationStaffAction`, `getLocationStaffAction`, `getEmployeeLocationAssignmentsAction`, `applyStaffLocationChangesAction`                      |
| UI boundary   | `components/staff-assignment-source.ts` (live) / `staff-assignment-demo.ts` (in-memory)                                                                                                     | `StaffAssignmentSource` interface; demo implementation never imports server actions                                                                     |
| UI            | `location-staff-management.tsx`, `organization-staff-assignments.tsx`, `employee-assignments-dialog.tsx`, `staff-multi-location-editor.tsx`, `location-role-select.tsx`, `staff-badges.tsx` | location-centric and employee-centric views                                                                                                             |
| Integration   | `location-administration.tsx` (modified)                                                                                                                                                    | new **Staff** tab in Manage Location; **Staff Assignments** header button                                                                               |

## 5. UI entry points (no global navigation change)

`Settings → Locations → (organization) →` either **Manage <branch> → Staff** (location-centric) or **Staff Assignments** (employee-centric roster → _Manage Locations_). Organization selection reuses the V2-002.003 selector; switching organizations closes staff dialogs and clears selection state. Team module is untouched.

## 6. Server-action security model

Each action: `requireLiveSession` → actor from `supabase.auth.getUser()` (never from input) → `verifyLocationAdminAuthority(actor, org)` → resolve location↔organization from trusted rows → delegate to the RPC. `applyStaffLocationChangesAction` whitelists `{locationId, action, role}` per change (forged `actorProfileId`, `isManager`, `overallRole`, … are never read), rejects locations outside the organization (`TENANT_MISMATCH`) or inactive (`LOCATION_INACTIVE`), requires an organization membership for the target and an **active** one for assign/update/reactivate. No service-role client; all reads run under the caller's RLS.

## 7. Roster source

`public.memberships` ⨝ `public.profiles(display_name)` for the administered organization, keyed by `profile_id`, ordered by `created_at,id`, paged in 500-row pages (hard bound 20 pages), **active and inactive** members returned so the UI can show _Not Assigned_ vs _Organization Membership Inactive_. Exposed fields: `profileId, displayName, organizationRoles, membershipActive` only.

## 8. Change-set generation (multi-location)

`buildAssignmentChangeSet({baseline, desired, editableLocations})`:
absent+assigned→`assign`; active+role differs→`update`; inactive+assigned→`reactivate`; active+unassigned→`deactivate`; everything else omitted. **Only locations present in `desired` can be touched** — a location that is merely not displayed (e.g. another organization's Webster) is never deactivated. Out-of-scope locations, inactive locations, duplicate locations and invalid roles are rejected, not silently dropped. Output is sorted by `locationId` and re-validated by `validateLocationAssignmentChanges`. The employee action returns assignments **restricted to the administered organization's locations**.

## 9. Statuses

`Assigned` · `Inactive Assignment` · `Not Assigned` · `Organization Membership Inactive` (always wins; inactive members are not offered for assignment/reactivation, only for removing existing access).

## 10. UX states

Loading, load error with Retry, empty ("No staff assigned to this location yet."), no eligible staff, inactive location (read-only banner, no mutating controls), permission denied (existing screen), pending-changes summary, deactivation confirmation (spec wording), unsaved-changes discard guard (Cancel and dialog X/ESC), failed save preserves draft, success only after backend confirmation, refresh from persisted data. Mobile: stacked rows, no horizontal overflow, 44px targets, no hover-only actions; status conveyed as text. Uses existing design tokens (light/dark).

## 11. Demo mode

`createDemoStaffAssignmentSource()` is a closure-scoped in-memory store over synthetic people (John, Sam, Naveen, Priya, Lee). It does not import the server actions; a test asserts none are called in demo flows.

## 12. Non-goals (explicitly not done)

Org-membership creation/invite, organization-role or overall-role editing, location lifecycle (V2-002.005), active-context switching (V2-003), module scoping, attendance/kiosk, multi-person bulk changes (no atomic backend contract), schema migrations.

## 13. Known limitation — handed to Codex Local

RLS on `public.memberships` / `public.profiles` exposes rows only to active members of the organization (`private.has_org_role`, `private.can_view_profile`). An **Overall Owner/Manager who is not a member of the administered organization** can pass the authority check and execute the RPC, but the RLS-bound roster read will return no members for that organization. Org Owners/General Managers (the common case) are unaffected. This is a pre-existing backend read-policy gap, not introduced here; the correct fix is a policy/migration change that must be validated against a database, so it was **not** attempted in Cloud and no service-role workaround was added. See `EVIDENCE.md` handoff.

## 14. Cloud testing constraints / handoff

Cloud has no Supabase credentials and no Docker daemon: pgTAP (`supabase test db`) and hosted DEV verification are **NOT RUN** and must be completed by Codex Local before merge (see `EVIDENCE.md`).
