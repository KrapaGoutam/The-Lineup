# Feature 024 — Team Management Enhancements in Settings

**Name:** Team Management Enhancements in Settings  
**Owner:** Krapa Goutam  
**Status:** approved  
**Issue/PR:**

## Classification & Session Scope

- **Category:** FEATURE UPGRADE
- **Modifies vs Adds:** Modifies existing Team management (previously a standalone tab from Features 014, 016, 017, 019) to embed inside the consolidated Settings page; adds user rename functionality to `user_profiles` and unifies member action controls.
- **Contradiction Flags:** In the mockups, staff names are shown with designations (e.g. "Deepak Rao (Server)"). This is strictly DISPLAY-level formatting. Identity linking between app users and third-party/Neon attendance records remains 100% manual via explicit `attendance_identity_links` UUID pairings (Feature 019). **Nothing in team, attendance, or payroll ever keys on or infers identity from name strings.**
- **Session Scope:** One-session build.

## User Outcome

Owners and managers manage their team directly from the Settings page. From a unified team roster table, managers can edit a team member's display name, change their operational designation (Server, Host, Busser, Assistant Manager, etc.), reset their four-digit login passcode on the spot, and link/unlink their attendance identity record. Regular servers cannot access this section.

## Scope

- **In:**
  - Embed Team management view into `src/features/settings/` (or route from Settings card).
  - Rename user action: update `user_profiles.full_name` with server-side validation and audit log.
  - Designation update action (maintaining Feature 014 hierarchy rules: only owner can promote to Manager/Owner; managers can promote up to Assistant Manager).
  - Passcode reset action (owner/manager sets a new four-digit temporary passcode or triggers reset flow per Feature 016).
  - Attendance identity linking (select an unlinked Neon attendance record to link to the user profile via Feature 019 `attendance_identity_links`).
  - Active / deactivated status toggle (Feature 017).
- **Out:**
  - Self-service role promotion.
  - Automatic or heuristic matching of attendance identities by name.

## Acceptance Criteria

- [ ] Given an owner or manager in Settings > Team, they see the complete team roster with designation, role, attendance link status, and active state.
- [ ] Given a manager editing a team member, they can update the member's full name, and the updated name reflects across the live app immediately upon saving.
- [ ] Given an owner, they can promote an active member to Manager or Assistant Manager; a manager cannot promote someone to Manager or Owner.
- [ ] Given a manager resetting a member's passcode, the member can immediately sign in using the new four-digit passcode.
- [ ] Given a manager linking attendance, they select an attendance record from the dropdown, establishing a row in `attendance_identity_links`; the identity link is strictly by ID and never matches on name.
- [ ] Given a regular server, the Team management controls in Settings are completely hidden.

## UX Contract

- **Entry point:** Settings page > Team card / section.
- **Desktop:** Data table with member avatar, name, designation badge, attendance link badge, and action dropdown menu (`...`).
- **Mobile:** Card-based member list with action sheet for Rename, Designation, Passcode Reset, and Attendance Link.

## Data & Authorization

- **Tables/columns:** Updates `user_profiles.full_name`, `organization_members.designation`, `organization_members.role`, and `attendance_identity_links`.
- **Grants/RLS:** Only authenticated managers and owners of the organization can execute member updates and passcode resets.
- **Audit:** All designation changes, renames, and passcode resets emit an audit log entry in `audit_logs`.

## Implementation Map

- `src/features/team/components/team-management-panel.tsx`: Unified team roster in Settings.
- `src/features/team/components/edit-member-dialog.tsx`: Modal for renaming, designation, and attendance linking.
- `src/features/team/actions/member-actions.ts`: Server actions for rename, designation, and reset.

## Test Plan

- Unit: Designation hierarchy boundary checks; rename action validation.
- E2E: Manager renames staff member, resets passcode, links attendance, and confirms the member can log in with the new passcode.

