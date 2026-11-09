# V2-005 Batch B: Bar Inventory & Recipes Location Scoping — REVIEWED, ROLLED OUT TO DEV, READY TO MERGE

Parent issue: #253 | Program: #248 | Milestone: #8 (The Lineup V2.0)
Branch: `feature/v2.0-005-batch-b-inventory-recipes` | Target: `development`
Worktree: `.tmp/v2-005-batch-b` | PR: [#315](https://github.com/KrapaGoutam/The-Lineup/pull/315)
Status: Stage 1 (Antigravity implementation) -> Stage 2 (independent review + corrections, Claude Code) -> Stage 3 (backup, rehearsal, hosted DEV migration) complete. Merge into `development` is the last step.

## Checklist

### STAGE 1 — IMPLEMENTATION (Antigravity)

- [x] B00-B18: baseline, docs suite, migration `20261108160000_batch_b_inventory_recipes.sql`, actor helpers, server actions, UI propagation, first test pass, PR #315.

### STAGE 2 — INDEPENDENT REVIEW AND CORRECTION (Claude Code)

- [x] R01: Reproduce both red CI assertions locally; root-cause them (0037: actor FKs re-created NOT DEFERRABLE under new names; 0039 and the hidden 0037 abort: fixtures used a multi-location Shift Manager with no assignment, which V2 denies).
- [x] R02: Fix the migration (original FK names and deferrability, `IF EXISTS` removed from drops) and the fixtures; add regressions (0039 +5).
- [x] R03: P0 found and fixed: `getInventoryActor` / `getRecipesActor` used `p_org` / `p_location` RPC argument names (actual: `p_organization_id` / `p_location_id`), so the actor was `null` for every user. RPC args now typed with `satisfies Database[...]["Args"]`.
- [x] R04: Hardening: live-session / profile-level helpers not client-executable; `inventory_is_manager` mirrors the Shift Manager rule; primary-location fallbacks removed; types regenerated; fixture no longer embeds keys.
- [x] R05: New tests: pgTAP 0070 (78), real-JWT +5 (16 total, incl. genuine sign-out revocation), Playwright content assertions (21 across desktop/tablet/mobile).
- [x] R06: Gates: `npm run check`, full Vitest (249 files / 3,342 passed / 7 skipped), production build, secret scan, exact-head CI green (`26ebe138`: application, browser-smoke, migrations-and-policies Files=72 Tests=2559, Vercel).

### STAGE 3 — CONTROLLED DEV ROLLOUT

- [x] D01: Fresh encrypted ledger-80 backup (`dev-20261109T065747Z.zip.dpapi`), hash-verified; isolated no-network restore (107 tables, 0 mismatches).
- [x] D02: Populated rehearsal on the restored real DEV data with the exact migration bytes: 76 data digests identical; catalog delta as designed; old-app/new-schema and new-app/old-schema compatibility executed.
- [x] D03: Hosted DEV migration 80 -> 81 via `db push --linked` (dry run listed only this file); enforcement STAGED, 0 module configs; data digests identical; catalog parity (2,761/2,763, remaining 2 = untouched CHECK deparse); rolled-back probe 94/94 (SQL-simulated roles).
- [ ] D04: Hosted authenticated UI acceptance: DEFERRED (no module configuration; none seeded).

### STAGE 4 — INTEGRATION

- [ ] M01: Final exact-head CI green on the docs/test-support head, Preview READY and DEV-bound.
- [ ] M02: Normal merge commit of PR #315 into `development` (no squash, no force); verify parents, development HEAD, Preview, `main` unchanged.
- [ ] M03: Update #253 (do not close); #248 and milestone #8 stay open.

## Current State & Next Step

- Migration (reviewed bytes): sha256 `ccd95597016a333b3f5982ebd00f02655689901cec59a69c0bbc5a14ee18ccc8`; already applied to hosted DEV (ledger 81). Never re-apply.
- Next: push the docs/test-support commit to PR #315, wait for exact-head CI, confirm Preview READY (DEV-bound), then merge PR #315 with a regular merge commit.
- Not in scope and not started: Inventory enhancement phases 1-2, V2-006 Attendance, V2-007 Clock Kiosk, any module-enforcement activation or module-config seeding.
- Accepted P2 residuals and the PROD pre-release read-only check (shift managers in multi-location orgs without a location assignment lose Bar Inventory): see `docs/v2.0/features/005-module-location-scoping/006-bar-inventory/EVIDENCE.md` section 3.
