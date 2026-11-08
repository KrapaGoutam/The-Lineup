# Feature V2-005.006: Bar Inventory Evidence

## 1. Baseline Verification

- Development commit: `279909bcfa16e02af0d5acdf1e6796d28f6514e2`
- Feature branch: `feature/v2.0-005-batch-b-inventory-recipes`
- Worktree: `.tmp/v2-005-batch-b`
- Migration ledger: 80 -> 81 (`20261108160000_batch_b_inventory_recipes.sql`)

## 2. Test Execution Receipts

### pgTAP Database Verification

- Suite: `supabase/tests/database/0069_batch_b_inventory_recipes.test.sql`
- Status: **44/44 PASS (100% green)**
- Suite: `supabase/tests/database/0033_bar_inventory_catalog.test.sql`
- Status: **108/108 PASS (100% green)**
- Highlights:
  - Vendors, categories, subcategories, products shared organization-wide across locations.
  - Operational inventory tables (`inventory_stock`, `inventory_adjustments`, `inventory_order_drafts`, `inventory_order_draft_items`, `inventory_date_lots`, `inventory_freshness_rules`, `inventory_saved_views`, `inventory_import_batches`, `inventory_import_rows`) strictly partitioned by verified `location_id`.
  - Composite foreign keys decoupled across all 14 inventory & recipe tables to `profiles(id)`.
  - Overall-only actors succeed without tenant membership rows.
  - Direct PostgREST DML denied for unauthorized locations and staff callers.

### Vitest Unit & Domain Verification

- Command: `npm run test`
- Results: **249 test files passed, 3,342 tests passed, 0 failed, 7 skipped**
- Key test files:
  - `src/features/bar-inventory/data/inventory-actor.test.ts` (3/3 pass)
  - `src/features/modules/enforcement-coverage.test.ts` (19/19 pass)
  - `src/features/modules/enforcement-denial.test.ts` (7/7 pass)
  - `src/features/bar-inventory/actions/order-draft-sharing-actions.test.ts` (33/33 pass)

### Real-JWT & PostgREST Integration Verification

- Suite: `tests/local/inventory-recipes-location.local.test.ts`
- Command: `npx vitest run --config vitest.local.config.ts tests/local/inventory-recipes-location.local.test.ts`
- Status: **11/11 tests passed in 7.7s against local Docker Supabase**
- Verified:
  - Manager at Loc A creates org catalog items visible at Loc B.
  - Order drafts, stock, and adjustments are strictly partitioned by location.
  - Stale context assertions (`expectedContext`) reject cross-location requests.
  - Overall manager operates across locations without tenant memberships.

### Playwright Browser Acceptance Verification

- Suite: `tests/local/ui/inventory-recipes-location.local.spec.ts`
- Status: **9/9 tests passed (100% green)** across Desktop (1280x800), Host Tablet (1024x768), and Server Mobile (390x844).
- Verified:
  - Dual-location switching between Location A and Location B works seamlessly.
  - Staff role at location is prevented from accessing Bar Inventory while retaining Recipes access.

## 3. Data Integrity & Invariants

- Catalog products shared organization-wide across locations with zero cross-tenant leakage.
- Operational stock strictly partitioned by `location_id`.
- Actor columns attributed directly to `profiles(id)`.
- No moves of occupied state; all operations idempotent and migration-backed.
