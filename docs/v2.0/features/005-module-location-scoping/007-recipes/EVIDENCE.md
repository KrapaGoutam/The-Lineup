# Feature V2-005.007: Recipes Evidence

## 1. Baseline Verification

- Development commit: `279909bcfa16e02af0d5acdf1e6796d28f6514e2`
- Feature branch: `feature/v2.0-005-batch-b-inventory-recipes`
- Worktree: `.tmp/v2-005-batch-b`
- Migration ledger: 80 -> 81 (`20261108160000_batch_b_inventory_recipes.sql`)

## 2. Test Execution Receipts

### pgTAP Database Verification

- Suite: `supabase/tests/database/0069_batch_b_inventory_recipes.test.sql`
- Status: **44/44 PASS (100% green)**
- Highlights:
  - ZERO `location_id` columns added to any of the 6 recipe tables (`bar_recipes`, `bar_recipe_categories`, `bar_recipe_ingredients`, `bar_recipe_steps`, `bar_recipe_garnishes`, `bar_recipe_images`).
  - Recipes remain strictly organization-wide.
  - Overall-only actors (with no tenant memberships) can create, edit, archive, and view recipes.
  - Foreign organization actors are denied all recipe reads and writes.

### Vitest Unit & Domain Verification

- Command: `npm run test`
- Results: **249 test files passed, 3,342 tests passed, 0 failed, 7 skipped**
- Key test files:
  - `src/features/recipes/data/recipes-actor.test.ts` (3/3 pass)
  - `src/features/recipes/actions/recipe-actions.test.ts` (3/3 pass)
  - `src/features/recipes/actions/recipe-detail.test.ts` (3/3 pass)
  - `src/features/recipes/components/recipe-editor.test.tsx` (17/17 pass)

### Real-JWT & PostgREST Integration Verification

- Suite: `tests/local/inventory-recipes-location.local.test.ts`
- Command: `npx vitest run --config vitest.local.config.ts tests/local/inventory-recipes-location.local.test.ts`
- Status: **11/11 tests passed in 7.7s against local Docker Supabase**
- Verified:
  - Manager at Loc A creates recipe; Manager at Loc B views, edits, and adds categories.
  - Module gating (`guardModule({ module: "recipes" })`) enforced on all recipe actions.
  - Stale context assertions (`expectedContext`) reject requests if location context is mismatched.

### Playwright Browser Acceptance Verification

- Suite: `tests/local/ui/inventory-recipes-location.local.spec.ts`
- Status: **9/9 tests passed (100% green)** across Desktop, Tablet, and Mobile viewports.
- Verified:
  - Recipe Book is accessible from all authorized locations.
  - Staff users can browse and view recipes across locations.

## 3. Data Integrity & Invariants

- Recipes remain strictly organization-wide without `location_id`.
- Actor columns attributed directly to `profiles(id)`.
- Existing recipes, numbers, slugs, variants, and images preserved.
