# Feature V2-005.006: Bar Inventory Location Scoping — Plan

- **Feature:** V2-005.006 Bar Inventory Location Scoping
- **Parent Issue:** #253 (The Lineup V2.0 Milestone #8)
- **Classification:** HYBRID Module
- **Target Branch:** `development`
- **Feature Branch:** `feature/v2.0-005-batch-b-inventory-recipes`
- **Worktree:** `.tmp/v2-005-batch-b`

---

## 1. Objectives

1. **Organization-Wide Catalog:** Maintain shared organization-wide identity for vendors (`inventory_vendors`), categories (`inventory_categories`), subcategories (`inventory_subcategories`), and products (`inventory_products`). Products are created/updated at the organization level without per-location duplication.
2. **Location-Scoped Operational State:** Strictly isolate operational state (`inventory_stock`, `inventory_adjustments`, `inventory_import_batches`, `inventory_import_rows`, `inventory_order_drafts`, `inventory_order_draft_items`, `inventory_date_lots`, `inventory_freshness_rules`, `inventory_saved_views`) to the verified active location.
3. **Canonical V2 Authorization:** Reconcile `private.inventory_can_access_location` and `private.inventory_is_manager` with V2 role hierarchy (`Overall Owner/Manager/Assistant Manager`, `Org Owner/GM`, and per-location `Manager/Assistant Manager`).
4. **Overall Actor Compatibility:** Update composite foreign keys referencing `memberships(organization_id, profile_id)` across all inventory tables to reference `profiles(id)` directly, ensuring Overall-only actors can operate without fake organization memberships.
5. **Stale-Context Protection:** Support `expectedContext` assertion via `assertWorkspaceExpectation` across all inventory Server Actions to prevent stale-tab mutations across locations.
6. **Module Availability:** Guard all operations using `guardModule({ module: "bar_inventory", organizationId, location })` and database-level `assert_location_module_enabled`.

---

## 2. Implementation Work Packages

- **B01:** Audit & documentation initialization (`PLAN.md`, `ENTRY_POINT_MATRIX.md`, `SCOPE_AND_SECURITY.md`, `TEST_MATRIX.md`, `STATUS.md`).
- **B02:** Database migration (`20261108160000_batch_b_inventory_recipes.sql`):
  - Update FKs on inventory tables to reference `profiles(id)`.
  - Introduce `private.inventory_live_session()`.
  - Introduce `private.inventory_profile_level(p_org, p_location, p_profile)`.
  - Reconcile `private.inventory_is_manager(p_org)`.
  - Reconcile `private.inventory_can_access_location(p_org, p_location)`.
  - Introduce RPC `public.inventory_location_authorized(p_org, p_location)`.
- **B03:** Data layer updates:
  - Create `src/features/bar-inventory/data/inventory-actor.ts` for authoritative server actor & verified location resolution.
  - Update `catalog-data.ts` to accept `locationId` parameter and remove legacy `getPrimaryLocation` fallback.
  - Update `history-data.ts` to accept `locationId` parameter.
  - Update `order-draft-data.ts` to strictly scope queries to verified location.
- **B04:** Server actions updates:
  - Update `inventory-actions.ts`, `import-actions.ts`, `order-draft-actions.ts` to accept `expectedContext`, assert workspace context, and pass verified location to `guardModule`.
- **B05:** UI & hooks updates:
  - Update `inventory-module.tsx`, `use-catalog-controller.ts`, `use-order-drafts.ts` to support `expectedContext` and handle location switching cleanly.
  - Update `restaurant-operations-app.tsx` to supply `expectedContext={workspaceExpectation}`.
- **B06:** Focused pgTAP, Vitest, real-JWT, and browser testing.
