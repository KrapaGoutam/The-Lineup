# Feature V2-008: Migration & Compatibility — Status

```text
Status: IN PROGRESS — BATCH C READINESS PASSED (HOSTED DEV D-7A REQUIRED); BATCH A COMPLETE; B1 (D7 + F-1), SECURITY GATE S1 (U-1), E-1 (D-10 OPTION A) AND THE B2–B4 DRY-RUN PLANNING KIT IMPLEMENTED LOCALLY; HOSTED DEV (D-7) AND ALL REAL BACKFILLS PENDING
GitHub Issue: #256
Parent Issue: #248
Milestone: #8 — The Lineup V2.0
Target Branch: development
Feature Branch: feature/v2-008-migration-compatibility (base 790fd2db560c41cb27affe98a70faeb7bd3f07cd)
```

Batch A produced analysis and plans only. **Batch B1** (owner-authorized, local only) then implemented D7 and the F-1 hardening: one forward-only migration (local ledger 88 → 89), the Settings → Kiosks entry, targeted pgTAP/real-Auth/browser tests and a focused security review — see [D7 plan §8](D7_LOCATION_SCOPED_KIOSK_PLAN.md). **No data backfill, Hosted DEV write, Production or Neon contact occurred in either batch; Hosted DEV is still at ledger 88.** Next-step constraints for B2–B4: [B2_B4_NEXT_STEP_PACKAGE.md](B2_B4_NEXT_STEP_PACKAGE.md). Resume from [HANDOFF.md](HANDOFF.md).

**Security Gate S1 (2026-11-12, local only):** U-1 fixed by `20261112220000_kiosk_reassign_revoked_device_guard.sql` (local ledger 89 → 90; reproduced first, 69/69 after, full pgTAP 3363 PASS on a clean 90-migration replay, real-GoTrue 8/8, browser 21/21); E-1 reproduced and bounded with a remediation plan (no cross-tenant write by any tenant-scoped actor; not implemented); D-2/2b/2c packet written with measured evidence; shared `session_id` review found no bypass. See [SECURITY_GATE_S1.md](SECURITY_GATE_S1.md), [U1_KIOSK_REVOKED_DEVICE_LIFECYCLE.md](U1_KIOSK_REVOKED_DEVICE_LIFECYCLE.md), [E1_RECIPES_INVENTORY_SECURITY_PLAN.md](E1_RECIPES_INVENTORY_SECURITY_PLAN.md).

**Batch B continuation (2026-11-13, local only, one cumulative package):** E-1 is implemented by forward-only migration `20261113100000_e1_shared_catalog_authority.sql` (local ledger 90 → 91; Hosted DEV still 88): organization-shared Recipes and Inventory catalog management is organization-level authority, with a single-active-location compatibility exception for location roles. B2 (organization-atomic role-backfill validator), B3 (module-configuration planner) and B4 (Attendance compatibility planner) exist as **read-only dry-run tooling with no executor** ([B2_B4_PLANNING_KIT.md](B2_B4_PLANNING_KIT.md)). Full pgTAP 84 files / 3,488 PASS on a clean 91-migration replay; real-database suites 38/38; planning kit 124/124; browser 8/8 × 3; `npm run check` clean; independent review **no P0/P1** (three P2 and eight P3 findings fixed or mitigated — see [HANDOFF.md](HANDOFF.md)). No real backfill, module change, Attendance-mode change, enforcement/finance activation, push, PR or merge occurred.

**Batch C (2026-11-13, local + read-only Hosted DEV metadata):** readiness for the controlled rollout of migrations 89–91 is established; **no Hosted write, push, PR or merge occurred**. Hosted DEV is exactly ledger 88 and schema-identical to local ledger 88 (16 replaced functions identical; 8 schema categories hash-identical). A populated ledger-88 → 91 rehearsal (9/9) changed 0 rows in 91 tables, kept pre-migration Auth sessions valid and reproduced all three defects before / none after; one independent review, no P0/P1. **Track 1** (three security migrations) awaits **D-7A**; **Track 2** (actual backfills) is untouched and not enabled by Track 1. See [batch-c/BATCH_C_READINESS_RECEIPT.md](batch-c/BATCH_C_READINESS_RECEIPT.md), [rollout/recovery plan](batch-c/ROLLOUT_AND_RECOVERY_PLAN.md) and [approval packet](batch-c/D7_APPROVAL_PACKET.md).

## Sub-feature state (kept distinct)

| Sub-feature                                            | Discovery |       Mapping approved        |             Implementation             |             Hosted validation              | Closed |
| ------------------------------------------------------ | :-------: | :---------------------------: | :------------------------------------: | :----------------------------------------: | :----: |
| V2-008.001 Existing Data Inventory                     |   done    |              n/a              |                  n/a                   | DEV read-only done (Production unverified) |   no   |
| V2-008.002 Organization / Location Backfill            |   done    |      pending (D-1, D-3)       |                pending                 |                  pending                   |   no   |
| V2-008.003 Existing Role Migration                     |   done    | adopted locally (D-2, 2b, 2c) |  **validator done (local, dry-run)**   |                  pending                   |   no   |
| V2-008.004 Module Configuration Backfill               |  planned  |   pending (D-5, 5b, D-3/4)    |   **planner done (local, dry-run)**    |                  pending                   |   no   |
| V2-008.005 Attendance Compatibility                    |  planned  |         pending (D-6)         |   **planner done (local, dry-run)**    |                  pending                   |   no   |
| V2-008.006 Hosted DEV Migration Validation             |  planned  |         pending (D-7)         | **readiness + rehearsal done (local)** |        pending (D-7A packet ready)         |   no   |
| V2-008.007 Recovery / Forward-Fix                      |  planned  |              n/a              |    **plan + verifier done (local)**    |                  pending                   |   no   |
| **D7** Location-scoped Kiosks UI (carried from V2-007) |   done    |  policy + B1 scope approved   |            **done (local)**            |         pending (D-7, Hosted DEV)          |   no   |
| **F-1** Kiosk predicate hardening (found in Batch A)   |   done    |       B1 scope approved       |            **done (local)**            |         pending (D-7, Hosted DEV)          |   no   |

## Documents

- [001 Inventory](001-existing-data-inventory/INVENTORY.md)
- [002 Mapping plan](002-organization-location-backfill/MAPPING_PLAN.md)
- [003 Role mapping plan](003-existing-role-migration/ROLE_MAPPING_PLAN.md)
- [Batch B/C dependencies](BATCH_B_C_DEPENDENCIES.md)
- [D7 plan](D7_LOCATION_SCOPED_KIOSK_PLAN.md)
- [Owner decisions](OWNER_DECISIONS_REQUIRED.md)
- [B2–B4 next-step package](B2_B4_NEXT_STEP_PACKAGE.md)
- [Batch C receipt](batch-c/BATCH_C_READINESS_RECEIPT.md) · [rollout/recovery](batch-c/ROLLOUT_AND_RECOVERY_PLAN.md) · [D-7 packet](batch-c/D7_APPROVAL_PACKET.md)
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
