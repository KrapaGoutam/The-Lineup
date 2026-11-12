# THE LINEUP V2.0 — V2-008 MIGRATION & COMPATIBILITY (Batch A)

Issue [#256](https://github.com/KrapaGoutam/The-Lineup/issues/256) · parent #248 · branch `feature/v2-008-migration-compatibility` (base `development` `790fd2db560c41cb27affe98a70faeb7bd3f07cd`).

Previous feature **V2-007 is COMPLETE**: PR #324 merged as `790fd2db`, issue #255 closed. Its closeout evidence (Gate 7, Gate 8E/8F/8H, T5 exception, D7/hardware carry-forwards) lives in [007 STATUS](../docs/v2.0/features/007-clock-kiosk/STATUS.md), [HANDOFF](../docs/v2.0/features/007-clock-kiosk/HANDOFF.md) and [HOSTED_DEV_ACCEPTANCE](../docs/v2.0/features/007-clock-kiosk/HOSTED_DEV_ACCEPTANCE.md). The earlier Gate 7 task log remains in git history of `development`.

## Batch A — read-only discovery, reconciliation and planning (no writes, no source change)

- [x] A0: verified remotes (`development` = `790fd2db`, `main` = `5e5b7747`), no existing V2-008 branch/worktree; new worktree from `origin/development`.
- [x] A0: preserved the four uncommitted V2-007 closeout documents (verified against PR #324 `MERGED`, head `1d82adb`, merge `790fd2db`, #255 closed); old worktree and ignored evidence left intact.
- [x] A0: authoritative `CURRENT_STATE.md` entry; ROADMAP V2-007 closed / V2-008 in progress; `MIGRATION_STRATEGY.md` superseded-SQL pointer.
- [x] A1: Hosted DEV read-only inventory (ledger 88) → [INVENTORY.md](../docs/v2.0/features/008-migration-compatibility/001-existing-data-inventory/INVENTORY.md).
- [x] A2: organization/location mapping → [MAPPING_PLAN.md](../docs/v2.0/features/008-migration-compatibility/002-organization-location-backfill/MAPPING_PLAN.md).
- [x] A3: role mapping and privilege-expansion register → [ROLE_MAPPING_PLAN.md](../docs/v2.0/features/008-migration-compatibility/003-existing-role-migration/ROLE_MAPPING_PLAN.md).
- [x] A4: module-config / attendance / hosted-DEV / recovery sequencing → [BATCH_B_C_DEPENDENCIES.md](../docs/v2.0/features/008-migration-compatibility/BATCH_B_C_DEPENDENCIES.md).
- [x] A5: D7 location-scoped Kiosks design (+ finding F-1) → [D7 plan](../docs/v2.0/features/008-migration-compatibility/D7_LOCATION_SCOPED_KIOSK_PLAN.md).
- [x] A6: [decision register](../docs/v2.0/features/008-migration-compatibility/OWNER_DECISIONS_REQUIRED.md) and [HANDOFF.md](../docs/v2.0/features/008-migration-compatibility/HANDOFF.md).
- [x] Documentation checks: Prettier check, `git diff --check`; no application/database test suites run (documentation-only).
- [x] Local checkpoint commit on the feature branch (not pushed, no PR, no merge).

Result: **V2-008 BATCH A CONDITIONAL PASS — OWNER DECISIONS OUTSTANDING.**

## Current State & Next Step

- Resume from [V2-008 HANDOFF.md](../docs/v2.0/features/008-migration-compatibility/HANDOFF.md). State: Batch A complete; owner decisions D-2/D-2b/D-2c and D-9 gate Batch B; D-7 gates any Hosted DEV write.
- Next exact action: owner reviews the decision register; on **D-9** approval start Batch B step **B1 (D7 RPC migration + pgTAP on a local stack)**. Do not begin Batch B automatically.
- Do not: write to Hosted DEV / Production / Neon, create or apply real backfill SQL, archive fixtures, activate enforcement or finance, change attendance modes, create Overall Owners, re-run V2-007 acceptance, delete the V2-007 worktree, merge, or start V2-009.
- Hard invariants: ledger 88 · finance OFF · enforcement STAGED · 0 Overall Owners · `main` `5e5b7747`.
- Separate future task: Platform Overall Owner governance; not part of V2-008.
