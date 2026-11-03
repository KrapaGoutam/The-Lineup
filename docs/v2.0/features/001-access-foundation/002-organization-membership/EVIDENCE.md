# Subfeature V2-001.002: Organization Membership — Evidence

Parent Feature: [V2-001: Access & Role Foundation](../README.md)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Tracking Issue: [#261](https://github.com/KrapaGoutam/The-Lineup/issues/261)  
Parent Issues: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248), [#249](https://github.com/KrapaGoutam/The-Lineup/issues/249)  
Status: `READY_FOR_PR`

---

## 1. Git Baseline

- **Starting development SHA:** `5367581300cbfec18b3146c7c96b6e81012163c2`
- **Starting main SHA:** `5e5b7747693b6e81014eafdf299b87e56c3f033d`
- **Feature Branch:** `feature/v2.0-001.002-organization-membership`
- **Worktree:** `.tmp/v2-organization-membership`

---

## 2. Schema Architecture & Decision

- **Decision:** **Outcome A — Reused Without Schema Change**
- **Canonical Table:** `public.memberships`
- **Properties Verified:**
  - `id`: `bigint generated always as identity primary key`
  - `organization_id`: `uuid not null references public.organizations (id) on delete cascade`
  - `profile_id`: `uuid not null references public.profiles (id) on delete cascade`
  - `roles`: `public.app_role[] not null check (cardinality(roles) > 0)`
  - `active`: `boolean not null default true`
  - `created_at`: `timestamptz not null default now()`
  - Unique Constraint: `unique (organization_id, profile_id)`
  - Index: `create index memberships_profile_org_idx on public.memberships (profile_id, organization_id) where active;`
  - Row-Level Security: Active with manager/member policies
- **Migration Execution:** None required.

---

## 3. Test Evidence

### 3.1. Vitest Unit Suite

- Command: `npm test`
- Results: 165 test files passed, 2,169 tests passed, 7 skipped.
- New unit test suites:
  - `src/features/auth/domain/organization-membership.test.ts` (10 tests passed)
  - `src/features/auth/data/organization-membership.test.ts` (16 tests passed)
- Regression coverage:
  - `src/features/auth/domain/overall-role.test.ts` (9 tests passed)
  - `src/features/auth/data/overall-role.test.ts` (11 tests passed)
  - All 10 auth test files passing (76/76 tests).

### 3.2. pgTAP Database Suite

- Command: `npx supabase test db`
- Results: 51 test files passed, 1,594 tests passed.
- Subfeature pgTAP test file:
  - `supabase/tests/database/0051_organization_membership.test.sql` (22/22 subtests passed):
    - DB-001: Active membership in Monks (PASS)
    - DB-002: Simultaneous active membership in Liquor Tap (PASS)
    - DB-003: Membership row independence (PASS)
    - DB-004: Duplicate prevention via `(organization_id, profile_id)` uniqueness (PASS)
    - DB-005: Coexistence of distinct roles across memberships (PASS)
    - DB-006: Inactive membership persistence (PASS)
    - DB-007: Inactive distinguishable from active (PASS)
    - DB-008a: Empty roles array rejected (PASS)
    - DB-008b: Overall role enum value rejected in org membership (PASS)
    - DB-009a: Foreign-key profile integrity (PASS)
    - DB-009b: Foreign-key organization integrity (PASS)
    - DB-010: Normal user cannot self-enroll via client insert (PASS)
    - DB-011: Normal user cannot create membership for others (PASS)
    - DB-012a..c: Cross-tenant isolation in queries (PASS)
    - Acceptance summary assertions: Jack (2), Sam (1), Tom (1), Jerry (2) (PASS)
- V2-001.001 regression:
  - `0050_overall_roles.test.sql` (22/22 subtests passed).

### 3.3. Typecheck, Lint & Quality Gates

- Commands:
  - `npm run format:check`: All matched files use Prettier code style!
  - `npm run lint`: `eslint . --max-warnings=0` passed with 0 warnings or errors.
  - `npm run typecheck`: `next typegen && tsc --noEmit` passed with 0 errors.
  - `node scripts/check-tracked-local-paths.mjs`: `check-tracked-local-paths: ok`.
  - `node scripts/check-nonprod-env.mjs --env-file .env.development.local`: passed.

---

## 4. Hosted DEV Verification

- **Target Project Ref:** `opmujepkemwcdxxorhfd` (`the-lineup-dev`)
- **Verification Execution:**
  - Read-only script query against `public.memberships`:
    - Columns verified: `['active', 'created_at', 'id', 'organization_id', 'profile_id', 'roles']`.
    - Sample organizations query succeeded (`c5e8ad9c-39be-4344-bbdb-ae84306f0134`, `640e508f-a201-431f-bffc-929ecd245ff6`, etc.).
  - Read-only script query against `public.overall_roles`:
    - Query returned: `{"code":"PGRST205","message":"Could not find the table 'public.overall_roles' in the schema cache"}`.
    - Confirmed `public.overall_roles` is not present on hosted DEV.
    - CLI migration push requires `SUPABASE_DB_PASSWORD` or elevated Management API credentials not present in local non-interactive environment.
    - In accordance with V2 execution rules: STOP database mutation work on hosted DEV. Documented blocker under V2-001.001 evidence/status for hosted DEV closeout repair.

---

## 5. Pull Request & CI Gate

- **PR Number:** (Pending)
- **Exact Head SHA:** (Pending)
- **CI Checks:** (Pending)
- **Merge Commit SHA:** (Pending)
