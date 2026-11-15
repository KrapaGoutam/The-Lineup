# V2-004.001 — Evidence

Environment: **Claude Code Cloud** (isolated; no hosted database touched). Date: 2026-11-05.
Status: **COMPLETE — Cloud implementation, then Local official-stack and hosted DEV validation passed (2026-11-05, §7).** Sections 1–6 are the original Cloud record and are kept unchanged except where §7 supersedes them.

## 1. Git and scope

| Item                       | Value                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `origin/development` start | `fcc661df96b5af1c01ebb8f2f00ff42078e02979` (verified against the remote before branching)                            |
| `origin/main`              | `5e5b7747693b6e81014eafdf299b87e56c3f033d` (verified; untouched)                                                     |
| Feature branch             | `feature/v2.0-004.001-module-configuration-contract`                                                                 |
| Issue                      | [#298](https://github.com/KrapaGoutam/The-Lineup/issues/298) (sub-issue of #252; milestone #8; no duplicate existed) |
| Production                 | Never contacted. Production ref `ftadewtkjlaotfdvtjcv` appears only in the existing real-test harness refusal guard. |
| Hosted DEV                 | Not contacted: no `supabase link`, `db push`, token or `.env` used in Cloud.                                         |
| Migration                  | `supabase/migrations/20261105210000_location_module_configs.sql` (head was `20261104164217_…`)                       |

## 2. Database evidence (Cloud, isolated PostgreSQL 16.15)

**How it was run.** A throw-away cluster initialised with `initdb` under `/var/tmp`, started with `listen_addresses=''` (Unix socket only — it cannot reach any network, let alone a hosted project), destroyed afterwards. pgTAP 1.3.2 installed from the OS package; `pg_cron` loaded. Docker is unavailable in Cloud, so the Supabase CLI stack could not be used; instead a minimal **platform shim** supplied what the Supabase stack provides: roles `anon`/`authenticated`/`service_role` (with Supabase's default table privileges), `auth.users`, `auth.uid()` reading `request.jwt.claim.sub`, `extensions` schema + `search_path`, a `storage` stub, the `supabase_realtime` publication. This is a faithful stand-in for the logic under test, **not** the Supabase image; see "Limits" below.

| Check                                                                                                                                                                | Result                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MC-001** all 73 migrations (72 existing + this one) apply in order on an empty database                                                                            | ✅ 73/73, no error                                                                                                                                                                                                                                                                            |
| New suite `0062_location_module_configs.test.sql`                                                                                                                    | ✅ **92/92**                                                                                                                                                                                                                                                                                  |
| Regression: the 61 pre-existing pgTAP files re-run **after** the migration                                                                                           | ✅ 58 files pass completely (incl. 0050–0061 = 370 assertions)                                                                                                                                                                                                                                |
| …3 files that cannot pass in this shim: `0039`, `0042` (`dblink` to `host.docker.internal` — Docker-only concurrency probes), `0045` (needs the real storage grants) | ⚠️ identical results (`0039`: 86 ok / 7 errors, `0042`: 103 ok / 14 errors, `0045`: 29 ok / 6 errors) **with and without** the new migration, run on a baseline cluster that lacks it ⇒ environment limits, not regressions; Local must run them in the real stack — **done, all pass: §7.1** |
| **MC-013/014** migration inserts nothing, nothing else references or consults the new objects                                                                        | ✅ pgTAP `MC-013a–c`, `MC-014a–c`                                                                                                                                                                                                                                                             |
| Mutation checks (5 targeted migration breakages)                                                                                                                     | ✅ each caught (TEST_MATRIX)                                                                                                                                                                                                                                                                  |
| Database CI discovery                                                                                                                                                | ✅ `supabase db reset` / `supabase test db` pick up files by directory; no list to update                                                                                                                                                                                                     |

**Limits (do not over-read this evidence).** (1) Not the Supabase image: Supabase-specific objects beyond the shim (e.g. real `auth` triggers, storage policies, PostgREST behaviour) are unexercised. (2) Real PostgREST/JWT paths — including the `request.jwt.claims` JSON form and column-level behaviour of `INSERT … ON CONFLICT` upserts — are only covered Local. (3) No concurrency test with two live sessions. (4) The 3 environment-limited legacy files above.

## 3. TypeScript and CI gates (Cloud)

| Gate                                        | Result                                                                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `git diff --check`                          | ✅ clean                                                                                                                            |
| `npm run format:check`                      | ✅ all files formatted                                                                                                              |
| `npm run lint` (`--max-warnings=0`)         | ✅                                                                                                                                  |
| `npm run typecheck`                         | ✅                                                                                                                                  |
| `npm run check:local-paths`                 | ✅ ok                                                                                                                               |
| `npm test`                                  | ✅ 223 files · **3078 passed** · 7 skipped (baseline before this work: 3020 ⇒ +58 new, 0 regressions)                               |
| `npx next build --webpack`                  | ✅ exit 0                                                                                                                           |
| Compile-time exhaustiveness (negative test) | ✅ adding an unregistered `AppTab` ⇒ `TS2322`; adding an unregistered DB enum value ⇒ errors in `module-registry.ts`; both reverted |

## 4. Generated types — status and limitation

`src/types/database.generated.ts` now contains `location_module_configs` (Row/Insert/Update/Relationships), the `location_module_key` enum and its `Constants` entry, and the unit tests assert the registry equals that generated enum.

**These additions are generator-produced but not CLI-verified.** The canonical command (`supabase gen types typescript --local`) needs Docker, which Cloud lacks. Instead, `@supabase/postgres-meta@0.91.0`'s TypeScript generator was run against the isolated database twice — before and after the migration — both outputs formatted with the repository's Prettier, and the **diff between the two** (exactly the table, the enum and the constant: 59 added lines, nothing else) was applied as a patch to the committed file. The same generator run on the baseline does **not** byte-match the committed file elsewhere (function argument ordering, `SetofOptions`, the platform `graphql_public` schema, a comment typo — a different generator version than the CLI 2.76.8 era), which is why the whole file was not regenerated. No hand-written type was invented.

**Resolved in §7.2 (CLI-verified, no difference).** Original Local step: run `npm run db:types`-equivalent against the local stack (`npx supabase gen types typescript --local > /tmp/types.ts`) and `diff` the `location_module_configs` table, the `location_module_key` enum and `Constants` blocks; expect no difference (a differing function section is pre-existing generator drift, unrelated).

## 5. Local / hosted DEV validation — exact steps (EXECUTED: results in §7)

Environment: **Local** with the owner's existing, securely configured **DEV-only** credentials (project `opmujepkemwcdxxorhfd`). Never Production (`ftadewtkjlaotfdvtjcv`); do not copy credentials between Local/Codespace/Cloud.

1. Check out the PR's exact HEAD; confirm `git rev-parse HEAD` matches the PR.
2. Local stack: `npm ci && npx supabase start && npx supabase db reset && npx supabase test db` — expect `0062` = 92/92 and every other file green (this includes `0039`, `0042`, `0045`).
3. Types: `npx supabase gen types typescript --local` → diff the new table/enum blocks (§4).
4. `npm run check && npm test && npx next build --webpack`.
5. Hosted DEV (only after the above): confirm `supabase migration list` shows DEV at `20261104164217`, then apply **only** `20261105210000_location_module_configs.sql` to DEV through the owner-approved path (`supabase link --project-ref opmujepkemwcdxxorhfd` then `db push`; verify the ref twice). Confirm DEV has no `location_module_configs` rows and unchanged row counts of locations/memberships.
6. Real JWT: `npm run test:real -- tests/real/module-config.db.real.test.ts` (MCR-01…10; creates and removes its own synthetic organizations/users).
7. Optional: two concurrent sessions — an Org Owner writing a configuration while a second Owner archives the same location; expect one to commit first and the other to be rejected (`55000`) or to see the committed archive, never both applied.
8. Browser/WebKit gates are **not required** for this phase (no UI change); run the repository's standard CI.

**Fixture requirements for step 6 (created by the test itself):** two organizations; locations A, B (org X) and Y (org Y); users: org Owner, org GM, server assigned to A, server assigned as **location manager** to A, org shift manager (unassigned), revoked GM, org-Y owner, Overall Owner, Overall Assistant Manager.

**Criteria before merging into `development`:** exact-head CI green (application, database, Vercel); pgTAP green in the real stack; hosted DEV migration applied once with the checksum matching; real-JWT 10/10; generated-type diff reviewed; migration reviewed; no change to `main`. The PR is a **Draft** until then.

## 6. Security properties — status

| Property                                                                                          |   Cloud pgTAP   | Local real-JWT |
| ------------------------------------------------------------------------------------------------- | :-------------: | :------------: |
| Anonymous writes (and reads) rejected                                                             |       ✅        |       ✅       |
| Unauthorized staff / location manager / shift manager / Overall Assistant Manager writes rejected |       ✅        |       ✅       |
| Cross-organization write and read rejected                                                        |       ✅        |       ✅       |
| Inactive/revoked membership or assignment loses access immediately                                |       ✅        |       ✅       |
| Forged / unknown / system-required module keys rejected                                           |       ✅        |       ✅       |
| No role elevation; authority tables byte-identical after writes                                   |       ✅        |       ✅       |
| No automatic location assignment                                                                  |       ✅        |       ✅       |
| Ownership immutable; audit columns unforgeable                                                    |       ✅        |       ✅       |
| RLS enabled; no unrestricted grants; no client delete                                             |       ✅        |       ✅       |
| No `SECURITY DEFINER` RPC added; no actor parameter anywhere                                      | ✅ (structural) |      n/a       |

**Unresolved findings:** none blocking this phase (the only defect found during Local validation was a test-teardown defect, fixed — §7.3). Recorded limitations: PLAN §6.1 (RLS cannot distinguish "no rows" from "rows you cannot read"; fail-closed), PLAN §13 (V2-003/V2-005 residuals are **not** resolved by this table). Production release remains blocked on V2-005, V2-008, V2-009.

## 7. Local and hosted DEV validation (Claude Code Local, 2026-11-05)

Executed from an isolated git worktree of the PR's exact head `d9e3674f103cb4842f174c7597a05e8831e6645f`. `origin/development` (`fcc661df…`) and `origin/main` (`5e5b7747…`) were re-verified unchanged before and after. Production (`ftadewtkjlaotfdvtjcv`) was never contacted; every hosted command went through a helper that hard-aborts for any project ref other than DEV.

### 7.1 Official local Supabase stack (authoritative environment)

| Item                             | Result                                                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Supabase CLI / Docker / local PG | CLI 2.76.8 (project dev dependency; v3.0.0 available, not adopted) · Docker 29.6.2 · local PostgreSQL 17.6                                                         |
| `supabase db reset --local`      | ✅ all **73** migrations applied in order, new migration last, no error                                                                                            |
| `supabase test db --local`       | ✅ **62 files, 2012 assertions, PASS**                                                                                                                             |
| `0062_location_module_configs`   | ✅ **92/92**                                                                                                                                                       |
| `0039`, `0042`, `0045`           | ✅ all pass in the real stack (they failed only in the Cloud shim: `dblink` to `host.docker.internal` and storage grants) — confirms those were environment limits |
| Canonical types                  | ✅ see §7.2                                                                                                                                                        |

### 7.2 Generated types (CLI-verified)

`npx supabase gen types typescript --local` (CLI 2.76.8) from the fully migrated database, formatted with the repository's Prettier, versus the committed `src/types/database.generated.ts`: **identical except the 5-line `__InternalSupabase { PostgrestVersion }` header**, which `--linked` emits and `--local` does not and which already exists on `development` (not part of this PR). The PR's diff to the file is 59 pure additions, 0 deletions: the `location_module_configs` table (Row/Insert/Update/Relationships), the `location_module_key` enum and its `Constants` entry. No correction needed; no generator churn introduced. `npm run typecheck` passes.

### 7.3 Defect found by the local rehearsal: real-JWT teardown could never complete (test harness, fixed)

Before touching hosted DEV, the real-JWT suite was rehearsed against the local stack (temporary, untracked harness pointing at `127.0.0.1:54321`). All 10 tests passed, **but the teardown left 2 organizations, 3 locations and 2 Auth users behind.**

- **Root cause:** MCR-10 archived a location through `public.transition_location_lifecycle`, which writes `public.location_lifecycle_events`. That table is an append-only audit trail (UPDATE/DELETE/TRUNCATE rejected for every role) with a non-cascading composite FK to `locations`. A location with lifecycle history can therefore never be hard-deleted, which then blocks its organization and creator user. On hosted DEV this would have left permanent synthetic fixtures. The old `afterAll` ignored every error, so the run would still have looked green.
- **Not a migration defect.** The new table behaves as designed (`ON DELETE RESTRICT`, rows removed first by the service role).
- **Fix (test only; no migration or application change):** (1) MCR-10 now archives the synthetic location through the privileged path (`service_role` direct update of `active`/`archived_at`; the lifecycle guard only restricts `authenticated`/`anon`), which writes no audit row. The guard under test reads `locations.archived_at`, so the behaviour exercised is identical; the real RPC transition remains covered, inside a rolled-back transaction, by pgTAP `MC-012i–m`. (2) `afterAll` now checks every step, then verifies that none of this run's tracked organization/location/Auth-user IDs survive, and **throws** with the exact IDs if anything does.
- **Regression proof:** a throwaway copy with the old RPC-based archive fails the new teardown loudly (`V2MC teardown incomplete … locations`), listing the leaked IDs; the fixed suite leaves 0/0/0 organizations/locations/Auth users locally.
- **Stronger state assertions (same change):** the suite previously asserted only error codes. A denied UPDATE under RLS is silent (no error, zero rows), so MCR-03 now also attempts an UPDATE of an existing row as each unauthorized actor and asserts zero affected rows, and every rejection path (MCR-03/04/05/06/07/10) reads the stored rows back with the service role to prove nothing was written, moved or flipped.

### 7.4 Hosted DEV preflight

| Check                       | Result                                                                                                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project identity            | `the-lineup-dev`, ref `opmujepkemwcdxxorhfd`, us-east-2, `ACTIVE_HEALTHY`, PostgreSQL 17.11                                                                                                          |
| Migration history           | 72 rows, head `20261104164217`; exactly equal to the repository's first 72 versions; **new migration absent**; no remote-only and no other pending migration; no repair needed                       |
| Dependencies present        | `private.can_manage_location_lifecycle`, `locations.archived_at`, `overall_roles`, `location_memberships`                                                                                            |
| New objects                 | none existed (enum, table, validator)                                                                                                                                                                |
| Baseline counts             | 30 organizations · 44 locations (0 archived) · 52 memberships · 5 location assignments · 0 overall roles · 53 profiles · 53 Auth users · 170 task notifications · 0 lifecycle events · 0 config rows |
| Pre-existing `v2mc` fixture | none (0 organizations / Auth users / profiles)                                                                                                                                                       |
| Migration file              | `20261105210000_location_module_configs.sql`, 16,448 bytes, SHA-256 `109b7f4a9e3a0fae93078e7877239be5bb4749b98df6ce43809e6607a2b4f19a`; every statement reviewed                                     |

### 7.5 Migration applied to DEV

Route: Management API `POST /v1/projects/<DEV ref>/database/query` with one transaction (guard block → migration verbatim → `schema_migrations` row), the repository's established DEV route. `supabase db push` was not usable: no database password is available and the `deploy-migrations` CI job runs only for pushes to `main` (Production), which is why it was **skipped** on this PR. It is not evidence about DEV and was not relied on.

1. **Dry run:** the full migration inside one transaction ended by a deliberate exception carrying verification JSON (nothing persisted; history stayed 72). The first attempt aborted on a typo in my _verification_ query, rolled back, and was fixed and repeated.
2. **Apply:** committed once. DEV history is now **73**, head `20261105210000`; the stored statement's SHA-256 equals the file's.

| Post-apply check                    | Result                                                                                                                                                                                                               |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enum `location_module_key`          | 9 labels (`table_allocation, tasks, schedule, tips, team, attendance, payroll, bar_inventory, recipes`); **no `settings`**                                                                                           |
| Table / columns                     | `location_id, module_key, is_enabled, metadata, created_at, updated_at, updated_by`; **no `organization_id`**; `is_enabled boolean NOT NULL` with **no default**                                                     |
| Primary key / FK                    | `(location_id, module_key)` / `location_id → locations(id)` **ON DELETE RESTRICT**                                                                                                                                   |
| RLS / policies                      | enabled; `select`, `insert_manager`, `update_manager`; **no DELETE policy**                                                                                                                                          |
| Triggers                            | `guard_row`, `lifecycle_guard`, `forbid_delete`                                                                                                                                                                      |
| Table grants                        | `authenticated`: SELECT, INSERT, UPDATE only; `anon`: none; `postgres`/`service_role`: platform defaults (maintenance path)                                                                                          |
| Function execution                  | `anon`: none. `authenticated`: the two authority helpers and the validator only; the three trigger functions are not executable by clients                                                                           |
| SECURITY DEFINER functions          | `can_manage…`, `can_read…`, `lifecycle_guard` — all `search_path=""`; invoker functions also pin `search_path=""`                                                                                                    |
| Rows inserted by the migration      | **0** (`select count(*) from location_module_configs` = 0) — nothing seeded for Monks, NASA or League City                                                                                                           |
| Existing data                       | counts identical to baseline; `memberships`, `location_memberships`, `profiles`, `overall_roles` content fingerprints identical                                                                                      |
| Supabase advisors (security / perf) | 79 / 129 findings, **none reference the new objects** (unrelated to this migration: 76 `authenticated_security_definer_function_executable`, 1 leaked-password protection, 2 `rls_enabled_no_policy`, FK/index INFO) |
| PostgREST schema cache              | table visible to the API without a manual reload (confirmed by the real-JWT run)                                                                                                                                     |

### 7.6 Real-JWT authorization on hosted DEV

`npm run test:real -- tests/real/module-config.db.real.test.ts` — **MCR-01 … MCR-10: 10/10 passing** (run twice: once before and once after the stored-state strengthening in §7.3; both clean, final version below).

| ID     | Outcome (real Auth JWT, real RLS/grants/triggers)                                                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCR-01 | Org Owner configures two locations of one organization independently; stored `{A: enabled, B: disabled}`; reader reports `enabled` / `disabled` / `missing`                         |
| MCR-02 | Org General Manager and Overall Owner can write; `updated_by` is the real writer (server-stamped, not client-supplied)                                                              |
| MCR-03 | Staff, location manager, shift manager, Overall Assistant Manager and revoked GM: INSERT → `42501`; UPDATE of an existing row → **0 rows affected**; stored rows unchanged          |
| MCR-04 | Another organization's owner and forged/unknown location ids rejected `42501`; nothing stored in either location                                                                    |
| MCR-05 | `anon` INSERT and SELECT → `42501`; nothing stored                                                                                                                                  |
| MCR-06 | Unknown key and `settings` → `22P02`; role/permission-bearing, oversize and non-empty-settings metadata → `23514`; none stored                                                      |
| MCR-07 | Re-pointing a row to another location → `22023`; client DELETE → `42501`; row still present with its original value, nothing moved                                                  |
| MCR-08 | Assigned staff read only their own location; unreadable configuration resolves as not usable (fail-closed `missing`); shift manager sees 0 rows; Overall Assistant Manager can read |
| MCR-09 | Cross-organization and malformed ids → `location_unavailable`; signed-out → `unauthorized`                                                                                          |
| MCR-10 | Archived location: INSERT and UPDATE both `55000`; stored rows unchanged; reader reports `lifecycle: archived` and resolves modules as `location_unavailable`                       |

No role, membership or assignment was changed by any configuration write (fingerprints, §7.7).

### 7.7 Data safety and cleanup (hosted DEV)

| Check                          | Result                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fixtures created per run       | 2 organizations, 3 locations, 9 Auth users/profiles, 7 memberships, 2 location assignments, 2 overall roles, config rows — each tracked by exact ID inside the run                         |
| Cleanup order                  | config rows → assignments → overall roles → memberships → locations → organizations → profiles → Auth users, every step checked; survivors by tracked ID cause a hard failure              |
| Independent verification (SQL) | After each run: counts for **all** tracked tables identical to the pre-run snapshot; `v2mc` organizations / Auth users / profiles = 0; `location_module_configs` = 0; lifecycle events = 0 |
| Existing data preserved        | 30 / 44 / 52 / 5 / 0 / 53 / 53 / 170 unchanged; membership, assignment and profile content fingerprints identical; the five persistent DEV test accounts and their assignments untouched   |
| Broad deletes                  | none; no deletion by name pattern; no unrelated `v2mc-*` / `v2h-*` / historical fixture touched                                                                                            |

### 7.8 Application and static gates (on the final tree)

`git diff --check` ✅ · `npm run format:check` ✅ · `npm run lint` (`--max-warnings=0`) ✅ · `npm run typecheck` ✅ · `npm run check:local-paths` ✅ · `npm test` ✅ 223 files, **3078 passed**, 7 skipped (identical to Cloud) · focused `src/features/modules` ✅ 4 files, 58 tests · `next build --webpack` ✅ (no env files present, so no Production configuration could be read).

The registry/reader contract was spot-checked against the migrated database as well: the DB enum equals the registry (asserted by Vitest against the generated enum), `bar_inventory` ↔ `barInventory` stays a registry mapping, Settings is `system_required` with no key, Team keeps `hostsAccountRecovery: true`, and missing rows / read errors are never reported as enabled.

### 7.9 Residual limitations (carried forward, not resolved here)

- **Missing vs. unauthorized** is not distinguishable through RLS (fail-closed). Unchanged; no RPC added (PLAN Q2).
- **Real RPC archive transition is not part of the hosted real-JWT suite** (see §7.3); it is covered by pgTAP MC-012i–m.
- **Concurrency** (an owner writing while another archives the same location) was not run with two live sessions; it remains the optional check from §5 item 7 and is covered structurally by the `FOR SHARE` serialization.
- `service_role` keeps the platform-default table privileges (maintenance / backfill / teardown path); client roles cannot delete.
- **Nothing consumes this table yet.** Enforcement (V2-004.004) must not be activated in any environment before every ACTIVE location there has explicit, owner-approved rows (V2-008.004). Account recovery must remain reachable when Team is disabled (V2-004.003/.004 acceptance requirement). Production release stays blocked on V2-005, V2-008 and V2-009.
