# V2-001.003 — Location Access Foundation

Approved Subfeature: establish explicit user -> location access, constrained by organization membership (Active Org Membership + Explicit Active Location Assignment = Scoped Location Access).
Canonical docs: `docs/v2.0/features/001-access-foundation/003-location-access/`
Parent Feature: Issue #249 (`V2-001: Access & Role Foundation`)
Parent Milestone: Issue #248 (`The Lineup V2.0`)
Subfeature Issue: Issue #263 (`[V2-001.003] Location Access`)
Branch: `feature/v2.0-001.003-location-access` (from `origin/development`)

## Implementation Checklist

- [x] Pre-flight checks and isolated worktree creation (`.tmp/v2-location-access`)
- [x] Audit existing schema models and verify `public.location_memberships` does not exist (Outcome B)
- [x] Hosted DEV prerequisite V2-001.001 migration `20261102213000` applied & verified on `opmujepkemwcdxxorhfd`
- [x] GitHub subfeature issue #263 created
- [x] Forward-only migration adding `public.location_memberships` with unique constraint, indexes, RLS, and grants (`20261103001500_location_access_foundation.sql`)
- [x] Forward migration pushed to hosted DEV (`opmujepkemwcdxxorhfd`) and verified
- [x] Database type generation (`src/types/database.generated.ts`)
- [x] Domain types and pure predicates (`src/features/auth/domain/location-access.ts`)
- [x] Server-authoritative data readers and effective access evaluator (`src/features/auth/data/location-access.ts`)
- [x] Database/pgTAP tests (`supabase/tests/database/0052_location_access.test.sql`, 24 tests passing)
- [x] Domain and data unit tests (`location-access.test.ts`, 33 tests passing)
- [x] Local validation: format, lint, typecheck, unit tests (2,202 tests), pgTAP (1,618 tests), Next.js build
- [x] Documentation authored (`PLAN.md`, `STATUS.md`, `TEST_MATRIX.md`, `EVIDENCE.md`, `ROADMAP.md`, `CURRENT_STATE.md`)
- [ ] Pre-commit quality checks (tracked local paths, format, lint, typecheck)
- [ ] Git commit and push to remote
- [ ] Open PR to `development`
- [ ] Exact-head CI green
- [ ] Merge commit into `development` and closeout tracking

## Current State & Next Step

Implementation, tests, hosted DEV migration, and documentation complete. Next: pre-commit quality check, commit, push, and open PR to `development`.
