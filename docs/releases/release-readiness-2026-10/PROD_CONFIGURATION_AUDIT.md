# Production configuration audit

All access was read-only. Secrets were never printed; Vercel variables were inspected by **name and environment**, and only the Supabase project ref and the demo flag were extracted from the public `NEXT_PUBLIC_*` values (pulled to a scratch file that was deleted immediately).

## Vercel (project `the-lineup`, team `onepiece11`)

The Vercel MCP connector is authorised for a different team (`one-piece-5779`) and cannot see this project; the audit used the project-linked Vercel CLI (`.vercel/project.json`, `vercel env ls`, `vercel env pull` to scratch, `vercel api` GET). No Vercel skill is installed in this repository; no Vercel mutation was made.

| Check                                   | Result                                                                                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git link                                | GitHub `KrapaGoutam/The-Lineup`; **production branch `main`**.                                                                                                                        |
| Production target                       | deployment of `main` @ `3403058` (READY, created 2026-09-20), aliases `the-lineup-dusky.vercel.app`, `the-lineup-onepiece11.vercel.app`, `the-lineup-git-main-onepiece11.vercel.app`. |
| `development` is not Production         | `development` @ `4ec6fe3` is the latest **Preview** (READY, 2026-10-26), alias `the-lineup-git-development-onepiece11.vercel.app`.                                                    |
| Preview protection                      | SSO protection `all_except_custom_domains` (Preview URLs need Vercel sign-in).                                                                                                        |
| No ignored-build / deploy-hook override | none configured; a push to `main` deploys Production immediately.                                                                                                                     |

### Environment variable names per scope (values not shown)

| Variable                               | Production            | Preview          | Development      |
| -------------------------------------- | --------------------- | ---------------- | ---------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | ✔ → **PROD** ref     | ✔ → **DEV** ref | ✔ → **DEV** ref |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✔                    | ✔               | ✔               |
| `SUPABASE_SECRET_KEY`                  | ✔ (secret)           | ✔ (secret)      | ✔               |
| `APP_PIN_PEPPER`                       | ✔ (secret)           | ✔ (secret)      | ✔               |
| `NEXT_PUBLIC_DEMO_MODE`                | `false`               | `false`          | `false`          |
| `NEXT_PUBLIC_RESTAURANT_SLUG`          | `the-monks`           | `the-monks`      | `the-monks`      |
| `NEON_DATABASE_URL` (Attendance)       | ✔ (secret, 49 d old) | —                | —                |

