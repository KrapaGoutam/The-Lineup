# Feature V2-008: Migration & Compatibility — Status

> **2026-11-13 (FINAL, authoritative):** V2-008 **DEV compatibility ACCEPTED** under owner decisions A1/B1/C1/D1/E1 and two explicit amendments (.004 module configuration, .005 `attendance_mode` NULL). **Production release NOT approved.** Migration 92 SHELVED. PR #325 is MERGED (`207d088d`). #256 stays open pending a separately authorized update. See [DEV_ACCEPTANCE_RECORD.md](DEV_ACCEPTANCE_RECORD.md). Earlier banners and the sub-feature table below are historical.

> **2026-11-13 (closeout review):** DEV closeout reviewed — **CONDITIONALLY READY**; see [CLOSEOUT_REVIEW.md](CLOSEOUT_REVIEW.md). Owner acceptance outstanding for D-5/5b (Manual Preview unconfigured), D-6 (Attendance `NULL`) and the DEV-scope boundary (Production → V2-009). Migration 92 **SHELVED — NOT APPROVED FOR DEPLOYMENT OR MERGE**. #256 checkboxes not ticked. The sub-feature table below is superseded by CLOSEOUT_REVIEW §2.

> **2026-11-13 (later):** D-3 Option A EXECUTED: Manual Preview GM→manager and server→staff both saved via the app and verified; role planner NOOP (Manual Preview and the-monks); ledger 91, migration 92 absent, enforcement staged, Finance off. Manual Preview still has 0 module rows (D-5/5b) and NULL attendance (D-6). See HANDOFF 00000000.2. Supersedes the 'pending' note above.

> **2026-11-13 update:** D-3 Option A and D-7C (shelve migration 92) APPROVED by the owner. Manual Preview's two human-operated Staff Assignments are **PENDING** (none performed). See HANDOFF 00000000.1 and track2/D3_OPTION_A_OPERATOR_PROCEDURE.md. Migration 92 is shelved / not for deployment.

```text
Status: IN PROGRESS — SECURITY TRACK DELIVERED (PR #325 MERGED INTO development AS 207d088d, HOSTED DEV LEDGER 91); TRACK 2 BACKFILL EXECUTOR BUILT AND TESTED LOCAL-ONLY (migration 20261113120000, not applied to Hosted DEV); ALL REAL BACKFILLS (D-7C), V2-004 ENFORCEMENT ACTIVATION AND V2-009 STILL PENDING; ISSUE #256 OPEN
GitHub Issue: #256
Parent Issue: #248
Milestone: #8 — The Lineup V2.0
Target Branch: development
Feature Branch (Track 1, merged): feature/v2-008-migration-compatibility (merged as 207d088d)
Feature Branch (Track 2, local only): feature/v2-008-backfill-executor (base 207d088d)
```

**Track 2 continuation 3 — minimal-completion plan (2026-11-13, local docs only):** a read-only refresh (91 Hosted DEV tables hash-identical to the morning snapshot) confirms `the-monks` is fully mapped and the only real gap is **two** location rows in Manual Preview, which the existing supported workflow (`apply_location_assignment_changes`, Settings → Staff Assignments) can create. **Recommendation: no bulk executor (Option A) and shelve migration 92 (Option B);** its table locks are disproportionate for 2 rows and a verified FK-cascade deadlock path corrects an earlier claim. Only **D-3** is needed from the owner. Nothing deployed or written. See [track2/MINIMAL_COMPLETION_PLAN.md](track2/MINIMAL_COMPLETION_PLAN.md).

