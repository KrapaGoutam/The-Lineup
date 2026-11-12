# V2-008 Migration & Compatibility — Agent Handoff (after Batch A)

Feature-specific; other V2.0 features keep their own handoffs. A handoff cannot embed its own commit SHA: the Batch A checkpoint SHA is in the chat report and `git log` of `feature/v2-008-migration-compatibility`.

## 1. Exact current state

- Issue #256 OPEN (V2-008), #257 OPEN (V2-009), #248 OPEN, #255 CLOSED. PR #324 MERGED as `790fd2db560c41cb27affe98a70faeb7bd3f07cd`.
- Branch `feature/v2-008-migration-compatibility`, worktree `.tmp/v2-008-migration-compatibility`, based on `origin/development` = `790fd2db` (verified; `development` had not advanced). Local checkpoint commit only: **not pushed, no PR, not merged**. `development` and `main` (`5e5b7747`) unchanged.
- Hosted DEV `opmujepkemwcdxxorhfd` (read-only observation 2026-11-12): ledger **88**, finance **OFF**, enforcement **STAGED**, 0 Overall Owners, 33 orgs, 49 locations (44 active: 42 harness + Monks DEV Location + Manual Preview; 5 archived acceptance), 0 active kiosk sessions.
- Status: **BATCH A CONDITIONAL PASS — OWNER DECISIONS OUTSTANDING.**

## 2. Work completed

| Gate | Result                         | Deliverable                                                                                                      |
| ---- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| A0   | PASS                           | New worktree; V2-007 closeout docs preserved and verified; authoritative CURRENT_STATE entry; trackers corrected |
| A1   | PASS (DEV)                     | [INVENTORY.md](001-existing-data-inventory/INVENTORY.md)                                                         |
| A2   | PASS (DEV), Prod identity open | [MAPPING_PLAN.md](002-organization-location-backfill/MAPPING_PLAN.md)                                            |
| A3   | PASS (conditional on D-1/D-2)  | [ROLE_MAPPING_PLAN.md](003-existing-role-migration/ROLE_MAPPING_PLAN.md)                                         |
| A4   | PASS                           | [BATCH_B_C_DEPENDENCIES.md](BATCH_B_C_DEPENDENCIES.md)                                                           |
| A5   | PASS                           | [D7_LOCATION_SCOPED_KIOSK_PLAN.md](D7_LOCATION_SCOPED_KIOSK_PLAN.md)                                             |
| A6   | CONDITIONAL                    | [OWNER_DECISIONS_REQUIRED.md](OWNER_DECISIONS_REQUIRED.md), this handoff, STATUS                                 |

## 3. Evidence and key conclusions

- Deployed schema is authoritative: per-location table is **`location_memberships`** (not `location_assignments`); module keys verified identical to the canonical nine; the old strategy SQL is invalid and superseded.
- Real DEV tenant (Monks) already has a location row per member matching the V2-D019 ladder (owner/GM→manager, server→staff). No migration is needed for it; DEV proves idempotency only.
- **Fallback cliff:** DB legacy fallback disappears for the whole org at the first location row; the TypeScript resolver has no fallback. Backfill = all-or-nothing per org, before the V2 app release.
- **Privilege spill:** any `manager`/`assistant_manager` row grants org-wide Recipes/Inventory management. `coalesce` modules (Tasks/Tips/Schedule) let a location row override the org role; `greatest` modules do not.
- **Enforcement:** readiness 1/44; Monks DEV has 8 of 9 modules disabled by the owner (intent unknown). Activation remains out of scope.
- **Attendance:** `NULL` already behaves as external-compatible; the blanket `external` update is rejected; no write planned without D-6.
- **Production:** 26 V2 migrations on `development` are not on `main`; Production state/identity UNVERIFIED.
- **D7:** reuse `LocationKioskManagement`; new Settings "Kiosks" card driven by a new read-only RPC over the same `kiosk_can_manage_location` predicate; Location Administration untouched. **F-1 (P2):** that predicate ignores org membership and live session for the manager branch; hardening proposed.
- Read-only method: Management API `database/query` wrapped in `begin read only … rollback`, SELECT/WITH-only guard (tool kept in the session scratchpad, not committed).

## 4. Decisions pending (see register)

D-9 (blocks Batch B) · D-2/2b/2c (blocks B2 and C) · D-1 · D-3 · D-4 · D-5/5b · D-6 · D-7 (blocks any Hosted DEV write) · D-8.

## 5. Protected boundaries

No writes to Hosted DEV, Production, Neon, `main`, or `development`. No real backfill SQL/migration. No fixture archive/delete. No enforcement/finance activation. No attendance-mode, module-config or real-user role change. No Overall Owner. No new Auth identities, no kiosk secrets. Never delete/reuse/unban V2-007 fixtures. Never use `git add -A` (repo is public; `.tmp/`, `docs/testing/` stay untracked). The `.tmp/v2-007-clock-kiosk` worktree must remain intact (its ignored acceptance evidence is `.tmp/hosted-acceptance/v3/`).

## 6. Next implementation step (do not start without approval)

Batch B, in order: **B1** D7 (RPC migration + pgTAP on a local Supabase stack, then action/page/UI/tests) → B2 manifest validator + backfill tooling (needs D-2) → B3 module-config reconciliation tooling (needs D-5) → B4 attendance-mode tooling review. Then Batch C (needs D-7): baseline/backup → rehearsal → approved DEV application → reconciliation → independent review → exact-head CI → owner approval → one merge to `development`. Recommended agent: Claude Code Local (Sonnet 5.x, high effort), new session, reading this handoff first. Production execution belongs to V2-009.

## 7. Work not to repeat

Do not re-inventory DEV unless 24 h+ have passed or a migration landed (re-run the read-only checks in INVENTORY §3–6 first); do not redo the V2-007 acceptance/retest; do not re-derive the authorization-function semantics (ROLE_MAPPING §2); do not re-read the V2-007 test history.

## 8. Batch A end report (A–H, condensed record)

- **A Worktree/recovery:** new worktree + branch from `origin/development` `790fd2db`; old V2-007 worktree intact; four documents carried over after verification, `current-task.md` retargeted.
- **B Discovery:** see §3 and the three plan documents.
- **C Validation:** read-only DEV queries (ledger, schema, functions, counts, tenant consistency, readiness); source inspection of resolver, kiosk, settings; Prettier + `git diff --check` on edited docs. **Deliberately not run:** Vitest, Playwright, pgTAP, build, CI, migration rehearsal, kiosk acceptance, any DEV write.
- **D Security/integrity:** escalation register E-1…E-5 (none is performed by Batch A); finance OFF; enforcement STAGED; **zero unauthorized writes** (all database access was `SELECT` inside a read-only transaction; only documentation files and scratchpad helpers were written).
- **E Git/env:** checkpoint commit local only; issue/PR states as §1.
- **F Outstanding:** §4.
- **G Next action:** §6.
- **H:** this file.
