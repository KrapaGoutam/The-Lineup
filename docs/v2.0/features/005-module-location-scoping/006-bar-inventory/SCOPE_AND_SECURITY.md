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
- **Level 2 (Assistant Manager):** Overall Assistant Manager, Location Assistant Manager, or Org Shift Manager (if single location / fallback).
- **Level 1 (Staff):** Denied access to Bar Inventory.
- **Level 0 (None):** Denied.

### 2.2 Seams

- `private.inventory_can_access_location(p_org, p_location)`: Checks `inventory_profile_level >= 2` and active location status.
- `private.inventory_is_manager(p_org)`: Checks overall manager/owner, org manager/owner, or any active location manager in that org.
- `private.inventory_begin(p_org, p_location)`: Enforces `inventory_can_access_location` and `assert_location_module_enabled(p_location, 'bar_inventory')`.

## 3. Foreign Key Decoupling for Overall Actors

Older inventory migrations constrained `created_by` / `updated_by` / `actor_profile_id` to `public.memberships(organization_id, profile_id)`.
Under V2, Overall users have entries in `auth.users` and `public.profiles`, but not necessarily in `public.memberships`.
The migration decouples these foreign keys to `foreign key (actor_column) references public.profiles(id)`.
Actor attribution is preserved and genuine; no fake organization memberships are required. Direct client manipulation is prevented because all tables have `REVOKE INSERT, UPDATE, DELETE FROM authenticated;` and all writes execute through `SECURITY DEFINER` RPCs that derive `v_actor := auth.uid()`.
