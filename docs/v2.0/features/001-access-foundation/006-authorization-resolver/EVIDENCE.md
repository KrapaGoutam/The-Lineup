# Subfeature V2-001.006: Canonical Authorization Resolver — Evidence

Parent Feature: [V2-001: Access & Role Foundation](../README.md)
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)
Tracking Issue: [#269](https://github.com/KrapaGoutam/The-Lineup/issues/269)
Parent Issues: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248), [#249](https://github.com/KrapaGoutam/The-Lineup/issues/249)
Status: `IN_PROGRESS`

---

## 1. Git Baseline

- **Starting development SHA:** `773ac7e8ee28fd0d99422f7a561709338a8a2755`
- **Starting main SHA:** `5e5b7747693b6e81014eafdf299b87e56c3f033d`
- **Feature Branch:** `feature/v2.0-001.006-authorization-resolver`
- **Worktree:** `.tmp/v2-auth-resolver`

---

## 2. Schema Architecture & Migration Decision

- **Architecture Choice:** Pure domain evaluation (`resolveUserAccess`) + narrow server-authoritative data loader (`resolveCurrentUserAccess`).
- **Migration Decision:** **NO NEW SCHEMA MIGRATION REQUIRED**.
  - All backing entities (`overall_roles`, `memberships`, `locations`, `location_memberships`) and enums (`overall_role`, `app_role`, `location_role`) already exist in the database and have been verified against both local migrations and hosted DEV (`opmujepkemwcdxxorhfd`).
  - No new SQL functions or tables are created in this subfeature.
  - Operational RLS hardening is deferred to V2-001.007 per roadmap.

---

## 3. Test Evidence

### 3.1. Vitest Unit Suite

- Command: `npm test`
- Results: 173 test files passed, 2,339 tests passed, 7 skipped, 0 failed.
- Targeted suites:
  - `src/features/auth/domain/access-resolver.test.ts`: 63 tests passed (OVR, ORG, LOC, COMBO, TENANT, Jack/Sam/Tom/Jerry, John matrices).
  - `src/features/auth/data/access-resolver.test.ts`: 15 tests passed (Current user resolution, privileged cross-user inspection, fail-closed auth and errors).
  - Full Auth regression (`src/features/auth/`): 18 test files, 246 tests passed.

### 3.2. pgTAP Database Suite

- Command: `npx supabase test db`
- Results: 54 test files passed, 1,668 tests passed, 0 failures.
  - `0050_overall_roles.test.sql`: ok
  - `0051_organization_membership.test.sql`: ok
  - `0052_location_access.test.sql`: ok
  - `0053_location_roles.test.sql`: ok
  - `0054_location_assignment.test.sql`: ok

### 3.3. Quality Gates

- `git diff --check`: 0 errors (clean)
- `npm run format:check`: All matched files use Prettier code style!
- `npm run lint`: ESLint passed with 0 errors, 0 warnings (`--max-warnings=0`)
- `npm run typecheck`: TypeScript passed with 0 errors (`tsc --noEmit`)
- `npx next build --webpack`: Next.js production build compiled and finalized successfully
- `npm run check:local-paths`: check-tracked-local-paths: ok
- `npm run check:env`: non-production environment check passed (.env.development.local)

---

## 4. Hosted DEV Verification

- **Target Project Ref:** `opmujepkemwcdxxorhfd` (`the-lineup-dev`)
- **Supabase Authentication:** Process-locally mapped `LINEUP_SUPABASE_ACCESS_TOKEN` as authoritative token; local CLI default login NOT trusted.
- **Migration Baseline:** Verified migration history matches through `20261103020000_multi_location_assignment_workflow.sql`.
- **Production Guard:** `ftadewtkjlaotfdvtjcv` completely untouched.

---

## 5. Pull Request & CI Gate

- **PR Number:** (Pending)
- **Exact Head SHA:** (Pending)
- **CI Checks:** (Pending)
- **Merge Commit SHA:** (Pending)
