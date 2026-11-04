# Subfeature V2-002.004: Staff Assignment Management — Plan

Parent Feature: [V2-002: Organizations & Locations](../README.md)  
Milestone: The Lineup V2.0 (#8) · Program #248 · Feature #250  
Prerequisites: V2-002.001 (PR #274), V2-002.002 (PR #276), V2-002.003 (PR #278); assignment workflow #267/PR #268; security hardening #271/PR #272  
Branch: `feature/v2.0-002.004-staff-assignment-management` (from `origin/development` @ `4d78eba63ec846198bd3cd654d99221f3f8b7c71`)  
Execution environment: Claude Code Cloud (no Supabase credentials, no Docker daemon)

## 1. Mission

Let authorized management assign **existing, active organization members** to specific locations, change their per-location role, deactivate/reactivate assignments, and edit several locations for one employee in one atomic change set — with **one additive, read-only migration** (`20261104010000_staff_roster_reader.sql`, added during closeout) and no change to any existing table or policy.

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

> Closeout update: the roster is now read through `public.list_organization_staff` (see §13). The description below of the returned shape still holds.

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

## 13. Overall-admin roster visibility — root cause and fix (closeout)

**Root cause (audited from migrations).** `memberships_select_member` (→ `private.has_org_role`) and `profiles_select_shared_org` (→ `private.can_view_profile`) were defined in `20260905065702_initial_schema.sql` and never revised. `has_org_role` was hardened in `20261103030000` to "active membership with one of the roles" and neither helper consults `public.overall_roles`. Therefore only **active members of the organization** can read its `memberships` rows and the members' `profiles`. Effects: (a) an Overall Owner/Manager with no local membership — authorized by the assignment RPC — read an empty roster; (b) even org owners/GMs could not read profile names of _inactive_ members (`can_view_profile` requires an active target), so those showed as "Unnamed member"; (c) the TS pre-check that read the target's membership under RLS would have wrongly rejected an Overall administrator with "not a member".

**Fix (narrowest).** New forward-only migration `supabase/migrations/20261104010000_staff_roster_reader.sql` adds `public.list_organization_staff(p_organization_id, p_profile_id default null, p_limit default 500, p_offset default 0)`:

- `SECURITY DEFINER`, `search_path = ''`, fully qualified names, `STABLE`; `EXECUTE` revoked from `public`/`anon`, granted to `authenticated` only.
- Requires `auth.uid()` (no actor parameter). Authority is **identical to `apply_location_assignment_changes`**: Overall Owner/Manager, or active Org Owner/General Manager of _that_ organization. Overall Assistant Manager alone, shift managers, host/server, other-org managers and inactive/revoked members (including a revoked creator) get `42501`.
- Returns only `profile_id, display_name, roles, active` for the requested organization (no avatar/email/credentials); page size clamped to 1..1000.
- No existing policy or applied migration was modified; mutation authority is unchanged (read visibility ≠ mutation authority).

`staff-assignment-actions.ts` reads the roster and single-member lookups through this RPC (`readOrganizationRoster`, `readOrganizationMember`). Generated types updated by hand (`list_organization_staff`) because no database was available in Cloud to regenerate them — Codex Local should confirm with `supabase gen types` that the diff is empty.

pgTAP: `supabase/tests/database/0058_staff_roster_reader.test.sql` (25 assertions, SEC-01…SEC-10).

## 14. Cloud testing constraints / handoff

Cloud has no Supabase credentials, no Docker daemon and its network allowlist blocks the Playwright WebKit download (HTTP 403). Database tests are run by the repository's `Database` workflow (isolated CI Supabase instance — not hosted DEV). Hosted DEV verification and the WebKit/iPad project remain for Codex Local.