**Track 2 continuation 2 — live read-only reconciliation (2026-11-13):** a fresh read-only Hosted
DEV snapshot (ledger 91 confirmed, Track 2 functions absent, enforcement staged, Finance off)
shows the first pilot `the-monks` is **already fully mapped — a verified no-op** (role `NOOP`,
modules and attendance `REPORT_ONLY`); no backfill, no migration 92 deployment and no executor run
is needed for it. A genuine new-row concurrency race in the local executor (new `memberships` /
`location_memberships` rows were not blocked) was reproduced with two real sessions and **closed**
in the not-yet-deployed migration 92 with table-level locks (pgTAP `0082` 37/37, new two-session
regression test 4/4, clean 92-migration replay). The approval boundary (spoofable manifest JSON;
hostname-only loopback) is documented as a prerequisite for any real write and **not built**. The
owner-decision table and Hosted DEV approval package are refreshed; **nothing is approved, nothing
was written to Hosted DEV.** See [track2/HOSTED_DEV_APPROVAL_PACKAGE.md](track2/HOSTED_DEV_APPROVAL_PACKAGE.md).

**Track 2 continuation — executor hardened, decisions consolidated (2026-11-13, same day):** a
safety-verification pass on the Track 2 executor found and fixed two real gaps: readiness
(verdict) was being treated as owner approval (fixed — an actual approved manifest is now
independently required and verified), and `location_memberships` was unlocked during a
role-backfill transaction (fixed — proven with genuinely concurrent `psql` sessions, not pgTAP).
The pre-existing `0076` calendar-dependent pgTAP flake was classified (a test-fixture day-boundary
bug, not a product defect) and fixed; the full suite is now deterministic (3522/3522, confirmed
twice). The nine D-7C decisions are reorganized into one owner-facing table with a first-pilot
recommendation (`the-monks`, not re-verified live). See
[track2/D7C_OWNER_DECISION_TABLE.md](track2/D7C_OWNER_DECISION_TABLE.md). **Still local-only; no
Hosted DEV contact.**

**Track 2 local-only backfill executor (2026-11-13):** the organization-atomic writer the planning
kit always lacked now exists — `migration_compat_execute_role_backfill` and
`migration_compat_execute_module_config` (new local-only migration `20261113120000`), called only
through `scripts/migration-compat-executor/executor.mjs` (loopback-only, verdict-gated). pgTAP 0082
34/34; two Vitest suites green; `npm run check`-equivalent clean. **Not applied to Hosted DEV or
Production; no real organization touched.** D-7C's nine decisions reorganized into one matrix
(still unapproved); an owner-ready template for a future real backfill is drafted and unfilled.
See [track2/TRACK2_EXECUTOR.md](track2/TRACK2_EXECUTOR.md),
[track2/D7C_DECISION_MATRIX.md](track2/D7C_DECISION_MATRIX.md),
[track2/HOSTED_DEV_APPROVAL_PACKAGE.md](track2/HOSTED_DEV_APPROVAL_PACKAGE.md).

Batch A produced analysis and plans only. **Batch B1** (owner-authorized, local only) then implemented D7 and the F-1 hardening: one forward-only migration (local ledger 88 → 89), the Settings → Kiosks entry, targeted pgTAP/real-Auth/browser tests and a focused security review — see [D7 plan §8](D7_LOCATION_SCOPED_KIOSK_PLAN.md). **No data backfill, Hosted DEV write, Production or Neon contact occurred in either batch; Hosted DEV is still at ledger 88.** Next-step constraints for B2–B4: [B2_B4_NEXT_STEP_PACKAGE.md](B2_B4_NEXT_STEP_PACKAGE.md). Resume from [HANDOFF.md](HANDOFF.md).

**Batch C controlled Hosted DEV rollout (2026-11-13):** owner approvals D-7A, D-7B and G-1 were granted and used exactly as scoped. After a fresh DPAPI-encrypted backup (restore-validated: 121 tables identical, 198 policies equal) and a real-data rehearsal (354/354 pgTAP), migrations 89, 90 and 91 were applied to Hosted DEV `opmujepkemwcdxxorhfd` only — **ledger 88 → 91**, function/grant-only, **all 91 tables identical** before/after (existing Auth sessions intact), enforcement `staged`, Finance OFF, no module/attendance/role change. Rollback-only probes on Hosted DEV: F-1+D7 105/105, U-1 69/69, E-1 105/105. The GitHub `production` environment has **no required reviewers** (a merge to `main` touching migrations auto-runs `supabase db push`) — a Production-release blocker for the owner. Receipt: [batch-c/BATCH_C_ROLLOUT_RECEIPT.md](batch-c/BATCH_C_ROLLOUT_RECEIPT.md). **Not delivered:** actual organization/role/module/attendance backfills (no executor exists), enforcement activation, Production migration; V2-008 is not complete.

