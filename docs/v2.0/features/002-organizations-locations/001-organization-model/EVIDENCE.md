# Subfeature V2-002.001: Organization Model — Evidence

## 1. Environment & Pre-Flight

- **Integration Branch:** `development`
- **Starting Development SHA:** `c152d9d6b48ab8cec5fee6d999b99705748c2a4d`
- **Starting Main SHA:** `5e5b7747693b6e81014eafdf299b87e56c3f033d`
- **Feature Branch:** `feature/v2.0-002.001-organization-model`
- **Worktree:** `.tmp/v2-organization-model`
- **GitHub Issue:** [#273](https://github.com/KrapaGoutam/The-Lineup/issues/273)
- **Parent Issue:** [#250](https://github.com/KrapaGoutam/The-Lineup/issues/250)
- **Program Issue:** [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248)
- **Milestone:** The Lineup V2.0 (#8)
- **Supabase Dev Project:** `opmujepkemwcdxxorhfd`
- **Production Guard:** `ftadewtkjlaotfdvtjcv` (Strictly Prohibited; untouched)

---

## 2. Baseline Status

- **Remote Auth Verification:** Process-local mapping of `LINEUP_SUPABASE_ACCESS_TOKEN`. CLI default account NOT trusted.
- **Hosted DEV Migration List:** 66 migrations in sync through `20261103030000_rls_security_hardening.sql`.
- **DEV Organizations Audit:** 30 organizations present, all conforming to schema constraints (UUID `id`, valid `name`, valid regex `slug`, object `settings`).
- **Vitest Baseline:** 173 test files, 2,339 tests passed, 0 failures.
- **pgTAP Baseline:** 55 test files, 1,696 assertions passed, 0 failures.

---

## 3. Implementation Summary

- **Forward-Only Migration:** `supabase/migrations/20261103040000_organization_model_foundation.sql`
  - Reused `public.organizations` table with additive extension.
  - Hardened RLS policies:
    - `organizations_select_member`: Overall Role holders or active members of target organization.
    - `organizations_insert_owner`: Overall Owner exclusive (denies arbitrary client inserts).
    - `organizations_update_manager`: Overall Owner/Manager or active Org Owner/General Manager.
    - DELETE: Denied (no policy granted, hard delete strictly prohibited).
  - Immutability trigger: `public.organizations_guard_immutability()` blocks mutation of `id`, `created_by`, `created_at`, updates `updated_at`.
  - Provisioning RPC: `public.provision_organization(p_name, p_slug, p_initial_owner_profile_id, p_settings)`
    - `SECURITY DEFINER` with fixed `search_path = public, pg_temp`.
    - Overall Owner authorization guard (`auth_is_overall_owner()`).
    - Validates name and regex slug format.
    - Atomically inserts organization and bootstraps initial owner membership into `public.memberships`.
    - Rolls back completely if initial owner profile does not exist (0 orphaned rows).
- **Domain Layer:** `src/features/organizations/domain/organization.ts`
  - Interfaces: `Organization`, `OrganizationBranding`, `OrganizationSettings`, `UserOrganizationSummary`.
  - Validators: `isValidOrganizationName`, `normalizeOrganizationName`, `isValidOrganizationSlug`, `normalizeOrganizationSlug`, `isValidHexColor`, `isValidLogoPath`, `containsSecretPattern`, `validateOrganizationBranding`, `validateOrganizationSettings`, `mergeOrganizationSettings`, `mapOrganizationRow`.
- **Data Layer:**
  - Readers (`src/features/organizations/data/organization-reader.ts`):
    - `getOrganizationById`, `getOrganizationBySlug`, `listUserOrganizations` (multi-tenant support, no `limit(1)` truncation), `getCurrentUserOrganizations`, `getUserOrganizationSummaries`.
  - Mutations (`src/features/organizations/data/organization-mutation.ts`):
    - `provisionNewOrganization`: Server-authoritative mutation calling `provision_organization` RPC with domain validation.
    - `updateOrganizationMetadata`: Enforces immutable IDs, slugs, and `created_by`; merges and validates settings and branding.

---

## 4. Verification Evidence

### 4.1. Unit Tests (Vitest)

- Focused: `npx vitest run src/features/organizations/` -> 3 test files, 45 tests passed.
- Full Suite: `npm test` -> **176 test files passed, 2,384 tests passed, 0 failures, 7 skipped**.

### 4.2. Database Security Tests (pgTAP)

- Focused: `supabase/tests/database/0056_organization_model.test.sql` -> 31 assertions covering DB-001 through DB-016.
- Full Suite: `npx supabase test db` -> **56 test files passed, 1,727 assertions passed, 0 failures**.

### 4.3. Quality Gates

- `npm run check:env` -> PASS
- `npm run check:local-paths` -> PASS
- `npm run format:check` -> PASS (All matched files use Prettier code style)
- `npm run lint` (`--max-warnings=0`) -> PASS (0 problems)
- `npm run typecheck` (`next typegen && tsc --noEmit`) -> PASS (0 errors)
- `npx next build --webpack` -> PASS (compiled successfully in 15.4s)

### 4.4. Hosted DEV Verification (`opmujepkemwcdxxorhfd`)

- Linked project: `opmujepkemwcdxxorhfd` (`the-lineup-dev`).
- Migration dry-run: `npx supabase db push --dry-run` succeeded without error.
- Migration applied: `npx supabase db push` applied `20261103040000_organization_model_foundation.sql`.
- Migration verified: `npx supabase migration list --linked` confirmed remote database is synchronized at `20261103040000`.
- Production Guard: PROD `ftadewtkjlaotfdvtjcv` and branch `main` remain completely untouched.
