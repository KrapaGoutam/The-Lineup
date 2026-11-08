# V2-005 Batch B: Bar Inventory & Recipes Location Scoping — COMPLETE (Awaiting Review)

Parent issue: #253 | Program: #248 | Milestone: #8 (The Lineup V2.0)
Branch: `feature/v2.0-005-batch-b-inventory-recipes` | Target: `development`
Worktree: `.tmp/v2-005-batch-b` | PR: [#315](https://github.com/KrapaGoutam/The-Lineup/pull/315)
Status: HALTED CLEANLY FOR CLAUDE CODE LOCAL INDEPENDENT REVIEWER

## Checklist

### STAGE 1 — AUDIT & PLAN

- [x] B00: Verify baseline git commit (`279909bcfa16e02af0d5acdf1e6796d28f6514e2`), initialize feature worktree & branch.
- [x] B01: Documentation suite initialization for 006 Bar Inventory and 007 Recipes (`PLAN.md`, `ENTRY_POINT_MATRIX.md`, `SCOPE_AND_SECURITY.md`, `ORGANIZATION_CATALOG_CONTRACT.md`, `TEST_MATRIX.md`, `STATUS.md`).
- [x] B02: Audit entry points and authorization seams: reconcile `private.inventory_can_access_location`, `private.inventory_is_manager`, `private.recipes_is_member`, `private.recipes_is_manager`, `private.recipes_begin`, and identify composite membership FKs blocking Overall actors.

### STAGE 2 — DATABASE MIGRATION & RECONCILIATION

- [x] B03: Single consolidated forward-only migration `20261108160000_batch_b_inventory_recipes.sql`:
  - Decouple composite membership FKs on inventory and recipe tables to `profiles(id)`.
  - Implement `private.inventory_live_session()`.
  - Implement `private.inventory_profile_level(p_org, p_location, p_profile)`.
  - Reconcile `private.inventory_is_manager(p_org)` and `private.inventory_can_access_location(p_org, p_location)`.
  - Add public RPC `public.inventory_location_authorized(p_org, p_location)`.
  - Reconcile `private.recipes_is_member(p_org)` and `private.recipes_is_manager(p_org)`.
  - Reconcile `private.recipes_begin(p_org)`.
  - Add public RPC `public.recipes_org_authorized(p_org)`.
- [x] B04: Replay migration locally and verify existing database pgTAP suites (100% pass across all 16 suites including 0033 and 0069).
- [x] B05: Regenerate database types (`src/types/database.generated.ts`).

### STAGE 3 — APPLICATION CODE & CONTEXT INTEGRATION

- [x] B06: Implement `src/features/bar-inventory/data/inventory-actor.ts` and `src/features/recipes/data/recipes-actor.ts` for authoritative context resolution.
- [x] B07: Update Bar Inventory data layer (`catalog-data.ts`, `history-data.ts`, `order-draft-data.ts`) to accept `locationId` parameter and eliminate `getPrimaryLocation` fallback.
- [x] B08: Update Bar Inventory server actions (`inventory-actions.ts`, `import-actions.ts`, `order-draft-actions.ts`) to accept and assert `expectedContext`, use verified active location, and pass location to `guardModule`.
- [x] B09: Update Recipes server actions (`recipe-actions.ts`, `recipe-management-actions.ts`, `recipe-write-actions.ts`, `recipe-image-actions.ts`) to accept and assert `expectedContext` and pass verified active location to `guardModule`.
- [x] B10: Update UI and hooks (`inventory-module.tsx`, `use-catalog-controller.ts`, `use-order-drafts.ts`, `restaurant-operations-app.tsx`) to propagate `workspaceExpectation`.

### STAGE 4 — COMPREHENSIVE VERIFICATION

- [x] B11: pgTAP database tests (`0069_batch_b_inventory_recipes.test.sql` 44/44 pass; `0033_bar_inventory_catalog.test.sql` 108/108 pass) covering location isolation, catalog sharing, Overall actors, direct PostgREST DML denial, and module gating.
- [x] B12: Vitest unit tests for actions, data, hooks, and domain rules (`npm run test` passed 249/249 test files, 3,342/3,342 tests).
- [x] B13: Real-JWT authorization suite (`tests/local/inventory-recipes-location.local.test.ts` 11/11 tests pass).
- [x] B14: Playwright browser acceptance test suite (`tests/local/ui/inventory-recipes-location.local.spec.ts` 9/9 tests pass across desktop, tablet, and mobile).
- [x] B15: Quality gates: `npm run check` (0 errors, 0 warnings), `npm run test` (100% pass), `npm run build` (compiled clean).

### STAGE 5 — DELIVERY & HANDOFF

- [x] B16: Finalize documentation (`EVIDENCE.md`, `STATUS.md`).
- [x] B17: Commit, push branch `feature/v2.0-005-batch-b-inventory-recipes`, and open single PR targeting `development` ([#315](https://github.com/KrapaGoutam/The-Lineup/pull/315)).
- [x] B18: Halt for independent reviewer handoff to Claude Code LOCAL.
