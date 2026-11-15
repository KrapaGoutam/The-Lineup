# Feature V2-005.006: Bar Inventory Scope & Security Architecture

## 1. Scope Segregation

### 1.1 Organization-Level Reference Data (Shared)

- `inventory_vendors`: Vendors are created once per organization.
- `inventory_categories`: High-level categories (e.g. Spirits, Wine, Beer).
- `inventory_subcategories`: Granular groupings (e.g. Vodka, Tequila, IPA).
- `inventory_products`: Master catalog items with unit types, bottle sizes, and SKUs.
- Multi-location behavior: Location A and Location B share the identical product UUID for Tito's Vodka 750 mL.

### 1.2 Location-Level Operational State (Isolated)

- `inventory_stock`: On-hand, backup, cutoff, warning, par, version, last_adjusted_at.
- `inventory_adjustments`: Append-only audit history of quantity changes.
- `inventory_import_batches` & `inventory_import_rows`: Bulk count / delivery restock batches.
- `inventory_order_drafts` & `inventory_order_draft_items`: Vendor order drafts.
- `inventory_date_lots`: Expiration / manufacture tracking per lot at this location.
- `inventory_freshness_rules`: Custom freshness rules per location.
- `inventory_saved_views`: Manager view preferences scoped to `(profile_id, location_id, organization_id)`.

## 2. Authorization & Role Resolution

### 2.1 Role Evaluation Hierarchy

Authorization evaluates:
$$\text{effective\_tier} = \max(\text{overall\_tier}, \text{location\_tier})$$

Where:

- **Level 4 (Owner):** Overall Owner or Organization Owner.
- **Level 3 (Manager):** Overall Manager, Organization General Manager, or Location Manager (via `location_memberships`).
- **Level 2 (Assistant Manager):** Overall Assistant Manager, Location Assistant Manager, or an org-role Shift Manager **only in a single-active-location organization** (fallback). In a multi-location organization a Shift Manager needs an explicit location assignment (ACCESS_MODEL 4.2/5: no assignment and no Overall role = denied).
- **Level 1 (Staff):** Denied access to Bar Inventory.
- **Level 0 (None):** Denied.

### 2.2 Seams

- `private.inventory_can_access_location(p_org, p_location)`: Checks `inventory_profile_level >= 2` and active location status.
- `private.inventory_is_manager(p_org)`: Catalog read tier. Overall Owner/Manager/Assistant, org Owner/General Manager, a Shift Manager in a single-location organization, or any active location Manager/Assistant Manager in that organization (mirrors `inventory_profile_level`).
- `private.inventory_begin(p_org, p_location)`: Enforces `inventory_can_access_location` and `assert_location_module_enabled(p_location, 'bar_inventory')`.

## 3. Foreign Key Decoupling for Overall Actors

Older inventory migrations constrained `created_by` / `updated_by` / `actor_profile_id` to `public.memberships(organization_id, profile_id)`.
Under V2, Overall users have entries in `auth.users` and `public.profiles`, but not necessarily in `public.memberships`.
The migration re-points these foreign keys to `public.profiles(id)` **keeping each constraint's original name and original deferrability**: the 20 Inventory actor FKs stay `DEFERRABLE INITIALLY DEFERRED` (so ledger writes and tenant teardown can cascade in any order; pgTAP BI-IMP-DB-001) and the 5 Recipes FKs stay non-deferrable. Drops are not `IF EXISTS`, so a wrong constraint name fails the migration instead of silently leaving the membership FK behind.
A profile FK only proves the profile exists, so attribution integrity rests on the write path, not the FK: no client write privilege on any of the 19 tables, and every writer is a `SECURITY DEFINER` RPC that derives the actor from `auth.uid()` and accepts no actor parameter (asserted in pgTAP 0070 RV-048..RV-051). No fake organization memberships are required. Direct client manipulation is prevented because the tables grant `authenticated` no INSERT/UPDATE/DELETE and all writes execute through `SECURITY DEFINER` RPCs that derive `v_actor := auth.uid()`.

## 4. Session and helper exposure

`private.inventory_live_session()` (Supabase session liveness: unbanned user and, when the JWT carries `session_id`, an unexpired session row) and `private.inventory_profile_level(org, location, profile)` are **not** client-executable; only the SECURITY DEFINER helpers call them. The app-facing RPCs are `public.inventory_location_authorized(p_organization_id, p_location_id)` and `public.recipes_org_authorized(p_organization_id)`; callers must use exactly those argument names (the app types them against the generated `Database` types).
