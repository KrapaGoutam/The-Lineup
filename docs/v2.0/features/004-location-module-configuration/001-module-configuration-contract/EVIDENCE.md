# V2-004.001 — Evidence

Environment: **Claude Code Cloud** (isolated; no hosted database touched). Date: 2026-11-05.
Status: **Implemented in Cloud; hosted DEV validation pending.** Not complete.

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

| Check                                                                                                                                                                | Result                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **MC-001** all 73 migrations (72 existing + this one) apply in order on an empty database                                                                            | ✅ 73/73, no error                                                                                                                                                                                                                                                 |
| New suite `0062_location_module_configs.test.sql`                                                                                                                    | ✅ **92/92**                                                                                                                                                                                                                                                       |
| Regression: the 61 pre-existing pgTAP files re-run **after** the migration                                                                                           | ✅ 58 files pass completely (incl. 0050–0061 = 370 assertions)                                                                                                                                                                                                     |
| …3 files that cannot pass in this shim: `0039`, `0042` (`dblink` to `host.docker.internal` — Docker-only concurrency probes), `0045` (needs the real storage grants) | ⚠️ identical results (`0039`: 86 ok / 7 errors, `0042`: 103 ok / 14 errors, `0045`: 29 ok / 6 errors) **with and without** the new migration, run on a baseline cluster that lacks it ⇒ environment limits, not regressions; Local must run them in the real stack |
| **MC-013/014** migration inserts nothing, nothing else references or consults the new objects                                                                        | ✅ pgTAP `MC-013a–c`, `MC-014a–c`                                                                                                                                                                                                                                  |
| Mutation checks (5 targeted migration breakages)                                                                                                                     | ✅ each caught (TEST_MATRIX)                                                                                                                                                                                                                                       |
| Database CI discovery                                                                                                                                                | ✅ `supabase db reset` / `supabase test db` pick up files by directory; no list to update                                                                                                                                                                          |

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

**Local step:** run `npm run db:types`-equivalent against the local stack (`npx supabase gen types typescript --local > /tmp/types.ts`) and `diff` the `location_module_configs` table, the `location_module_key` enum and `Constants` blocks; expect no difference (a differing function section is pre-existing generator drift, unrelated).

## 5. Remaining Local / hosted DEV validation (exact steps)

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
| Anonymous writes (and reads) rejected                                                             |       ✅        |    pending     |
| Unauthorized staff / location manager / shift manager / Overall Assistant Manager writes rejected |       ✅        |    pending     |
| Cross-organization write and read rejected                                                        |       ✅        |    pending     |
| Inactive/revoked membership or assignment loses access immediately                                |       ✅        |    pending     |
| Forged / unknown / system-required module keys rejected                                           |       ✅        |    pending     |
| No role elevation; authority tables byte-identical after writes                                   |       ✅        |    pending     |
| No automatic location assignment                                                                  |       ✅        |    pending     |
| Ownership immutable; audit columns unforgeable                                                    |       ✅        |    pending     |
| RLS enabled; no unrestricted grants; no client delete                                             |       ✅        |    pending     |
| No `SECURITY DEFINER` RPC added; no actor parameter anywhere                                      | ✅ (structural) |      n/a       |

**Unresolved findings:** none blocking this phase. Recorded limitations: PLAN §6.1 (RLS cannot distinguish "no rows" from "rows you cannot read"; fail-closed), PLAN §13 (V2-003/V2-005 residuals are **not** resolved by this table). Production release remains blocked on V2-005, V2-008, V2-009.
