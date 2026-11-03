# V2-001.004 — Per-Location Roles Foundation

Approved Subfeature: establish explicit location-scoped roles (`manager`, `assistant_manager`, `staff`), allowing a user to hold different roles across branches without cross-branch role leakage (e.g. John is Manager at NASA, Assistant Manager at League City, Manager at Webster).
Canonical docs: `docs/v2.0/features/001-access-foundation/004-per-location-roles/`
Parent Feature: Issue #249 (`V2-001: Access & Role Foundation`)
Parent Milestone: Issue #248 (`The Lineup V2.0`)
Subfeature Issue: Issue #265 (`[V2-001.004] Per-Location Roles`)
Branch: `feature/v2.0-001.004-per-location-roles` (from `origin/development`)
Worktree: `.tmp/v2-location-roles`

## Implementation Checklist

- [x] Pre-flight checks: baseline SHAs recorded (`1ae02516a1d7aa6df606d1672d27f9c9a006db55`), isolated worktree created (`.tmp/v2-location-roles`)
- [x] Hosted DEV baseline verified (`overall_roles`, `memberships`, `location_memberships` present on `opmujepkemwcdxxorhfd`)
- [x] Subfeature issue created: #265
- [x] Architecture plan & test matrix documented (`PLAN.md`, `TEST_MATRIX.md`, `STATUS.md`, `EVIDENCE.md`)
- [ ] Forward-only migration adding `public.location_role` enum and `role` column to `public.location_memberships` (`20261103010000_location_roles_foundation.sql`)
- [ ] Local DB reset and migration verification
- [ ] Database type generation (`src/types/database.generated.ts`)
- [ ] Domain types and pure predicates (`src/features/auth/domain/location-role.ts`)
- [ ] Server-authoritative data readers (`src/features/auth/data/location-role.ts`)
- [ ] Database/pgTAP tests (`supabase/tests/database/0053_location_roles.test.sql`, DB-001 through DB-020)
- [ ] Domain and data reader unit tests (`location-role.test.ts`)
- [ ] Local validation: format, lint, typecheck, unit tests, pgTAP, Next.js build
- [ ] Hosted DEV dry run & push (`opmujepkemwcdxxorhfd`)
- [ ] Hosted DEV schema & policy verification
- [ ] Update evidence and documentation
- [ ] Git commit and push to remote
- [ ] Open PR to `development`
- [ ] Exact-head CI green
- [ ] Merge commit into `development` and closeout tracking

## Current State & Next Step

Pre-flight and documentation complete. Next: author migration `20261103010000_location_roles_foundation.sql`.
