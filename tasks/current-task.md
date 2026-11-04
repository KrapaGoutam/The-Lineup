# V2-001.007 — RLS / Server Security Hardening

Approved Subfeature: Eliminate the organization creator bypass from `private.has_org_role` (closing Issue #106 debt), audit and harden `public.apply_location_assignment_changes` for Overall Roles and target profile active membership prerequisites, and align `public.location_memberships` RLS policies.
Canonical docs: `docs/v2.0/features/001-access-foundation/007-rls-security-hardening/`
Parent Feature: Issue #249 (`[V2-001] Access & Role Foundation`)
Parent Milestone: Issue #248 (`The Lineup V2.0`)
Subfeature Issue: Issue #271 (`[V2-001.007] RLS / Server Security Hardening`)
Linked Debt Issue: Issue #106 (`[Security] Remove organization-creator bypass from private.has_org_role`)
Branch: `feature/v2.0-001.007-rls-security-hardening` (from `origin/development` at `fe31d1a003361845a9fb8500d0c60ead31fc0aec`)
Worktree: `.tmp/v2-rls-hardening`

## Implementation Checklist

- [x] Pre-flight checks: baseline SHAs recorded (`fe31d1a003361845a9fb8500d0c60ead31fc0aec` dev, `5e5b7747693b6e81014eafdf299b87e56c3f033d` main), isolated worktree created (`.tmp/v2-rls-hardening`), branch `feature/v2.0-001.007-rls-security-hardening`
- [x] Subfeature issue created: #271 under Milestone #8, linked to #106 and #249
- [x] Document PLAN.md, TEST_MATRIX.md, STATUS.md, EVIDENCE.md in `docs/v2.0/features/001-access-foundation/007-rls-security-hardening/`
- [x] Forward-only migration written: `supabase/migrations/20261103030000_rls_security_hardening.sql` (eliminating `organizations.created_by` bypass in `private.has_org_role`, auditing `public.apply_location_assignment_changes`, hardening `public.location_memberships` RLS policies)
- [x] Update assertion in `supabase/tests/database/0008_member_deactivation.test.sql` to verify deactivated creator loses access
- [x] Dedicated pgTAP security acceptance test suite written: `supabase/tests/database/0055_rls_security_hardening.test.sql` (28 tests)
- [x] Local database reset and migration execution (`npx supabase db reset`)
- [x] Focused pgTAP security acceptance tests passing (28/28 assertions)
- [x] Full pgTAP regression passing: 55/55 test files, 1,696 assertions passed
- [x] Full Vitest regression passing: 173 test files, 2,339 tests passed
- [x] Local quality gates passing: `git diff --check`, `npm run format:check`, `npm run lint`, `npm run typecheck`, `npx next build --webpack`, `npm run check:local-paths`, `npm run check:env`
- [x] Hosted DEV migration dry-run and apply (`opmujepkemwcdxxorhfd`, migration `20261103030000` applied)
- [x] Hosted DEV live verification: `has_org_role` definition lacks `created_by`, `apply_location_assignment_changes` and `location_memberships` policies verified live
- [ ] Commit with `feat(v2.0): harden RLS and eliminate organization creator bypass (#106)`
- [ ] Push branch to remote and open PR targeting `development`
- [ ] Exact-head green CI verification
- [ ] Merge commit into `development` and closeout tracking (#271, #106, #249 checklist)

## Current State & Next Step

All database migrations, tests, quality gates, and hosted DEV deployment/verification are complete. Next step: stage feature files, commit, push branch, open PR targeting `development`, and monitor CI checks.
