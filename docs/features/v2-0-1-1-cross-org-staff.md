# V2.0.1.1 — Cross-organization employee membership

**Status:** approved by owner implementation request, 2026-11-16.
**Branch:** `feature/v2-0-1-1-cross-org-staff`.

## Outcome

An authenticated Overall Owner selects a source organization and one active employee, links the same profile to a different destination organization with the Server role and an audit reason, then uses existing branch assignments. An inactive destination membership requires explicit audited reactivation. No identity, PIN, credential, source membership, branch assignment, or operational record is copied.

## Data and authorization

The server verifies a live session and trusted Overall Owner role, distinct valid organization IDs, source membership, destination membership state, and a 3–500 character reason. `list_organization_staff` supplies source and destination rosters. `team_add_member` or `team_set_member_active` performs the audited mutation with the authenticated client. The database uniqueness constraint resolves concurrent duplicate submissions. No schema, RLS, grants, or generated type change is expected. The source and destination remain tenant isolated. Only the existing branch assignment editor grants location access.

## UI and failures

System Administration → Organizations → destination → Staff Assignments exposes Add Existing Employee. The dialog requires a source organization, supports name search with an ID suffix for duplicate names, labels active and inactive destination members, previews the exact effect, and asks for a reason. It reports denied, expired, invalid, duplicate, inactive and network failures without treating errors as an empty roster. After success it refreshes the roster and offers the existing assignment editor. Mobile and keyboard use the existing native dialog and semantic controls.

## Validation and release

Focused action/component tests, existing membership lifecycle pgTAP and branch authorization tests, focused browser flow, `npm run check`, `npm run test`, and `npm run build`. Push one feature head to a PR targeting development; accept in hosted DEV with a test employee before release. Production uses read-only smoke until the owner selects an actual employee and confirms the membership through the UI. Global Personal PIN at `/` is the supported sign-in route; organization-slug login still depends on its separate organization credential enrollment.

Local verification: 51/51 focused app tests, 4,252 full Vitest passes (7 skipped), 132/132 focused pgTAP assertions, 10/10 existing mocked assignment browser tests on desktop/mobile, `npm run check` and webpack production build pass. The default Turbopack build cannot resolve Next from this isolated worktree. Hosted DEV identity, audit, branch assignment, global PIN and context chooser checks remain pending. No hosted database or Production write was made.
