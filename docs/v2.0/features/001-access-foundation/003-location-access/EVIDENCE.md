# Subfeature V2-001.003: Location Access — Evidence

Parent Feature: [V2-001: Access & Role Foundation](../README.md)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Tracking Issue: [#263](https://github.com/KrapaGoutam/The-Lineup/issues/263)  
Parent Issues: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248), [#249](https://github.com/KrapaGoutam/The-Lineup/issues/249)  
Status: `READY_FOR_PR`

---

## 1. Git Baseline

- **Starting development SHA:** `a23149796bcdecc66de24a522e996ca009e8da67`
- **Starting main SHA:** `5e5b7747693b6e81014eafdf299b87e56c3f033d`
- **Feature Branch:** `feature/v2.0-001.003-location-access`
- **Worktree:** `.tmp/v2-location-access`

---

## 2. Schema Architecture & Migration Decision

- **Decision:** **Outcome B — Additive Forward Migration**
- **Migration File:** `supabase/migrations/20261103001500_location_access_foundation.sql`
- **Canonical Table:** `public.location_memberships`
- **Properties Verified:**
  - `id`: `bigint generated always as identity primary key`
  - `location_id`: `uuid not null references public.locations (id) on delete cascade`
  - `profile_id`: `uuid not null references public.profiles (id) on delete cascade`
  - `active`: `boolean not null default true`
  - `created_at`: `timestamptz not null default now()`
  - `updated_at`: `timestamptz not null default now()`
  - Unique Constraint: `unique (location_id, profile_id)`
  - Indexes:
    - `location_memberships_profile_idx on public.location_memberships (profile_id) where active;`
    - `location_memberships_location_idx on public.location_memberships (location_id) where active;`
  - Row-Level Security: Active with 4 policies:
    - `location_memberships_select` (self or org member)
    - `location_memberships_insert_manager` (owner/manager only; self-assignment & cross-user by non-managers rejected)
    - `location_memberships_update_manager` (owner/manager only)
    - `location_memberships_delete_manager` (owner/manager only)
- **Local Database Reset:** `npx supabase db reset` succeeded; all 63 migrations applied cleanly.
- **Generated Types:** `npx supabase gen types typescript --local` updated `src/types/database.generated.ts` with `location_memberships` table definitions.

---

## 3. Test Evidence

### 3.1. Vitest Unit Suite

- Command: `npm test`
- Results: 167 test files passed, 2,202 tests passed, 7 skipped.
- New unit test suites:
  - `src/features/auth/domain/location-access.test.ts` (16 tests passed)
  - `src/features/auth/data/location-access.test.ts` (17 tests passed)
- Regression coverage:
  - `src/features/auth/domain/organization-membership.test.ts` (10 tests passed)
  - `src/features/auth/data/organization-membership.test.ts` (16 tests passed)
  - `src/features/auth/domain/overall-role.test.ts` (9 tests passed)
  - `src/features/auth/data/overall-role.test.ts` (11 tests passed)
  - All 12 auth test files passing (109/109 tests).

### 3.2. pgTAP Database Suite

- Command: `npx supabase test db`
- Results: 52 test files passed, 1,618 tests passed.
- Subfeature pgTAP test file:
  - `supabase/tests/database/0052_location_access.test.sql` (24/24 subtests passed):
    - DB-001: `location_memberships` table exists (PASS)
    - DB-002a..f: Column definitions exist (PASS)
    - DB-003a..b: Primary key and `(location_id, profile_id)` uniqueness (PASS)
    - DB-004..007: Jack multi-location explicit assignments across organizations (PASS)
    - DB-008: Duplicate assignment rejected via unique constraint (PASS)
    - DB-009: Multiple people assigned to the same location (PASS)
    - DB-010: Org membership alone does not grant branch access (PASS)
    - DB-011a..c: Effective scoped access evaluator (Sam NASA ALLOW, League City DENY, Webster DENY) (PASS)
    - DB-012: Inactive organization membership invalidates effective location access (Jerry scenario) (PASS)
    - DB-012b: Multi-org independence preserved during deactivation (PASS)
    - DB-013: Inactive location assignment denies effective access (PASS)
    - DB-014: Unauthorized direct self-assignment rejected by RLS (PASS)
    - DB-015: Unauthorized cross-user location assignment rejected by RLS (PASS)
    - DB-016: Cross-organization tenant isolation (PASS)
    - DB-017: No automatic "all branches" expansion (PASS)
    - DB-018: Real profile bindings; no fake overall role placeholders (PASS)
- Regression suites:
  - `0050_overall_roles.test.sql` (22/22 subtests passed)
  - `0051_organization_membership.test.sql` (22/22 subtests passed)

### 3.3. Typecheck, Lint, Build & Quality Gates

- Commands:
  - `npm run format:check`: All matched files use Prettier code style!
  - `npm run lint`: `eslint . --max-warnings=0` passed with 0 warnings or errors.
  - `npm run typecheck`: `next typegen && tsc --noEmit` passed with 0 errors.
  - `npx next build --webpack`: 13/13 routes compiled, typechecked, and statically/dynamically generated with zero errors.
  - `node scripts/check-tracked-local-paths.mjs`: `check-tracked-local-paths: ok`.
  - `node scripts/check-nonprod-env.mjs --env-file .env.development.local`: passed.

---

## 4. Hosted DEV Verification

- **Target Project Ref:** `opmujepkemwcdxxorhfd` (`the-lineup-dev`)
- **Supabase Authentication:** Process-locally mapped `LINEUP_SUPABASE_ACCESS_TOKEN` as authoritative token; local CLI default login was NOT trusted.
- **V2-001.001 Prerequisite Application:**
  - Applied pending migration `20261102213000_overall_roles_foundation.sql` via `supabase db push`.
  - Verified on hosted DEV: enum `public.overall_role`, table `public.overall_roles`, and policy `overall_roles_select_self` present.
- **V2-001.003 Migration Application:**
  - Applied forward migration `20261103001500_location_access_foundation.sql` via `supabase db push`.
  - Verified on hosted DEV:
    - `table_count = 1`: `public.location_memberships` table exists.
    - `policy_count = 4`: all 4 RLS policies (`location_memberships_select`, `location_memberships_insert_manager`, `location_memberships_update_manager`, `location_memberships_delete_manager`) active.
    - `columns = ['id', 'location_id', 'profile_id', 'active', 'created_at', 'updated_at']`.
    - Migration records `20261102213000` and `20261103001500` confirmed in `supabase_migrations.schema_migrations`.
- **Production Guard:** `ftadewtkjlaotfdvtjcv` was completely untouched (zero link, zero network calls, zero mutations).

---

## 5. Pull Request & CI Gate

- **PR Number:** (Pending)
- **Exact Head SHA:** (Pending)
- **CI Checks:** (Pending)
- **Merge Commit SHA:** (Pending)
