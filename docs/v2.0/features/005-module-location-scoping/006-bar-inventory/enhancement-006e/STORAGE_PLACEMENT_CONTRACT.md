# Feature V2-005.006-E: Physical Storage & Placement Contract (Option A)

## 1. Locked Architectural Decision: Option A (Placement Only)

Physical storage placement indicates **where** products are located within a restaurant branch. It does **not** create independent stock ledgers or quantities per position.

### Mandatory Invariants:

1. **Zero Stock Duplication:** There is only one authoritative stock record per `(location_id, product_id)` in `inventory_stock`.
2. **No Quantity on Placements:** Placement records contain physical location metadata only (`storage_area_id`, `shelf_id`, `slot_number`, `slot_label`, `display_order`). They contain no quantity fields.
3. **No Automatic Stock Changes:** Moving, adding, or deleting a product placement does **not** adjust inventory stock, trigger an adjustment, or create a ledger record.
4. **Multiple Placements Supported:** A product may be assigned to multiple storage positions (e.g. "Cooler 1 Top Shelf" and "Speed Rail") without duplicating stock totals.
5. **No Stock Summing:** Authoritative stock is never computed by summing placements.
6. **Date Groups Independent:** Date groups remain location-scoped and independent of physical placements.
7. **Optional Placement:** A product is not required to have a placement. Unassigned products are displayed under "Unassigned Storage".

---

## 2. Relational Hierarchy

```text
Restaurant Branch (public.locations)
  └── Storage Area (public.inventory_storage_areas) [e.g. Cooler 1, Walk-in Cooler, Back Bar]
        └── Storage Shelf / Section (public.inventory_storage_shelves) [e.g. Top Shelf, Middle Shelf]
              └── Product Placement (public.inventory_storage_placements) [e.g. Slot L1 -> Bud Light]
```

### Table Definitions:

### 2.1 `public.inventory_storage_areas`

- `id`: UUID Primary Key.
- `organization_id`: UUID NOT NULL, references `organizations(id)`.
- `location_id`: UUID NOT NULL.
- Foreign Key: `(location_id, organization_id)` references `locations(id, organization_id)`.
- `name`: TEXT NOT NULL (1 to 120 chars, trimmed).
- `kind`: TEXT NOT NULL default `'cooler'` (`'cooler'`, `'freezer'`, `'back_bar'`, `'shelf_rack'`, `'cabinet'`, `'dry_storage'`, `'other'`).
- `display_order`: INTEGER NOT NULL default 0.
- `active`: BOOLEAN NOT NULL default true.
- `version`: INTEGER NOT NULL default 1.
- `created_at` / `updated_at`: TIMESTAMPTZ NOT NULL default `now()`.
- `created_by` / `updated_by`: UUID references `profiles(id)` `DEFERRABLE INITIALLY DEFERRED`.

### 2.2 `public.inventory_storage_shelves`

- `id`: UUID Primary Key.
- `organization_id`: UUID NOT NULL, references `organizations(id)`.
- `location_id`: UUID NOT NULL.
- `storage_area_id`: UUID NOT NULL references `inventory_storage_areas(id)`.
- Foreign Key: `(storage_area_id, location_id, organization_id)` references `inventory_storage_areas(id, location_id, organization_id)`.
- `section_name`: TEXT NULL (1 to 120 chars, optional sub-grouping like "Right Window").
- `name`: TEXT NOT NULL (1 to 120 chars, e.g. "Top Shelf", "Shelf 1").
- `display_order`: INTEGER NOT NULL default 0.
- `created_at` / `updated_at`: TIMESTAMPTZ NOT NULL default `now()`.
- `created_by` / `updated_by`: UUID references `profiles(id)` `DEFERRABLE INITIALLY DEFERRED`.

### 2.3 `public.inventory_storage_placements`

- `id`: UUID Primary Key.
- `organization_id`: UUID NOT NULL, references `organizations(id)`.
- `location_id`: UUID NOT NULL.
- `storage_area_id`: UUID NOT NULL.
- `shelf_id`: UUID NOT NULL references `inventory_storage_shelves(id)`.
- `product_id`: UUID NOT NULL references `inventory_products(id)`.
- Foreign Key: `(shelf_id, storage_area_id, location_id, organization_id)` references `inventory_storage_shelves(id, storage_area_id, location_id, organization_id)`.
- Foreign Key: `(product_id, organization_id)` references `inventory_products(id, organization_id)`.
- `slot_number`: INTEGER NULL.
- `slot_label`: TEXT NULL (e.g. "L1", "L2", "R1").
- `display_order`: INTEGER NOT NULL default 0.
- `version`: INTEGER NOT NULL default 1.
- `created_at` / `updated_at`: TIMESTAMPTZ NOT NULL default `now()`.
- `created_by` / `updated_by`: UUID references `profiles(id)` `DEFERRABLE INITIALLY DEFERRED`.

---

## 3. Storage Security & Verification

- `ENABLE ROW LEVEL SECURITY` on all three tables.
- `REVOKE ALL ON ... FROM public, anon, authenticated;`
- `GRANT SELECT ON ... TO authenticated;`
- Read policy: `USING (private.inventory_can_access_location(organization_id, location_id))` paired with backend module enforcement restrictive policy.
- Write access: Restricted to `SECURITY DEFINER` RPCs (`inventory_storage_area_upsert`, `inventory_storage_area_archive`, `inventory_storage_shelf_upsert`, `inventory_storage_shelf_delete`, `inventory_storage_placement_set`, `inventory_storage_placement_delete`, `inventory_storage_placement_reorder`).
- Every RPC calls `v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);` verifying caller authorization, location activity, and module availability.
