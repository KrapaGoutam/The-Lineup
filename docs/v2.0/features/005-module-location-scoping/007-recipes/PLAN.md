# Feature V2-005.007: Recipes Organization-Wide Compatibility — Plan

- **Feature:** V2-005.007 Recipes Organization-Wide Compatibility
- **Parent Issue:** #253 (The Lineup V2.0 Milestone #8)
- **Classification:** ORGANIZATION Module
- **Target Branch:** `development`
- **Feature Branch:** `feature/v2.0-005-batch-b-inventory-recipes`
- **Worktree:** `.tmp/v2-005-batch-b`

---

## 1. Objectives

1. **Organization-Wide Catalog:** Maintain the single canonical recipe book per organization. Do NOT add `location_id` to any of the six recipe tables (`bar_recipe_categories`, `bar_recipes`, `bar_recipe_variants`, `bar_recipe_ingredients`, `bar_recipe_steps`, `bar_recipe_garnishes`).
2. **Location Independence:** Switching locations within the same organization displays the exact same shared recipes, numbers, categories, images, and variants. Switching organizations displays only that organization's recipe book.
3. **Canonical V2 Authorization:** Reconcile `private.recipes_is_member`, `private.recipes_is_manager`, and `private.recipes_begin` with V2 role hierarchy:
   - Overall Owner / Manager / Assistant Manager have full access across all tenants without needing fake memberships.
   - Location Managers / Assistant Managers have management authority for recipes within their organization.
   - Location Staff have read-only access to active recipes.
4. **Overall Actor Compatibility:** Update composite foreign keys referencing `memberships(organization_id, profile_id)` on `bar_recipe_categories` (`created_by`, `updated_by`) and `bar_recipes` (`created_by`, `updated_by`, `archived_by`) to reference `profiles(id)` directly.
5. **Private Storage Security:** Preserve private bucket `recipe-images` and signed URL access rules, allowing authorized overall users and organization members to access images.
6. **Module Enforcement:** Gating by `guardModule({ module: "recipes", organizationId, location })` respects whether the module is enabled at the caller's active location, keeping module gating and data ownership conceptually distinct.

---

## 2. Implementation Work Packages

- **R01:** Audit & documentation initialization (`PLAN.md`, `ENTRY_POINT_MATRIX.md`, `ORGANIZATION_CATALOG_CONTRACT.md`, `TEST_MATRIX.md`, `STATUS.md`).
- **R02:** Database migration (`20261108160000_batch_b_inventory_recipes.sql`):
  - Decouple FKs on `bar_recipe_categories` and `bar_recipes` to `profiles(id)`.
  - Reconcile `private.recipes_is_member(p_org)`.
  - Reconcile `private.recipes_is_manager(p_org)`.
  - Reconcile `private.recipes_begin(p_org)`.
  - Introduce RPC `public.recipes_org_authorized(p_org)`.
- **R03:** Server actions updates:
  - Update `recipe-actions.ts`, `recipe-management-actions.ts`, `recipe-write-actions.ts`, `recipe-image-actions.ts` to accept `expectedContext` and pass verified location context to `guardModule`.
- **R04:** UI & hooks updates:
  - Update `recipes-module.tsx` and child components to accept and propagate `expectedContext`.
  - Update `restaurant-operations-app.tsx` to supply `expectedContext={workspaceExpectation}`.
- **R05:** Focused pgTAP, Vitest, real-JWT, and browser testing.
