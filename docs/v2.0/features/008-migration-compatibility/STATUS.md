# Feature V2-008: Migration & Compatibility — Status

```text
Status: IN PROGRESS — BATCH A (READ-ONLY DISCOVERY & PLANNING) COMPLETE, CONDITIONAL PASS
GitHub Issue: #256
Parent Issue: #248
Milestone: #8 — The Lineup V2.0
Target Branch: development
Feature Branch: feature/v2-008-migration-compatibility (base 790fd2db560c41cb27affe98a70faeb7bd3f07cd)
```

Batch A produced analysis and plans only. **No migration, data backfill, source change, Hosted DEV write, Production or Neon contact occurred.** Resume from [HANDOFF.md](HANDOFF.md).

## Sub-feature state (kept distinct)

| Sub-feature                                            | Discovery |           Mapping approved           | Implementation |             Hosted validation              | Closed |
| ------------------------------------------------------ | :-------: | :----------------------------------: | :------------: | :----------------------------------------: | :----: |
| V2-008.001 Existing Data Inventory                     |   done    |                 n/a                  |      n/a       | DEV read-only done (Production unverified) |   no   |
| V2-008.002 Organization / Location Backfill            |   done    |          pending (D-1, D-3)          |    pending     |                  pending                   |   no   |
| V2-008.003 Existing Role Migration                     |   done    |        pending (D-2, 2b, 2c)         |    pending     |                  pending                   |   no   |
| V2-008.004 Module Configuration Backfill               |  planned  |       pending (D-5, 5b, D-3/4)       |    pending     |                  pending                   |   no   |
| V2-008.005 Attendance Compatibility                    |  planned  |            pending (D-6)             |    pending     |                  pending                   |   no   |
| V2-008.006 Hosted DEV Migration Validation             |  planned  |            pending (D-7)             |    pending     |                  pending                   |   no   |
| V2-008.007 Recovery / Forward-Fix                      |  planned  |                 n/a                  |    pending     |                  pending                   |   no   |
| **D7** Location-scoped Kiosks UI (carried from V2-007) | designed  | policy approved; scope pending (D-9) |    pending     |                  pending                   |   no   |

## Documents

- [001 Inventory](001-existing-data-inventory/INVENTORY.md)
- [002 Mapping plan](002-organization-location-backfill/MAPPING_PLAN.md)
- [003 Role mapping plan](003-existing-role-migration/ROLE_MAPPING_PLAN.md)
- [Batch B/C dependencies](BATCH_B_C_DEPENDENCIES.md)
- [D7 plan](D7_LOCATION_SCOPED_KIOSK_PLAN.md)
- [Owner decisions](OWNER_DECISIONS_REQUIRED.md)
- [Handoff](HANDOFF.md)

## Headline findings (Batch A)

- **P0** Legacy single-location fallback cliff: the first `location_memberships` row in an org disables the DB fallback for every unassigned member; the TypeScript resolver has no fallback at all. Backfill must be all-or-nothing per org and precede the V2 app release.
- **P0** Production has none of the 26 V2 migrations on `development` (assumed from `main` = 62 vs `development` = 88; **unverified**).
- **P1** Enforcement activation blocked on DEV (readiness 1/44) and would disable 8 of 9 modules at the Monks DEV location (intent unknown, D-5).
- **P1** Manual Preview org members have no location assignment (`no_access`) and the org holds real catalog data (D-3).
- **P1** A location `manager`/`assistant_manager` row anywhere grants org-wide Recipes/Inventory management (privilege spill, E-1).
- **P2** F-1: `kiosk_can_manage_location` ignores org membership/live session for the location-manager branch (D7 hardening proposed).
- **P2** Historical strategy SQL is invalid against the deployed schema (superseded, see MAPPING_PLAN §3).

## Invariants held

Ledger 88 · finance OFF · enforcement STAGED · 0 Overall Owners · `main` `5e5b7747` · Production, Neon untouched · V2-007 worktree intact.
