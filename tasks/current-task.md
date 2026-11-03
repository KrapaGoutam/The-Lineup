# V2-001.001 — Overall Roles Foundation

Approved Subfeature: establish the canonical Overall Role data model, domain contract, secure minimal read/write foundation required for future authorization work, deterministic tests, generated types where applicable, and complete tracking/evidence.
Canonical docs: `docs/v2.0/features/001-access-foundation/001-overall-roles/`
Parent Feature: Issue #249 (`V2-001: Access & Role Foundation`)
Parent Milestone: Issue #248 (`The Lineup V2.0`)
Subfeature Issue: Issue #259 (`[V2-001.001] Overall Roles`)
Branch: `feature/v2.0-001.001-overall-roles` (from `origin/development`)

## Implementation Checklist

- [x] Pre-flight checks and isolated worktree creation (`.tmp/v2-overall-roles`)
- [x] Audit existing identity, roles, and schema models
- [x] GitHub subfeature issue #259 created
- [x] Forward-only migration adding `public.overall_role` and `public.overall_roles` with RLS and grants
- [x] Database type generation (`npm run db:types`)
- [x] Domain types and server read contract (`src/features/auth/domain/overall-role.ts`, `src/features/auth/data/overall-role.ts`)
- [x] Database/pgTAP tests (`supabase/tests/database/0050_overall_roles.test.sql`)
- [x] Domain unit tests (`src/features/auth/domain/overall-role.test.ts`, `src/features/auth/data/overall-role.test.ts`)
- [x] Local validation: format, lint, typecheck, unit tests, regression tests
- [ ] Documentation updates (`PLAN.md`, `STATUS.md`, `TEST_MATRIX.md`, `EVIDENCE.md`, `ROADMAP.md`, `CURRENT_STATE.md`)
- [ ] Commit, push, open PR to `development`
- [ ] Hosted DEV migration & validation
- [ ] Exact-head CI green
- [ ] Merge commit into `development` and closeout tracking

## Current State & Next Step

Implementation and local validation (pgTAP 50/50, Vitest 163/163, format, lint, typecheck) complete. Next: update documentation, commit, push, and open PR.
