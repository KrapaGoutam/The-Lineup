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

## Codex Local final verification — 2026-11-04

The Cloud evidence above is retained as historical evidence. This local section supersedes its pending hosted DEV, generated-types and WebKit items.

### Git and scope

- Cloud PR source = fetched worktree = db56889ff7a5f791d14201e8ebd143c2e5dc9d8c; PR #282 open, original feature branch, target development. Baseline development 6aa61760ca8bbe8a643fae8ca8c27958dbd31a69; main 5e5b7747693b6e81014eafdf299b87e56c3f033d.
- Isolated .tmp/v2-location-lifecycle; unrelated main-checkout changes preserved.
- Original gap confirmed in publishScheduleAction: UPDATE of an existing draft bypassed INSERT-only guards. Forward migration 20261104164217 adds one BEFORE UPDATE trigger for transitions into published, reusing private.guard_location_operational_write and its FOR SHARE location lock. Existing RLS/grants remain authoritative. Archived-to-published is guarded too. No scheduling architecture, UI or applied migration changed.

### Hosted DEV and types

- LINEUP_SUPABASE_ACCESS_TOKEN used as operator credential; controlled CLI process maps it to SUPABASE_ACCESS_TOKEN. Project identity verified through Management API as the-lineup-dev / opmujepkemwcdxxorhfd / ACTIVE_HEALTHY / PostgreSQL 17.11. Production never contacted.
- Ledger preflight: 70 existing migrations matched; exactly the two approved migrations were pending. Supported db push --dry-run --linked printed only 20261104020000_location_lifecycle_integrity.sql and 20261104164217_location_schedule_publication_guard.sql. Applied with db push --linked; full version-list comparison now 72/72 with no drift.
- Verified archived_at, CHECK, audit RLS, authenticated-only lifecycle/readiness execute grants, 16 operational trigger bindings including publication, and enabled append-only audit trigger. Migration review: no DROP/TRUNCATE of historical tables, no payment/payroll/stock/member cascade mutation; inventory_stock auto-seeding stays compatible.
- Linked canonical generation into ignored temporary file, then formatted comparison: missing archived_at in update_location return; transition return expanded and SetofOptions metadata; PostgREST 14.18 generator header. These explained differences are reconciled in database.generated.ts. No missing/nullability/RPC/enum mismatch remains.
- Security advisor: two pre-existing RLS-without-policy notices; 76 generic authenticated SECURITY DEFINER callable notices; leaked-password-protection notice. Existing intentional lifecycle definer RPCs enforce auth.uid, membership/overall authority, empty search_path and authenticated grants; new migration adds no function, grant or policy. Advisor JSON retained only locally.

### Behavioral database evidence

- Hosted pgTAP 0050–0060: 340/340; added focused 0061: 22/22. Total **362/362**, all synthetic transactional fixtures rolled back. 0059 = 96; 0060 publication = 18; 0061 preservation/guards = 22. The original full migration/reset/policy CI evidence remains valid for the Cloud head; final CI must rerun against the corrected head.
- Actual Auth JWT/PostgREST verification bootstrapped eight random synthetic accounts using credentials retrieved for approved DEV with the LINEUP token. Overall Owner, Overall Manager, Organization Owner and GM each deactivate/reactivate; server-derived actor verified. Overall Assistant, staff, foreign-org owner and revoked creator all receive 42501; anonymous denied. Blank reason 22023; stale LC003; repeated invalid transition LC002; archive → active LC002; archive → inactive → active succeeds. Exactly 14 successful transitions produce 14 audit events; rejected calls produce none; sibling stays active.
- Actual client UPDATE publishes at ACTIVE; INACTIVE and ARCHIVED return 55000, retaining draft. Canonical board_add_column cannot create a session at INACTIVE (55000). No direct-table grant was introduced to make a test pass.
- Populated snapshots compare entire stored rows before/after deactivate and archive: finalized tip pools, locked payroll periods, confirmed payments, inventory ledger and nonzero balances, schedules, shifts and assignments, closed sessions, audit, memberships and sibling. All identical. 0061 covers service sessions, seating, periods, shifts, tasks, tip pools, inventory adjustments, assignment insert and reactivation at BOTH non-active states. 0059 verifies finalizing tips and closing sessions remain allowed and failed audit insertion rolls back state.