- **Preview → PROD: no.** **Production → DEV: no.** Production URL ref = `ftadewtkjlaotfdvtjcv`; Preview/Development URL ref = `opmujepkemwcdxxorhfd`.
- Whether the Preview/Development _secret_ keys and pepper belong to DEV could not be read (secret-type values are hidden); isolation of those is inferred from the URL scoping and from the Preview having been smoke-tested against DEV by the owner (PR #135).
- Lint/CI guard: `scripts/check-nonprod-env.mjs` (see `CI_CD_AUDIT.md` CI-7) fails any non-production env file or `.next` output that contains the PROD ref. It is a CI/local guard, not a Vercel build step; the Vercel isolation above is what actually protects Preview.

## Supabase

|                             | DEV `opmujepkemwcdxxorhfd`                                                                                                                                                      | PROD `ftadewtkjlaotfdvtjcv`                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Postgres                    | 17.11                                                                                                                                                                           | 17.6                                                                                                                                 |
| Public tables               | 49                                                                                                                                                                              | 38                                                                                                                                   |
| Migration head              | `20261026120000`                                                                                                                                                                | `20260923100000` (+ `20260911130000` missing, #161)                                                                                  |
| Orgs / profiles / locations | —                                                                                                                                                                               | 1 / 11 / 1 (`America/Chicago`)                                                                                                       |
| Rotation data               | test                                                                                                                                                                            | 36 sessions (2026-09-06 → 2026-10-25), 1,107 entries (1,029 `active`), 153 board events, 19 stale live claims — **all on past days** |
| Realtime publication        | identical to PROD (`board_events, rotation_members, rotation_rounds, seating_tables, seatings, section_assignments, service_sessions, table_rotation_entries, tip_allocations`) |                                                                                                                                      |

The Supabase MCP connector sees only the unrelated `jobquest-*` projects; The Lineup projects were reached with the owner's `LINEUP_SUPABASE_ACCESS_TOKEN` through the Management API, with each call pinned to an explicit project ref.

## Authentication

No auth code changed. Production Auth settings were not inspected (token scope: database/advisors reads). Sign-in is synthetic-email + PIN; PROD pepper present. Include login in the smoke test.

## Attendance (§L)

- Is Production Attendance configured? **Yes at configuration level**: `NEON_DATABASE_URL` is set in the Production scope only.
- Is "Attendance data unavailable" only a DEV Preview limitation? **Yes** — Preview/Development deliberately have no `NEON_DATABASE_URL` (INFRA-A), so the page cannot reach the read-only attendance database there.
- Would the `main` deployment break Attendance? **No evidence of risk**: the release changes no Attendance code (only a Playwright spec and a test file), no Attendance env var, and the Neon database is a separate system untouched by migrations. The Neon connection itself was **not exercised** (no query was sent to it); it is covered by the post-deploy smoke.

## Numeric-label pre-flight on PROD (§D)

The query in `docs/features/table-input-canonical-resolution/PLAN.md` joins entries to sessions through `e.service_session_id`, a column PROD does not have until migration #1. It was run in an **equivalent form** joining through `rotation_rounds.service_session_id` (the same relationship the migration backfills from), read-only, against the single PROD location.

| Measure                                                                                                       | Result                                                                                   |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Registered tables                                                                                             | 27 active: `T1`–`T19`, `B1`–`B8`                                                         |
| Active numeric free-text entries (all sessions)                                                               | 1,008 of 1,029 active entries; **all** numeric labels in PROD are active (1,008 = 1,008) |
| Rows that resolve differently under the new contract (digits with no exact label **and** a registered `T<n>`) | **968** rows / 968 entries across **32 past service dates** (2026-09-06 → 2026-10-25)    |
| Labels involved                                                                                               | digits `1`–`19` (all 19 registered `T` tables)                                           |
| Rows on the current service day (`2026-10-26`, America/Chicago, audit time 11:20 local)                       | **0** — no session exists for today                                                      |
| Latest date with such rows                                                                                    | 2026-10-25 (35 entries, `15 16 17 18 19 4 6 7 8 9`), last assigned 2026-10-26 01:51 UTC  |
| Combined (`+`) labels in PROD                                                                                 | 0                                                                                        |
| Non-numeric free text                                                                                         | one entry `O`                                                                            |
| Mutated by the audit                                                                                          | nothing                                                                                  |

Classification: **historical / inert.** Previous-day boards are read-only (`assert_board_not_locked`), the migration does not rewrite history, and the occupancy trigger only re-evaluates an entry when it is written. So none of the 968 rows can change behaviour on its own. Operationally the staff already type bare table numbers (`15`, `16`, …) — the new contract makes that mean the physical `T15`, which is the intent recorded in #157. The risk exists only if the release happens while a service day has active numeric entries: those entries have no physical claim today and would start colliding (correctly, canonically) with `T<n>` claims. Hence conditions C5 (re-run immediately before; release outside service hours when today has no session or no active entries). **Risk: Low if C5 is honoured.**

## Queries run (all SELECT / GET)

`schema_migrations` listings (DEV, PROD); catalog reads of `pg_proc`, `pg_policies`, `pg_tables`, `pg_publication_tables`, `information_schema` (columns, grants); row counts of `locations`, `dining_tables`, `service_sessions`, `table_rotation_entries`, `section_assignments`, `board_events`, `organizations`, `profiles`; the pre-flight/numeric-label SELECTs above; `GET /v1/projects/{ref}/advisors/security` (DEV, PROD). No `INSERT/UPDATE/DELETE/DDL`.
