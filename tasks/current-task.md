# V2-002.002 — Location Model

Approved Subfeature: Branch entity, physical addresses, IANA timezones, and operating metadata.
Canonical docs: `docs/v2.0/features/002-organizations-locations/002-location-model/`
Parent Feature: Issue #250 (`[V2-002] Organizations & Locations`)
Parent Milestone: Issue #248 (`The Lineup V2.0`)
Subfeature Issue: Issue #275 (`[V2-002.002] Location Model`)
Prerequisite: V2-002.001 Organization Model (PR #274 merged at `f078104d56f29809880d0cd584958c9fd47fbdb3`)
Branch: `feature/v2.0-002.002-location-model` (from `origin/development` at `f078104d56f29809880d0cd584958c9fd47fbdb3`)
Worktree: `.tmp/v2-location-model`

## Implementation Checklist

- [x] Pre-flight checks: baseline SHAs recorded (`f078104d56f29809880d0cd584958c9fd47fbdb3` dev, `5e5b7747693b6e81014eafdf299b87e56c3f033d` main), isolated worktree created (`.tmp/v2-location-model`), branch `feature/v2.0-002.002-location-model`
- [x] Subfeature issue created: #275 under Milestone #8, linked to #250 and #248
- [x] Hosted DEV baseline verified: linked to `opmujepkemwcdxxorhfd`, 67 migrations in sync through `20261103040000`
- [x] Full baseline test verification: 176 Vitest files (2,384 tests) and 56 pgTAP files (1,727 assertions) passing
- [x] Initialize canonical feature documentation: `PLAN.md`, `STATUS.md`, `TEST_MATRIX.md`, `EVIDENCE.md` in `docs/v2.0/features/002-organizations-locations/002-location-model/`
- [x] Forward-only database migration: `supabase/migrations/20261103050000_location_model_foundation.sql` (additive `updated_at`, immutability guard trigger for `id`/`organization_id`/`created_at`, IANA timezone catalog validation trigger, address JSON object validation, hardened RLS on `public.locations` and `public.operating_hours`, secure `public.provision_location` RPC)
- [x] TypeScript types regeneration: `npm run db:types`
- [x] Domain implementation & unit tests: `src/features/locations/domain/location.ts`, `location.test.ts`
- [x] Data loader & mutation implementation: `src/features/locations/data/location-reader.ts`, `location-mutation.ts`, and Vitest test suites
- [x] Dedicated pgTAP database security test suite: `supabase/tests/database/0057_location_model.test.sql`
- [x] Local database reset and test run: `npx supabase db reset` and `npx supabase test db` (57 files, 1,759 assertions passing)
- [x] Full Vitest test suite run: `npm test` (179 files, 2,433 tests passing)
- [x] Local quality gates: `git diff --check`, `npm run format:check`, `npm run lint`, `npm run typecheck`, `npx next build --webpack`, `npm run check:local-paths`, `npm run check:env`
- [x] Hosted DEV migration dry-run and apply (`opmujepkemwcdxxorhfd`)
- [x] Hosted DEV live verification: schema, constraints, RLS, provisioning, timezone rejection
- [ ] Stage, commit, push branch `feature/v2.0-002.002-location-model`
- [ ] Open Pull Request targeting `development`
- [ ] Exact-head green CI verification
- [ ] Merge commit into `development` and closeout tracking
