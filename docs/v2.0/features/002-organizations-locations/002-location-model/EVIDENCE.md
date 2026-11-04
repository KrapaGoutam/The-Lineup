# Subfeature V2-002.002: Location Model — Evidence

## 1. Environment & Pre-Flight

- **Integration Branch:** `development`
- **Starting Development SHA:** `f078104d56f29809880d0cd584958c9fd47fbdb3`
- **Starting Main SHA:** `5e5b7747693b6e81014eafdf299b87e56c3f033d`
- **Feature Branch:** `feature/v2.0-002.002-location-model`
- **Worktree:** `.tmp/v2-location-model`
- **GitHub Issue:** [#275](https://github.com/KrapaGoutam/The-Lineup/issues/275)
- **Parent Issue:** [#250](https://github.com/KrapaGoutam/The-Lineup/issues/250)
- **Program Issue:** [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248)
- **Milestone:** The Lineup V2.0 (#8)
- **Supabase Dev Project:** `opmujepkemwcdxxorhfd`
- **Production Guard:** `ftadewtkjlaotfdvtjcv` (Strictly Prohibited; untouched)

---

## 2. Baseline Status

- **Remote Auth Verification:** Process-local mapping of `LINEUP_SUPABASE_ACCESS_TOKEN`. CLI default account NOT trusted.
- **Hosted DEV Migration List:** 67 migrations in sync through `20261103040000_organization_model_foundation.sql`.
- **Vitest Baseline:** 176 test files, 2,384 tests passed, 0 failures, 7 skipped.
- **pgTAP Baseline:** 56 test files, 1,727 assertions passed, 0 failures.

---

## 3. Database Migration & Schema Security

- **Migration File:** `supabase/migrations/20261103050000_location_model_foundation.sql`
- **Key Enhancements:**
  1. Additive `updated_at timestamptz not null default now()` on `public.locations`.
  2. Immutability guard trigger `locations_guard_payload()`:
     - Enforces non-blank, trimmed name between 1 and 120 characters.
     - Authoritative IANA time zone validation against `pg_timezone_names` (requiring `name LIKE '%/%'` or `name = 'UTC'`). Rejects non-canonical abbreviations (`CST`, `EST`, `GMT-6`) and arbitrary strings (`Texas`).
     - Address validation ensuring `jsonb_typeof(address) = 'object'`.
     - Blocks mutation of immutable attributes `id`, `organization_id`, and `created_at`.
     - Automatically updates `updated_at = now()`.
  3. RLS Hardening on `public.locations`:
     - `locations_select_member`: permits active tenant members (via `memberships` or `overall_roles`).
     - `locations_insert_manager`: permits organization owners / GMs or active overall roles (`owner`, `admin`).
     - `locations_update_manager`: permits organization owners / GMs or active overall roles.
     - Direct `DELETE` denied to all roles.
  4. RLS Hardening on `public.operating_hours`:
     - Select permitted to tenant members / overall roles.
     - Insert / Update / Delete permitted to managers / overall roles.
  5. Secure Provisioning RPC:
     - `public.provision_location(p_organization_id, p_name, p_time_zone, p_address, p_cover_weight, p_opening_local, p_closing_local)`:
     - Caller authorization check: requires overall role or organization membership with owner/general_manager role.
     - Automatically initializes standard 7-day operating hours schedule in `public.operating_hours` (Option C normalized model).
     - Explicitly generates **0** synthetic staff memberships to preserve least-privilege boundary.

---

## 4. Test Verification

### 4.1. pgTAP Database Security Test Suite

- **Suite:** `supabase/tests/database/0057_location_model.test.sql` (32 assertions)
- **Full Suite Run:** `npx supabase test db`

```
All tests successful.
Files=57, Tests=1759, 13 wallclock secs ( 0.64 usr  0.29 sys +  0.89 cusr  0.58 csys =  2.40 CPU)
Result: PASS
```

### 4.2. Vitest Test Suite

- **Domain Tests:** `src/features/locations/domain/location.test.ts` (23 tests passed)
- **Reader Tests:** `src/features/locations/data/location-reader.test.ts` (11 tests passed)
- **Mutation Tests:** `src/features/locations/data/location-mutation.test.ts` (15 tests passed)
- **Full Vitest Suite:** `npm test`

```
Test Files  179 passed (179)
     Tests  2433 passed | 7 skipped (2440)
  Duration  21.53s
```

---

## 5. Quality Gates Verification

- `npm run check:env`: PASS
- `npm run check:local-paths`: PASS (`check-tracked-local-paths: ok`)
- `npm run format:check`: PASS (`All matched files use Prettier code style!`)
- `npm run lint`: PASS (`eslint . --max-warnings=0`)
- `npm run typecheck`: PASS (`next typegen && tsc --noEmit` - 0 errors)
- `npx next build --webpack`: PASS (Compiled successfully, static and dynamic routes generated)
- `git diff --check`: PASS (0 trailing whitespace or binary diff anomalies)

---

## 6. Remote Hosted DEV Verification (`opmujepkemwcdxxorhfd`)

- **Dry Run:** `npx supabase db push --dry-run`
  - Output: `Would push these migrations: • 20261103050000_location_model_foundation.sql`
- **Application:** `npx supabase db push`
  - Output: `Applying migration 20261103050000_location_model_foundation.sql... Finished supabase db push.`
- **Sync Verification:** `npx supabase migration list --linked`
  - Output: All 68 migrations (from `20260905065702` through `20261103050000`) verified identical on Local and Remote.
- **Production Guard:** `ftadewtkjlaotfdvtjcv` remained 100% untouched.
