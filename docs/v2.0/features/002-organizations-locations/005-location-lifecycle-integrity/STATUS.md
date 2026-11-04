# Subfeature V2-002.005: Location Lifecycle Integrity — Status

Parent Feature: [V2-002: Organizations & Locations](../README.md)
Milestone: The Lineup V2.0 (#8) · Feature #250 · Program #248 · Issue #281
Status: **READY_FOR_CODEX_LOCAL_VALIDATION** (not COMPLETE — hosted DEV verification and merge are pending)
Branch: `feature/v2.0-002.005-location-lifecycle-integrity` · Integration target: `development`
Starting `origin/development`: `6aa61760ca8bbe8a643fae8ca8c27958dbd31a69` · `origin/main`: `5e5b7747693b6e81014eafdf299b87e56c3f033d` (untouched)
Migration: `supabase/migrations/20261104020000_location_lifecycle_integrity.sql`

## Deliverables

| Deliverable                                                      | Status              | Notes                                                          |
| ---------------------------------------------------------------- | ------------------- | -------------------------------------------------------------- |
| Pre-flight (dev/main SHAs, PR #280 merged)                       | Complete            |                                                                |
| Lifecycle model (`archived_at` + CHECK, `active` preserved)      | Complete            | PLAN §2                                                        |
| Audit table (append-only, RLS read, no client write)             | Complete            |                                                                |
| Transition RPC (atomic, row-locked, expected-state, blockers)    | Complete            | `LC001/2/3`                                                    |
| Readiness reader                                                 | Complete            | shares blocker logic with the RPC                              |
| Direct-update bypass guard                                       | Complete            | DB-012                                                         |
| Hard-delete protection                                           | Complete            | DB-015                                                         |
| Operational write guards (12 tables + assignments)               | Complete            | PLAN §7                                                        |
| Domain / data / actions                                          | Complete            |                                                                |
| Administration UI + demo isolation                               | Complete            |                                                                |
| pgTAP 0059                                                       | Complete            | 96 assertions; also run locally on PostgreSQL 16, see EVIDENCE |
| Vitest                                                           | Complete            | 192 files / 2,617 passed, 7 skipped (pre-existing)             |
| Playwright desktop + mobile (mocked demo)                        | Complete            |                                                                |
| Playwright WebKit `host-tablet`                                  | PENDING_CODEX_LOCAL | WebKit download blocked in Cloud                               |
| Format / lint / typecheck / `next build --webpack` / local paths | Complete            |                                                                |
| Isolated database CI (`migrations-and-policies`)                 | See PR checks       | exact-head result is reported in the PR and the Cloud report   |
| Hosted DEV migration + real-database verification                | PENDING_CODEX_LOCAL | `opmujepkemwcdxxorhfd` only                                    |
| Merge into `development`                                         | NOT DONE            | merge commit only, after hosted DEV verification               |

## Hosted DEV checklist (Codex Local)

1. Fetch the exact PR head; verify DEV project ref `opmujepkemwcdxxorhfd` (never `ftadewtkjlaotfdvtjcv`).
2. Pending-migration set → dry run → apply `20261104020000`; confirm ledger sync.
3. Re-run pgTAP `0050`–`0059` in rolled-back transactions on DEV.
4. Synthetic-fixture checks only (never a real location): deactivate / blocker rejection / audit persistence / invalid transition / reactivate / archive / restore; hard-delete denial; cross-tenant denial; operational guards at inactive + archived; history preserved; sibling unaffected.
5. Real concurrency: two sessions, transition vs. session insert, and transition vs. transition.
6. `supabase gen types` must produce no diff against the hand-edited `database.generated.ts`.
7. WebKit `host-tablet` project; exact-head CI; then `gh pr merge --merge`.
