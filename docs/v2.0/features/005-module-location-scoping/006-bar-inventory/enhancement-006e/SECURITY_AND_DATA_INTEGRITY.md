# Feature V2-005.006-E: Security & Data Integrity

## 1. Scope & Tenant Isolation

- **Organization-Wide Identity:** Products, Vendors, Categories, and Subcategories remain organization-wide. A placement in Location A references the same product UUID as in Location B.
- **Location Isolation:** Storage Areas, Shelves, and Placements are strictly bound to a single restaurant location `(location_id, organization_id)`.
- Foreign key constraints ensure a shelf cannot reference an area from another location, and a placement cannot reference a shelf or product from another organization.

---

## 2. Authorization Rules

- Authorization evaluates via `private.inventory_profile_level(organization_id, location_id, auth.uid()) >= 2`.
- **Allowed Roles:**
  - Overall Owner, Overall Manager, Overall Assistant Manager.
  - Organization Owner, Organization General Manager.
  - Location Manager, Location Assistant Manager (via `location_memberships`).
  - Shift Manager in a single-location organization (fallback).
- **Denied Roles:**
  - Staff (level 1).
  - Shift Manager in a multi-location organization without explicit assignment at the target branch.
  - Unauthenticated callers (`anon`).
  - Banned or revoked profiles.
  - Callers targeting inactive or archived locations.
- **Overall Actor Compatibility:**
  - Storage area and placement actor foreign keys (`created_by`, `updated_by`) reference `public.profiles(id)` directly (DEFERRABLE INITIALLY DEFERRED).
  - Overall managers and owners without tenant memberships can manage storage layouts cleanly without foreign key violations.

---

## 3. Data Integrity & RPC Seams

- Direct `INSERT`, `UPDATE`, `DELETE` grants are revoked from `authenticated` on `inventory_storage_areas`, `inventory_storage_shelves`, and `inventory_storage_placements`.
- All writes execute through dedicated `SECURITY DEFINER` RPCs:
  - `inventory_storage_area_upsert`
  - `inventory_storage_area_archive`
  - `inventory_storage_shelf_upsert`
  - `inventory_storage_shelf_delete`
  - `inventory_storage_placement_set`
  - `inventory_storage_placement_delete`
  - `inventory_storage_placement_reorder`
  - `inventory_date_group_import_commit`
- Every RPC initiates with:
  ```sql
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
  ```
  enforcing live session, active branch validation, role tier check, and backend module enablement (`bar_inventory`).
- **No Stock Adjustments on Placement Mutations:** Placement RPCs never write to `inventory_stock` or `inventory_adjustments`.
