# V2-005.008 Team / Settings Hybrid Scoping — Status

**Current State**: COMPLETE (Implemented, Tested, Verified in Batch A)  
**Parent Issue**: #253  
**Milestone**: #8 — The Lineup V2.0  
**Target**: `development`  
**Branch**: `feature/v2.0-005-batch-a-schedule-team-settings`  
**Migration**: `supabase/migrations/20261107224300_batch_a_schedule_team_settings.sql`

## Acceptance Checklist
- [x] Organization-level memberships, roles, affiliations, and account recovery preserved under Organization Owner/General Manager and Overall Owner/Manager governance.
- [x] Local managers prevented from acquiring organization-wide management privileges (cannot rename members, promote to org owner/GM, or delete memberships).
- [x] Branch operational settings (operating hours, shift kind defaults, shift templates) scoped to location managers.
- [x] RLS policies on `memberships` and `profiles` admit Overall roles while isolating branch managers from organization-wide mutations.
- [x] Server actions (`renameTeamMemberAction`, `updateTeamDesignationAction`) enforce executive authority and record audit events.
- [x] Local pgTAP suite (`0068_batch_a_schedule_team_settings.test.sql`) Part 5 PASS.
- [x] Local real-JWT integration suite (`tests/local/schedule-location.local.test.ts`) PASS.
- [x] `npm run check`, `npm test`, and `npm run build` all green.
