# V2-005.008 Team / Settings Hybrid Scoping — Plan

GitHub Issue: #253  
Parent Issue: #248 | Milestone: #8 — The Lineup V2.0  
Base: `8e95d9e641d7a76c0010a40c3730a708ae90a0d0`  
Target: `development`

## 1. Objective

Implement hybrid scoping for Team and Settings modules:

1. **Organization-Level Governance**:
   - Maintain org-level membership authority for Organization Owners and General Managers, and Overall Owners and Managers.
   - Restrict organization-level actions (member renaming, team designation updates, organization membership modifications, account recovery) to authorized organization executives and Overall actors.
   - Prevent local branch managers from acquiring organization-wide management privileges.
2. **Location-Scoped Operational Settings**:
   - Scope location operational settings (operating hours, shift kind defaults, shift templates) to branch managers.
   - Ensure branch managers can manage operational settings at their assigned location while preventing cross-branch modification.
3. **Database RLS Policies**:
   - Update `memberships` and `profiles` RLS policies to admit Overall roles while preventing local manager privilege escalation.
   - Enforce `private.can_manage_member` helper admitting Overall Owner/Manager and Organization Owner/General Manager.
4. **Server Action Enforcement**:
   - Enforce executive/Overall checks in `renameTeamMemberAction` (`src/features/team/actions/member-actions.ts`) and `updateTeamDesignationAction` (`src/features/team/actions/team-actions.ts`).
   - Audit all designation and profile changes with genuine actor attribution.
