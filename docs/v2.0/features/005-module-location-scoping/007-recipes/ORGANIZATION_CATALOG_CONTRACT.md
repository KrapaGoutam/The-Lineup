# Feature V2-005.007: Recipes Organization Catalog Contract

## 1. Locked Architecture Decisions

1. **Strictly Organization-Owned:**
   - Canonical tables:
     - `bar_recipe_categories`
     - `bar_recipes`
     - `bar_recipe_variants`
     - `bar_recipe_ingredients`
     - `bar_recipe_steps`
     - `bar_recipe_garnishes`
   - None of these tables contain a `location_id` column.
   - All rows are keyed by `(id, organization_id)`.
   - Recipe numbers (`recipe_number`) are unique per organization: `UNIQUE (organization_id, recipe_number)`.
   - Slugs (`slug`) are unique per organization: `UNIQUE (organization_id, slug)`.

2. **Cross-Location Invariance:**
   - When a user assigned to Location A and Location B switches locations within the same organization, the recipe catalog is identical.
   - Recipe edits performed while viewing from Location A are immediately reflected across the entire organization.
   - When switching to a different organization, only that organization's recipe book is accessible.

3. **Module Gating vs Data Ownership:**
   - Data ownership is organization-scoped.
   - Module availability is per-location: if `recipes` is disabled at Location X, a user at Location X cannot access the recipes tab from that location.
   - This distinction is enforced by `guardModule({ module: "recipes", organizationId, location })` on the server action boundary.

4. **Foreign Key Decoupling for Overall Actors:**
   - `bar_recipe_categories`: `created_by`, `updated_by` reference `public.profiles(id)`.
   - `bar_recipes`: `created_by`, `updated_by`, `archived_by` reference `public.profiles(id)`.
   - Overall Owner / Manager can create, edit, and archive recipes without needing artificial rows in `public.memberships`.
