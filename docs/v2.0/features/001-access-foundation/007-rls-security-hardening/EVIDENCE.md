# Subfeature V2-001.007: RLS / Server Security Hardening — Evidence

Parent Feature: [V2-001: Access & Role Foundation](../README.md)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Tracking Issue: [#271](https://github.com/KrapaGoutam/The-Lineup/issues/271)  
Linked Debt Issue: [#106](https://github.com/KrapaGoutam/The-Lineup/issues/106)  
Parent Issues: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248), [#249](https://github.com/KrapaGoutam/The-Lineup/issues/249)  
Status: `IN_PROGRESS`

---

## 1. Git Baseline

- **Starting development SHA:** `fe31d1a003361845a9fb8500d0c60ead31fc0aec`
- **Starting main SHA:** `5e5b7747693b6e81014eafdf299b87e56c3f033d`
- **Feature Branch:** `feature/v2.0-001.007-rls-security-hardening`
- **Worktree:** `.tmp/v2-rls-hardening`

---

## 2. Schema Architecture & Security Hardening Decisions

### 2.1. Elimination of Issue #106 Creator Bypass

- In `private.has_org_role`, permanently eliminated `organizations.created_by = (select auth.uid())`.
- Authority is derived exclusively from active `memberships` rows with matching role sets.
- A deactivated or removed creator immediately loses all authorization across all dependent RLS policies and functions.
- Legitimate creators retain full ownership via `scripts/bootstrap-owner.mjs` and registration flows which insert active `owner` rows in `public.memberships`.

### 2.2. Audit and Hardening of `public.apply_location_assignment_changes`

- Enforces server-verified authentication via `auth.uid()`.
- Incorporates Overall Role tiers: Overall Owner and Overall Manager hold global assignment authority without requiring synthetic org/location rows.
- Rejects Overall Assistant Manager, regular staff, deactivated members, and foreign org managers with `42501 Unauthorized`.
- Requires target profile to hold active parent organization membership.
- Preserves atomic multi-location assignment transactions: zero partial writes on batch failure.

### 2.3. RLS Policy Hardening

- Hardened `public.location_memberships` policies (`select`, `insert`, `update`, `delete`) to harmonize with Overall Role tiers and strict active membership boundaries.

---

## 3. Test Evidence

### 3.1. Vitest Unit Suite

- Command: `npm test`
- Results: 173 test files passed, 2,339 tests passed, 7 skipped, 0 failures.
  - Auth domain & data resolution suites: 18 test files, 246 tests passed.
  - Operational restaurant feature suites: zero regressions.

### 3.2. pgTAP Database Suite

- Command: `npx supabase test db`
- Results: 55 test files passed, 1,696 tests passed, 0 failures.
  - `0008_member_deactivation.test.sql`: 5/5 tests passed (including assertion 5 verifying creator deactivation revokes `has_org_role`).
  - `0055_rls_security_hardening.test.sql`: 28/28 tests passed (covering SEC-001 through SEC-015: creator bypass rejection, active membership validation, Overall Owner/Manager RPC authority, Overall Assistant Manager rejection, atomic batch rollback on invalid location, target profile active membership requirement, and `location_memberships` table RLS policies).

### 3.3. Quality Gates

- `git diff --check`: 0 errors (clean)
- `npm run format:check`: All matched files use Prettier code style!
- `npm run lint`: ESLint passed with 0 errors, 0 warnings (`--max-warnings=0`)
- `npm run typecheck`: TypeScript passed with 0 errors (`tsc --noEmit`)
- `npx next build --webpack`: Next.js production build compiled in 13.7s, generated 13 static pages with 0 errors.
- `npm run check:local-paths`: check-tracked-local-paths: ok
- `npm run check:env`: non-production environment check passed (`.env.development.local`)

---

## 4. Hosted DEV Migration & Live Verification

- **Target DEV Project:** `opmujepkemwcdxxorhfd` (`the-lineup-dev`)
- **Supabase Authentication:** Process-locally mapped `LINEUP_SUPABASE_ACCESS_TOKEN` as authoritative token; local CLI default login NOT trusted.
- **Dry-Run:** `npx supabase db push --dry-run` confirmed only `20261103030000_rls_security_hardening.sql` pending.
- **Migration Execution:** `npx supabase db push` successfully applied `20261103030000_rls_security_hardening.sql`.
- **Recorded Migration:** `supabase_migrations.schema_migrations` confirmed version `20261103030000` (`rls_security_hardening`) applied.
- **Live Function Definitions & Verification:**
  - `private.has_org_role`: Verified strictly queries `public.memberships` (`organization_id`, `profile_id = auth.uid()`, `active = true`, `roles && allowed_roles`). Zero references to `organizations.created_by`.
  - `public.apply_location_assignment_changes`: Verified `auth.uid()` check, Overall Owner/Manager global authority, Overall Assistant Manager denial, target profile active parent organization membership requirement, and atomic multi-location execution.
  - `public.location_memberships` RLS policies: `location_memberships_select`, `location_memberships_insert_manager`, `location_memberships_update_manager`, and `location_memberships_delete_manager` verified active on DEV via `pg_policies`.
- **Production Guard:** `ftadewtkjlaotfdvtjcv` completely untouched.

---

## 5. Pull Request & CI Gate

- **PR Number:** (Pending)
- **Exact Head SHA:** (Pending)
- **CI Checks:** (Pending)
- **Merge Commit SHA:** (Pending)
