# V2-002.005 — Evidence

Environment: Claude Code Cloud, no Supabase credentials, no Docker. Hosted DEV **not** touched; Production **not** touched.

## Local PostgreSQL 16 verification (not hosted DEV)

A throw-away PostgreSQL 16.15 cluster with minimal Supabase stubs (`auth.users`, `auth.uid()`, roles, `storage`, stub `pg_cron`) replayed **all 71 migrations** (70 existing + this one) cleanly, then ran the real pgTAP suites:

| Suite                               | Result                                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `0059_location_lifecycle_integrity` | 96 / 96 ok                                                                                               |
| `0050`–`0058` (all prior V2 suites) | all ok, 0 not ok                                                                                         |
| `0001`–`0049`                       | no regressions from this migration (failures seen were only stub limits: `dblink`, `storage` privileges) |

A first run exposed a real defect in an earlier draft of the delete trigger (it also fired when a stale JWT claim was present during privileged fixture teardown in `0035/0037/0039`); the trigger was narrowed to client roles and those suites pass again.

Caveat: this is **not** equivalent to hosted DEV. The stubs approximate Supabase; DEV verification remains mandatory.

## Real two-session concurrency runs (local PostgreSQL 16, committed fixtures)

| Scenario                                                                 | Observed                                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Transition holds the lock; concurrent `service_sessions` INSERT          | writer waited ≈2.0 s, then `LOCATION_NOT_ACTIVE`; no row created                                  |
| Writer inserts an active session first; concurrent `deactivate`          | transition waited ≈2.0 s, then `LC001` with `ACTIVE_SERVICE_SESSIONS = 1`; location stayed active |
| `deactivate` vs. stale `deactivate→reactivate` (expected state `active`) | winner committed; loser failed `LC003 expected active, found inactive`                            |

Race fixtures were removed afterwards.

## Application gates (this branch)

| Gate                                                       | Result                                                                 |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| `git diff --check`                                         | clean                                                                  |
| `npm run format:check`                                     | pass                                                                   |
| `npm run lint` (`--max-warnings=0`)                        | pass                                                                   |
| `npm run typecheck`                                        | pass                                                                   |
| `npm test`                                                 | 192 files, 2,617 passed, 7 skipped (baseline 188 / 2,551)              |
| `npm run check:local-paths`                                | ok                                                                     |
| `npx next build --webpack`                                 | success                                                                |
| Playwright `desktop` (location-administration + lifecycle) | 8 / 8 passed                                                           |
| Playwright `server-mobile` (+ staff-assignment-management) | 13 / 13 passed                                                         |
| Playwright `host-tablet` (WebKit)                          | not runnable in Cloud (browser download blocked) — PENDING_CODEX_LOCAL |
| `npm run check:env`                                        | not run: requires `.env.development.local` (hosted DEV credentials)    |

Production ref `ftadewtkjlaotfdvtjcv` appears only in pre-existing safety guards (`scripts/check-nonprod-env.mjs`, `tests/real/**`); no new reference was added.

## Exact-head CI

Recorded in the PR (checks `application`, `migrations-and-policies`, `browser-smoke`, Vercel) and in the Cloud implementation report for the final head SHA.