**Security Gate S1 (2026-11-12, local only):** U-1 fixed by `20261112220000_kiosk_reassign_revoked_device_guard.sql` (local ledger 89 → 90; reproduced first, 69/69 after, full pgTAP 3363 PASS on a clean 90-migration replay, real-GoTrue 8/8, browser 21/21); E-1 reproduced and bounded with a remediation plan (no cross-tenant write by any tenant-scoped actor; not implemented); D-2/2b/2c packet written with measured evidence; shared `session_id` review found no bypass. See [SECURITY_GATE_S1.md](SECURITY_GATE_S1.md), [U1_KIOSK_REVOKED_DEVICE_LIFECYCLE.md](U1_KIOSK_REVOKED_DEVICE_LIFECYCLE.md), [E1_RECIPES_INVENTORY_SECURITY_PLAN.md](E1_RECIPES_INVENTORY_SECURITY_PLAN.md).

**Batch B continuation (2026-11-13, local only, one cumulative package):** E-1 is implemented by forward-only migration `20261113100000_e1_shared_catalog_authority.sql` (local ledger 90 → 91; Hosted DEV still 88): organization-shared Recipes and Inventory catalog management is organization-level authority, with a single-active-location compatibility exception for location roles. B2 (organization-atomic role-backfill validator), B3 (module-configuration planner) and B4 (Attendance compatibility planner) exist as **read-only dry-run tooling with no executor** ([B2_B4_PLANNING_KIT.md](B2_B4_PLANNING_KIT.md)). Full pgTAP 84 files / 3,488 PASS on a clean 91-migration replay; real-database suites 38/38; planning kit 124/124; browser 8/8 × 3; `npm run check` clean; independent review **no P0/P1** (three P2 and eight P3 findings fixed or mitigated — see [HANDOFF.md](HANDOFF.md)). No real backfill, module change, Attendance-mode change, enforcement/finance activation, push, PR or merge occurred.

**Batch C (2026-11-13, local + read-only Hosted DEV metadata):** readiness for the controlled rollout of migrations 89–91 is established; **no Hosted write, push, PR or merge occurred**. Hosted DEV is exactly ledger 88 and schema-identical to local ledger 88 (16 replaced functions identical; 8 schema categories hash-identical). A populated ledger-88 → 91 rehearsal (9/9) changed 0 rows in 91 tables, kept pre-migration Auth sessions valid and reproduced all three defects before / none after; one independent review, no P0/P1. **Track 1** (three security migrations) awaits **D-7A**; **Track 2** (actual backfills) is untouched and not enabled by Track 1. See [batch-c/BATCH_C_READINESS_RECEIPT.md](batch-c/BATCH_C_READINESS_RECEIPT.md), [rollout/recovery plan](batch-c/ROLLOUT_AND_RECOVERY_PLAN.md) and [approval packet](batch-c/D7_APPROVAL_PACKET.md).

## Sub-feature state (kept distinct)

