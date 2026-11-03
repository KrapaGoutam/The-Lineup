# V2-001.006 — Canonical Authorization Resolver

Approved Subfeature: Unify the five established role and access foundations (Overall Roles, Organization Membership, Location Access, Per-Location Roles, Multi-Location Assignment) into one consistent, deterministic, pure domain resolver and server-authoritative data loader.
Canonical docs: `docs/v2.0/features/001-access-foundation/006-authorization-resolver/`
Parent Feature: Issue #249 (`[V2-001] Access & Role Foundation`)
Parent Milestone: Issue #248 (`The Lineup V2.0`)
Subfeature Issue: Issue #269 (`[V2-001.006] Canonical Authorization Resolver`)
Branch: `feature/v2.0-001.006-authorization-resolver` (from `origin/development` at `773ac7e8ee28fd0d99422f7a561709338a8a2755`)
Worktree: `.tmp/v2-auth-resolver`

## Implementation Checklist

- [x] Pre-flight checks: baseline SHAs recorded (`773ac7e8ee28fd0d99422f7a561709338a8a2755` dev, `5e5b7747693b6e81014eafdf299b87e56c3f033d` main), isolated worktree created (`.tmp/v2-auth-resolver`), branch `feature/v2.0-001.006-authorization-resolver`
- [x] Hosted DEV baseline verified (`overall_roles`, `memberships`, `locations`, `location_memberships`, `location_role`, `apply_location_assignment_changes` present on `opmujepkemwcdxxorhfd`; migrations through `20261103020000`)
- [x] Subfeature issue created: #269 under Milestone #8
- [x] Document PLAN.md, TEST_MATRIX.md, STATUS.md, EVIDENCE.md in `docs/v2.0/features/001-access-foundation/006-authorization-resolver/`
- [x] Determine database migration need (Verified existing readers and schema suffice: NO NEW SCHEMA MIGRATION REQUIRED)
- [x] Pure domain resolver implementation: `src/features/auth/domain/access-resolver.ts`
- [x] Domain resolver unit tests: `src/features/auth/domain/access-resolver.test.ts` (63 tests passed; OVR, ORG, LOC, COMBO, TENANT, Jack/Sam/Tom/Jerry, John matrices)
- [x] Server-authoritative data loader implementation: `src/features/auth/data/access-resolver.ts`
- [x] Data loader unit tests: `src/features/auth/data/access-resolver.test.ts` (15 tests passed; current user, cross-user privileged inspection, fail-closed auth)
- [x] Full regression suite: V2-001.001 - V2-001.005 and operational module tests (173 test files, 2,339 Vitest tests passed; 54 pgTAP files, 1,668 pgTAP tests passed)
- [x] Local quality gate: format, lint, typecheck, full unit tests, full pgTAP, Next.js build (`git diff --check`, `format:check`, `lint`, `typecheck`, `next build --webpack`, `check:local-paths`, `check:env`)
- [x] Hosted DEV read-only verification (`opmujepkemwcdxxorhfd` migration list verified matching through `20261103020000`)
- [ ] Commit with `feat(v2.0): add canonical authorization resolver`
- [ ] Push branch to remote and open PR targeting `development`
- [ ] Exact-head green CI verification
- [ ] Merge commit into `development` and closeout tracking (#269, #249 checklist)

## Current State & Next Step

All code, tests, and documentation completed and verified against local quality gates and hosted DEV baseline. Next: stage files, commit `feat(v2.0): add canonical authorization resolver`, push to remote, open PR, and verify exact-head green CI.