### True concurrent sessions (hosted DEV)

Five controlled races used independent backend sessions, not sequential calls. Holders sleep only after acquiring their lock; pg_stat_activity verifies waiter Lock/transactionid before results are accepted.

| Race                      | Holder / waiter backend PIDs | Observed result                                                                                            |
| ------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| A: transition first       | 1408109 / 1408111            | 5.26 s wait, canonical board session INSERT rejected 55000, no new session                                 |
| B: session INSERT first   | 1408113 / 1408115            | 5.80 s wait, deactivation LC001 ACTIVE_SERVICE_SESSIONS=1, location remains ACTIVE                         |
| C: conflicting transition | 1408118 / 1408120            | 5.99 s wait, stale expected active fails LC003 after committed deactivation                                |
| D: transition first       | 1408126 / 1408128            | 5.52 s wait, publication 55000, draft retained                                                             |
| D: publication first      | 1408130 / 1408134            | 5.99 s wait, publication commits while ACTIVE; deactivation then succeeds under established warning policy |

The reverse D result is safe serialization: no publication occurs after deactivation. Historical published schedules may remain when a later deactivation is allowed, as required by the original lifecycle policy. Initial harness diagnostics confirmed direct authenticated service_sessions INSERT is denied by the existing grant boundary; the final race uses canonical board_add_column.

All committed random race/JWT fixtures were removed. Synthetic-only audit cleanup and temporary append-only trigger disable/re-enable occurred atomically under its table lock; no other transaction could write while it was disabled. Independent residue query: Auth 0, organizations 0; location/audit residue 0; append-only trigger enabled. Existing restaurant rows were never transitioned or edited.

### Browser and quality

- Actual WebKit host-tablet, workers=1: **16/16 in 1.9 minutes** (lifecycle 4, location administration 4, staff assignments 5, settings 3). Covers badges, reason, typed archive confirmation, blocker counts, keyboard, navigation, responsive overflow and staff denial; inactive reactivation verified. Archive restoration verified by actual JWT RPC; approved archived UI is View History only. Screenshots/traces remain in ignored test-results.
- Focused unit regressions 47/47; full Vitest 192 files, **2,617 passed, 7 existing skips**. npm run check (format/lint/typecheck), check:local-paths and validated DEV environment checks pass.
- Demo/empty-hosted-env webpack build and validated DEV-pinned non-demo webpack build both pass; built output Production-ref scan passes. No dependency change or unrelated refactor. git diff --check clean. Main and Production untouched.
- Exact final PR HEAD, CI run links and merge SHA are recorded in the final section below. No stale Cloud-head CI will authorize the corrected merge.

## Final exact-head CI and merge

- Final corrected PR HEAD: 87e727cd808058da0ca9852dc1c7fbf5bce35854. Application and browser-smoke: [CI run 41873188509](https://github.com/KrapaGoutam/The-Lineup/actions/runs/41873188509), both SUCCESS (desktop browser-smoke 331/331; full Vitest 2,617 passed / 7 existing skips). Migration reset/full pgTAP: [Database run 41873188625](https://github.com/KrapaGoutam/The-Lineup/actions/runs/41873188625), SUCCESS: 61 files / 1,920 assertions, including 0059, 0060 and 0061. Vercel preview SUCCESS. Deploy-migrations correctly skipped (no Production deployment).
- PR #282 merged by MERGE COMMIT into development: c543856a767b9f55452bf5f1c26bf5449d2e624b. No squash/rebase; no second implementation PR. Post-merge fetch verified development contains the merge; main remains 5e5b7747693b6e81014eafdf299b87e56c3f033d. Production never contacted.
- Documentation integration follows the established direct development docs-only closeout process used after PR #280. Its resulting development SHA is recorded in GitHub tracking and the final report after push; implementation and validation remain those of the exact tested head above.
- V2-002.005 and V2-002 COMPLETE. Issues #281/#250 closed after verification; #248 and milestone #8 remain open for later V2 features. V2-003.001 Active Organization / Location Context Resolution is NEXT / NOT STARTED. Recommend Claude Code Cloud for the bounded next feature, with Local reserved for hosted DEV/WebKit gates where needed; nothing from V2-003 is implemented here.