| Sub-feature                                            | Discovery |       Mapping approved        |                     Implementation                     |             Hosted validation              | Closed |
| ------------------------------------------------------ | :-------: | :---------------------------: | :----------------------------------------------------: | :----------------------------------------: | :----: |
| V2-008.001 Existing Data Inventory                     |   done    |              n/a              |                          n/a                           | DEV read-only done (Production unverified) |   no   |
| V2-008.002 Organization / Location Backfill            |   done    |      pending (D-1, D-3)       |                        pending                         |                  pending                   |   no   |
| V2-008.003 Existing Role Migration                     |   done    | adopted locally (D-2, 2b, 2c) |         **validator + executor done (local)**          |                  pending                   |   no   |
| V2-008.004 Module Configuration Backfill               |  planned  |   pending (D-5, 5b, D-3/4)    |          **planner + executor done (local)**           |                  pending                   |   no   |
| V2-008.005 Attendance Compatibility                    |  planned  |         pending (D-6)         | **planner done (local, dry-run); no writer by design** |                  pending                   |   no   |
| V2-008.006 Hosted DEV Migration Validation             |  planned  |         pending (D-7)         |         **readiness + rehearsal done (local)**         |        pending (D-7A packet ready)         |   no   |
| V2-008.007 Recovery / Forward-Fix                      |  planned  |              n/a              |            **plan + verifier done (local)**            |                  pending                   |   no   |
| **D7** Location-scoped Kiosks UI (carried from V2-007) |   done    |  policy + B1 scope approved   |                    **done (local)**                    |         pending (D-7, Hosted DEV)          |   no   |
| **F-1** Kiosk predicate hardening (found in Batch A)   |   done    |       B1 scope approved       |                    **done (local)**                    |         pending (D-7, Hosted DEV)          |   no   |

## Documents

- [001 Inventory](001-existing-data-inventory/INVENTORY.md)
- [002 Mapping plan](002-organization-location-backfill/MAPPING_PLAN.md)
- [003 Role mapping plan](003-existing-role-migration/ROLE_MAPPING_PLAN.md)
- [Batch B/C dependencies](BATCH_B_C_DEPENDENCIES.md)
- [D7 plan](D7_LOCATION_SCOPED_KIOSK_PLAN.md)
- [Owner decisions](OWNER_DECISIONS_REQUIRED.md)
- [B2–B4 next-step package](B2_B4_NEXT_STEP_PACKAGE.md)
- [Batch C receipt](batch-c/BATCH_C_READINESS_RECEIPT.md) · [rollout/recovery](batch-c/ROLLOUT_AND_RECOVERY_PLAN.md) · [D-7 packet](batch-c/D7_APPROVAL_PACKET.md)
- [D7C owner decision packet](D7C_OWNER_DECISION_PACKET.md) · [Track 2 minimal-completion plan](track2/MINIMAL_COMPLETION_PLAN.md) · [Track 2 executor (shelved)](track2/TRACK2_EXECUTOR.md) · [Track 2 decision matrix](track2/D7C_DECISION_MATRIX.md) · [Hosted DEV approval template](track2/HOSTED_DEV_APPROVAL_PACKAGE.md)
- [Handoff](HANDOFF.md)

## Headline findings (Batch A)

- **P0** Legacy single-location fallback cliff: the first `location_memberships` row in an org disables the DB fallback for every unassigned member; the TypeScript resolver has no fallback at all. Backfill must be all-or-nothing per org and precede the V2 app release.
- **P0** Production has none of the 26 V2 migrations on `development` (assumed from `main` = 62 vs `development` = 88; **unverified**).
- **P1** Enforcement activation blocked on DEV (readiness 1/44) and would disable 8 of 9 modules at the Monks DEV location (intent unknown, D-5).
- **P1** Manual Preview org members have no location assignment (`no_access`) and the org holds real catalog data (D-3).
- **P1** A location `manager`/`assistant_manager` row anywhere grants org-wide Recipes/Inventory management (privilege spill, E-1).
- **P2** F-1: `kiosk_can_manage_location` ignores org membership/live session for the location-manager branch — **fixed locally in B1** (reproduced first: 11 failing assertions on the unfixed predicate; real GoTrue sign-out/ban/deactivation each defeated it on an unexpired token). Not yet on Hosted DEV.
- **P2** Historical strategy SQL is invalid against the deployed schema (superseded, see MAPPING_PLAN §3).

## Invariants held

Hosted DEV ledger 88 (local ledger 90 after S1) · finance OFF · enforcement STAGED · 0 Overall Owners · `main` `5e5b7747` · Production, Neon untouched · V2-007 worktree intact.
