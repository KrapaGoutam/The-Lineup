# V2-005.008 Team / Settings Hybrid Scoping — Evidence

## 1. Baseline & Context

- **Repository**: `KrapaGoutam/The-Lineup`
- **Worktree**: `.tmp/v2-005-batch-a`
- **Base SHA**: `8e95d9e641d7a76c0010a40c3730a708ae90a0d0` (`origin/development`)
- **Branch**: `feature/v2.0-005-batch-a-schedule-team-settings`
- **Parent Issue**: #253 | Program: #248 | Milestone: #8 — The Lineup V2.0

## 2. Implemented Hybrid Architecture & RLS

- **Migration**: `supabase/migrations/20261107224300_batch_a_schedule_team_settings.sql`
- **Security Definer Helpers**:
  - `private.can_view_profile(target_profile_id uuid)`: Admits profile self, Overall roles, and active organization membership co-affiliates.
  - `private.can_manage_member(target_profile_id uuid)`: Admits Overall Owner, Overall Manager (for non-owners/non-GMs), Organization Owner, and Organization General Manager (for non-owners/non-GMs). Local managers are strictly excluded from org-wide personnel management.
- **Table Policies**:
  - `public.profiles`: Updated `profiles_update_manager` to use `private.can_manage_member(id)`. Local managers attempting direct UPDATE affect 0 rows.
  - `public.memberships`: Updated `memberships_insert_manager`, `memberships_update_manager`, and `memberships_delete_manager` to authorize Overall Owner/Manager and Org Owner/GM while excluding local branch managers. Local managers attempting INSERT fail with 42501; UPDATE/DELETE affect 0 rows.
  - `public.operating_hours` & `public.shift_kind_defaults`: Scoped write permissions to location managers via `private.schedule_is_manager(organization_id, location_id)`.

## 3. Server-Side Protection

- `src/features/team/actions/member-actions.ts`:
  - `renameTeamMemberAction`: Enforces check for Overall Owner/Manager or Org Owner/General Manager. Rejects local managers with `"Only an owner or general manager can rename members."`.
- `src/features/team/actions/team-actions.ts`:
  - `updateTeamDesignationAction`: Enforces check for Overall Owner/Manager or Org Owner/General Manager. Rejects local managers with `"Only an owner or general manager can change designations."`.

## 4. Verification Receipts

- **pgTAP Tests** (`supabase/tests/database/0068_batch_a_schedule_team_settings.test.sql` Part 5):
  - Local Manager A update on memberships affects 0 rows (PASS).
  - Member roles unaffected by local manager (PASS).
  - Local Manager A insert on memberships rejected with 42501 (PASS).
  - Local Manager A delete on memberships affects 0 rows (PASS).
  - Member not deleted by local manager (PASS).
  - Local Manager A update on profiles affects 0 rows (PASS).
  - Profile display_name unaffected by local manager (PASS).
  - Org Owner updates profile display_name and memberships (PASS).
  - Overall Manager updates profile display_name and memberships without tenant membership (PASS).
- **Local Real-JWT Tests** (`tests/local/schedule-location.local.test.ts`):
  - Local manager cannot rename members (`renameTeamMemberAction` rejected: PASS).
  - Local manager cannot change designations (`updateTeamDesignationAction` rejected: PASS).
  - Direct PostgREST attempt to update memberships updates 0 rows (PASS).
  - Direct PostgREST attempt to update profiles updates 0 rows (PASS).
  - Org Owner CAN rename members and change designations (PASS).
- **Full Suite & Builds**:
  - `npm run check`: PASS.
  - `npm test`: 244 test files, 3,303 tests PASS (100% green).
  - `npm run build`: Next.js production build PASS.

## Closeout review (Claude, BA-F1)

- Browser acceptance (desktop/tablet/phone, 18/18 shared spec): a location-only manager has no Team tab and changes nothing; the organization Owner and an Overall manager can rename members (DB-verified).
- Real-JWT: local manager cannot rename or change designations; Org Owner can.
- Residual (not changed here): `/api/team/deactivate|reactivate` and `/api/auth/passcode/reset` authorize by organization-membership designation, so an Overall administrator with no membership cannot use them (fails closed). Track as a follow-up if Overall admins must manage those.
