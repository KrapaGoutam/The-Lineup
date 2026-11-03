# V2-001.005 — Multi-Location / Multi-Role Assignment

Approved Subfeature: establish explicit multi-location assignment workflow and server-authoritative mutation contract, allowing a person to be safely assigned across multiple locations/organizations with one explicit role per location (`manager`, `assistant_manager`, `staff`), with atomic validation, fail-closed authorization, explicit change sets, and deactivate/reactivate semantics.
Canonical docs: `docs/v2.0/features/001-access-foundation/005-multi-location-multi-role-assignment/`
Parent Feature: Issue #249 (`V2-001: Access & Role Foundation`)
Parent Milestone: Issue #248 (`The Lineup V2.0`)
Subfeature Issue: Issue #267 (`[V2-001.005] Multi-Location / Multi-Role Assignment`)
Branch: `feature/v2.0-001.005-multi-location-multi-role` (from `origin/development`)
Worktree: `.tmp/v2-multi-location-roles`

## Implementation Checklist

- [x] Pre-flight checks: baseline SHAs recorded (`7065d397fd52e923a1f40913fec6b9d9d5d6b6cc`), isolated worktree created (`.tmp/v2-multi-location-roles`)
- [x] Hosted DEV baseline verified (`overall_roles`, `memberships`, `location_memberships`, `location_role` through migration `20261103010000` on `opmujepkemwcdxxorhfd`)
- [x] Subfeature issue created: #267
- [x] Architecture plan & test matrix documented (`PLAN.md`, `TEST_MATRIX.md`, `STATUS.md`, `EVIDENCE.md`)
- [x] Forward migration `20261103020000_multi_location_assignment_workflow.sql` adding narrow RPC `public.apply_location_assignment_changes`
- [x] Local DB reset and migration verification
- [x] Database type generation (`src/types/database.generated.ts`)
- [x] Domain types and pure validation (`src/features/auth/domain/location-assignment.ts`)
- [x] Server-authoritative data readers & mutation contract (`src/features/auth/data/location-assignment.ts`)
- [x] Database/pgTAP tests (`supabase/tests/database/0054_location_assignment.test.sql`, DB-001 through DB-024)
- [x] Domain and data layer unit tests (`location-assignment.test.ts`)
- [x] Full test regression runs (001.001, 001.002, 001.003, 001.004, operational modules)
- [x] Local quality gate: format, lint, typecheck, full unit tests, full pgTAP, Next.js build
- [ ] Hosted DEV dry run & push (`opmujepkemwcdxxorhfd`)
- [ ] Hosted DEV validation
- [ ] Update documentation and evidence
- [ ] Git commit and push to remote
- [ ] Open PR to `development`
- [ ] Exact-head CI green
- [ ] Merge commit into `development` and closeout tracking

## Current State & Next Step

Local implementation and quality gates complete. Next: stage files, commit, push branch, open PR, and execute hosted DEV dry-run and push following the migration gate.
