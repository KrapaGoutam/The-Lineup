# V2-002.001 — Organization Model

Approved Subfeature: Canonical organization model, tenant lifecycle, branding, slug management, and organization settings.
Canonical docs: `docs/v2.0/features/002-organizations-locations/001-organization-model/`
Parent Feature: Issue #250 (`[V2-002] Organizations & Locations`)
Parent Milestone: Issue #248 (`The Lineup V2.0`)
Subfeature Issue: Issue #273 (`[V2-002.001] Organization Model`)
Prerequisite: V2-001 Access & Role Foundation (PR #272 merged at `c152d9d6b48ab8cec5fee6d999b99705748c2a4d`)
Branch: `feature/v2.0-002.001-organization-model` (from `origin/development` at `c152d9d6b48ab8cec5fee6d999b99705748c2a4d`)
Worktree: `.tmp/v2-organization-model`

## Implementation Checklist

- [x] Pre-flight checks: baseline SHAs recorded (`c152d9d6b48ab8cec5fee6d999b99705748c2a4d` dev, `5e5b7747693b6e81014eafdf299b87e56c3f033d` main), isolated worktree created (`.tmp/v2-organization-model`), branch `feature/v2.0-002.001-organization-model`
- [x] Subfeature issue created: #273 under Milestone #8, linked to #250 and #248
- [x] Hosted DEV baseline verified: linked to `opmujepkemwcdxxorhfd`, 66 migrations in sync through `20261103030000`, 30 organizations audited
- [x] Full baseline test verification: 173 Vitest files (2,339 tests) and 55 pgTAP files (1,696 assertions) passing
- [x] Initialize canonical feature documentation: `PLAN.md`, `STATUS.md`, `TEST_MATRIX.md`, `EVIDENCE.md` in `docs/v2.0/features/002-organizations-locations/001-organization-model/`
- [x] Forward-only database migration: `supabase/migrations/20261103040000_organization_model_foundation.sql` (hardened RLS on `public.organizations`, immutability guard trigger, atomic `public.provision_organization` RPC)
- [x] TypeScript types regeneration: `npm run db:types`
- [x] Domain implementation & unit tests: `src/features/organizations/domain/organization.ts`, `organization.test.ts`
- [x] Data loader & mutation implementation: `src/features/organizations/data/organization-reader.ts`, `organization-mutation.ts`, and Vitest test suites
- [x] Dedicated pgTAP database security test suite: `supabase/tests/database/0056_organization_model.test.sql`
- [x] Local database reset and test run: `npx supabase db reset` and `npx supabase test db` (56 files, 1,727 assertions)
- [x] Full Vitest test suite run: `npm test` (176 files, 2,384 tests)
- [x] Local quality gates: `git diff --check`, `npm run format:check`, `npm run lint`, `npm run typecheck`, `npx next build --webpack`, `npm run check:local-paths`, `npm run check:env`
- [x] Hosted DEV migration dry-run and apply (`opmujepkemwcdxxorhfd`)
- [x] Hosted DEV live verification: schema, constraints, RLS, provisioning, owner bootstrap
- [ ] Stage, commit, push branch `feature/v2.0-002.001-organization-model`
- [ ] Open Pull Request targeting `development`
- [ ] Exact-head green CI verification
- [ ] Merge commit into `development` and closeout tracking
